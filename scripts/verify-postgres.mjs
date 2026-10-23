import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
import {applyMigrations} from './migration-runner.mjs';
process.env.NODE_ENV='test';
process.env.DATABASE_URL='postgres://test@localhost/test';
delete process.env.OPENAI_API_KEY;
const root=process.cwd(),tmp=path.join(root,'.tmp/verification');
await fs.mkdir(tmp,{recursive:true});
const names=['clients','workspace','import','activities','documents','markets','assistant','fleet','fleet/import','fleet/transactions','uploads'];
const files=['lib/domain.ts','lib/server.ts','lib/database.ts','lib/api-guard.ts','lib/api.ts','lib/auth.ts','lib/fleet-domain.ts','lib/fleet-server.ts','lib/payment-xlsx.ts','lib/supabase/config.ts',...names.map(x=>`app/api/${x}/route.ts`)];
for(const file of files){
 let code=ts.transpileModule(await fs.readFile(path.join(root,file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
 code=code.replace(/from ['"]@\/lib\/(.*?)['"]/g,(_,name)=>`from '${pathToFileURL(path.join(tmp,'lib',name+'.mjs'))}'`).replace(/from ['"]\.\/([^'"]+)['"]/g,(_,name)=>`from './${name}.mjs'`);
 const out=path.join(tmp,file.replace(/\.ts$/,'.mjs'));await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,code);
}
// Only Supabase's network boundary is mocked. Authentication policy, membership SQL,
// authorization guard, route handlers, SQL adapter and PostgreSQL engine are real.
await fs.writeFile(path.join(tmp,'lib/supabase/server.mjs'),`
const ids={editor:'00000000-0000-4000-8000-000000000001',viewer:'00000000-0000-4000-8000-000000000002',outsider:'00000000-0000-4000-8000-000000000003'};
const auth={async getUser(token){return ids[token]?{data:{user:{id:ids[token],email:'test@example.invalid',user_metadata:{}}},error:null}:{data:{user:null},error:{message:'Invalid session'}}}};
export const publicSupabase=()=>({auth});export const serverSupabase=async()=>({auth});`);
await fs.writeFile(path.join(tmp,'lib/storage.mjs'),`
export const objects=new Map();
export const storageAdmin=()=>({async createSignedUploadUrl(path){return {data:{path,token:'test-only-signed-token'},error:null}},async download(key){return objects.has(key)?{data:objects.get(key),error:null}:{data:null,error:new Error('missing')}}});
export const signedDownload=async(key,name)=>'https://storage.example.invalid/'+key+'?download='+encodeURIComponent(name);
export const privateStorage={async get(key){const b=objects.get(key);return b?{body:b.stream(),arrayBuffer:()=>b.arrayBuffer()}:null}};`);
const engine=new PGlite({parsers:{20:Number,1700:Number}});
await engine.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
await engine.exec('CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint)');
const migrationConnection={async query(sql,args){if(args)return engine.query(sql,args);const results=await engine.exec(sql);return results.at(-1)||{rows:[]};}};
await applyMigrations(migrationConnection,path.join(root,'supabase/migrations'),()=>{});
await applyMigrations(migrationConnection,path.join(root,'supabase/migrations'),()=>{});
assert.equal((await engine.query('SELECT count(*)::int AS n FROM app_private.schema_migrations')).rows[0].n,2);
assert.equal((await engine.query("SELECT public FROM storage.buckets WHERE id='puma-private'")).rows[0].public,false);
console.log('PASS Migrations apply once and create a private storage bucket');
await engine.exec("INSERT INTO app_private.app_members(user_id,role) VALUES ('00000000-0000-4000-8000-000000000001','editor'),('00000000-0000-4000-8000-000000000002','viewer')");
// PGlite is single-connection; serialize checkout while allowing concurrent requests.
let gate=Promise.resolve();
const database=await import(pathToFileURL(path.join(tmp,'lib/database.mjs')));
database.installTestDriver({async connect(){const previous=gate;let release;gate=new Promise(resolve=>release=resolve);await previous;return {async query(sql,args=[]){const r=await engine.query(sql,args);return {rows:r.rows,rowCount:r.affectedRows}},release};}});
const domain=await import(pathToFileURL(path.join(tmp,'lib/domain.mjs'))),routes={};
for(const name of names)routes[name]=await import(pathToFileURL(path.join(tmp,`app/api/${name}/route.mjs`)));
const {objects}=await import(pathToFileURL(path.join(tmp,'lib/storage.mjs')));
const one=async(sql)=>(await engine.query(sql)).rows[0];
async function clear(){await engine.exec('TRUNCATE app_private.clients,app_private.fleet_imports,app_private.imports,app_private.markets,app_private.revisions RESTART IDENTITY CASCADE');objects.clear();}
let tests=0;function ok(condition,message){assert.ok(condition,message);tests++;console.log('PASS '+message)}
async function response(name,payload,query='',token='editor',origin='https://puma.test'){
 const headers={...(token?{authorization:'Bearer '+token}:{}),...(payload?{'content-type':'application/json',origin}:{})};
 return routes[name][payload?'POST':'GET'](new Request('https://puma.test/api/'+name+query,{method:payload?'POST':'GET',headers,...(payload?{body:JSON.stringify(payload)}:{})}));
}
async function call(name,payload,query='',token='editor',origin='https://puma.test'){const r=await response(name,payload,query,token,origin);return {status:r.status,data:await r.json()};}
for(const [name,route]of Object.entries(routes)){for(const method of ['GET','POST'])if(route[method])assert.equal((await response(name,method==='POST'?{}:undefined,'',null)).status,401);}
ok(true,'Every API endpoint rejects unauthenticated requests');
ok((await call('workspace',undefined,'','outsider')).status===403,'An authenticated non-member cannot read business data');
ok((await call('clients',{name:'Forbidden',segment:'Test'},'','viewer')).status===403,'Viewer cannot write');
ok((await call('workspace',undefined,'','viewer')).status===200,'Viewer can read the workspace');
await engine.query("UPDATE app_private.app_members SET active=false WHERE role='editor'");
ok((await call('workspace')).status===403,'Revoked membership takes effect on the next request');
await engine.query("UPDATE app_private.app_members SET active=true WHERE role='editor'");
ok((await call('clients',{name:'Forbidden',segment:'Test'},'','editor','https://other.test')).status===403,'Cross-site writes blocked before handler');
for(const role of ['anon','authenticated']){await engine.exec('SET ROLE '+role);await assert.rejects(engine.query('SELECT * FROM app_private.clients'),/permission denied/);await engine.exec('RESET ROLE');}
ok(true,'Browser roles have no SQL access to private business data');
const {createApiGuard}=await import(pathToFileURL(path.join(tmp,'lib/api-guard.mjs')));
const transactional=createApiGuard(async()=>({id:'test',role:'editor'}),database.transaction);
const rollback=transactional(async()=>{await database.database.prepare("INSERT INTO imports(id,kind,source,created,updated,unchanged,created_at) VALUES ('rollback','test','test',0,0,0,'test')").run();return Response.json({error:'rejected'},{status:400})});
assert.equal((await rollback(new Request('https://puma.test',{method:'POST'}))).status,400);assert.equal((await one("SELECT count(*) AS n FROM app_private.imports WHERE id='rollback'")).n,0);
ok(true,'Rejected writes roll back their complete transaction');
const server=await import(pathToFileURL(path.join(tmp,'lib/server.mjs')));
ok(server.json({large:'x'.repeat(4_000_001)}).status===413,'Oversized responses return a useful filter error before the hosting limit');
ok(domain.validDate('2024-02-29')&&!domain.validDate('2026-02-29'),'Calendar dates validated');
assert.deepEqual(domain.priorPeriod('2026-10-01','2026-10-19'),{previousStart:'2026-09-12',previousEnd:'2026-09-30'});tests++;
assert.deepEqual(domain.parseDelimited('nombre;segmento\n"Prueba, SA";Industrial'),[{nombre:'Prueba, SA',segmento:'Industrial'}]);tests++;
assert.throws(()=>domain.parseDelimited('nombre,segmento\nA,B,C'));assert.throws(()=>domain.num('1,000','Volumen'));tests+=2;
ok(domain.num('0','Costo')===0&&domain.num('','Costo')===null,'Blank cost differs from zero');
ok((await call('clients',{name:'Incompleto'})).status===400,'Client requires name and segment');
const created=await call('clients',{name:'Cliente de prueba',segment:'Industria',code:'001'});ok(created.status===200&&created.data.client.code==='001','Create client preserves identifier');let client=created.data.client;
ok((await call('clients',{name:'Otro',segment:'Industria',code:'001'})).status===400,'Duplicate client code rejected');
ok((await call('clients',{...client,name:'Renombrado',updated_at:'stale'})).status===409,'Stale edits rejected');
const edited=await call('clients',{...client,strategic:true,notes:'Acuerdo comercial'});ok(edited.status===200&&edited.data.client.strategic===1,'Client enrichment saved');client=edited.data.client;
const clientRows=domain.parseDelimited('nombre\tsegmento\tcodigo\nCuenta B\tTransporte\t002');let cp=await call('import',{kind:'clients',rows:clientRows});ok(cp.data.created===1&&!cp.data.errors.length,'Preview of client import');
ok((await call('import',{kind:'clients',rows:clientRows,commit:true,token:cp.data.token})).data.saved,'Client import commits');
cp=await call('import',{kind:'clients',rows:clientRows});ok(cp.data.unchanged===1,'Identical client reimport is unchanged');
const rows=[{fecha:'2026-10-19',codigo:'001',producto:'Diésel',unidad:'gal',volumen:'1000',ingreso:'3500',costo:'3200'}];let p=await call('import',{kind:'records',rows});ok(p.data.created===1&&p.data.errors.length===0,'Daily preview resolves client code');
const first=await call('import',{kind:'records',rows,token:p.data.token,commit:true});ok(first.status===200&&first.data.created===1,'Daily import commits');
let work=await call('workspace',undefined,'?start=2026-10-01&end=2026-10-19');ok(work.data.records.length===1&&domain.aggregate(work.data.records).contribution===300,'Workspace reflects contribution');
const repeated=await call('import',{kind:'records',rows});ok(repeated.data.unchanged===1,'Identical daily reimport does not duplicate');
await call('import',{kind:'records',rows,token:repeated.data.token,commit:true});ok((await one('SELECT count(*) AS n FROM records')).n===1,'Only one record after reimport');
const corrected=[{...rows[0],volumen:'1100',ingreso:'3850',costo:'3520'}];p=await call('import',{kind:'records',rows:corrected});ok(p.data.updated===1,'Correction is identified');await call('import',{kind:'records',rows:corrected,token:p.data.token,commit:true});
ok((await one('SELECT count(*) AS n FROM records')).n===1&&(await one('SELECT volume FROM records')).volume===1100,'Correction replaces rather than accumulates volume');
ok((await one("SELECT count(*) AS n FROM revisions WHERE entity='records'")).n===2,'Old and new values retained in revisions');
ok((await call('import',{kind:'records',rows:[...rows,...rows]})).data.errors.length===1,'Duplicate rows in batch rejected');
ok((await call('import',{kind:'records',rows:[{...rows[0],codigo:'missing'}]})).data.errors.length===1,'Unknown client is not silently created');
ok((await call('import',{kind:'records',rows:corrected,token:'stale',commit:true})).status===409,'Stale import confirmation rejected');
const incomplete=[{...rows[0],fecha:'2026-10-18',costo:''}];p=await call('import',{kind:'records',rows:incomplete});await call('import',{kind:'records',rows:incomplete,token:p.data.token,commit:true});work=await call('workspace',undefined,'?start=2026-10-01&end=2026-10-19');ok(domain.aggregate(work.data.records).contribution===null,'Missing cost prevents false total contribution');
ok((await call('activities',{client_id:client.id,date:'2026-10-19',type:'Visita',title:'Reunión',body:'Pendiente propuesta'})).status===200,'Activity saved');
ok((await call('markets',{segment:'Industria',product:'Diésel',unit:'gal',start:'2026-10-01',end:'2026-10-19',total:'100',addressable:'101',source:'Prueba',scope:'Prueba'})).status===400,'Addressable market cannot exceed total');
const file=new Blob(['Notas de prueba'],{type:'text/plain'});
let prepared=await call('uploads',{action:'prepare',kind:'document',clientId:client.id,name:'notas.txt',mime:file.type,size:file.size,summary:'Documento de prueba'});
assert.equal(prepared.status,200,JSON.stringify(prepared.data));objects.set(prepared.data.path,file);
assert.equal((await call('uploads',{action:'finish',uploadId:prepared.data.uploadId})).status,200);
assert.equal((await call('uploads',{action:'finish',uploadId:prepared.data.uploadId})).status,200);
ok((await one('SELECT count(*) AS n FROM documents')).n===1,'Signed upload finalization is idempotent');
const doc=await one('SELECT id FROM documents');const downloaded=await response('documents',undefined,'?id='+doc.id);
ok(downloaded.status===302&&downloaded.headers.get('location').startsWith('https://storage.example.invalid/'),'Private download uses an authorized signed redirect');
prepared=await call('uploads',{action:'prepare',kind:'document',clientId:client.id,name:'bad.txt',size:99});objects.set(prepared.data.path,new Blob(['x']));
ok((await call('uploads',{action:'finish',uploadId:prepared.data.uploadId})).status===400,'Storage size mismatch cannot publish document metadata');
ok((await call('assistant',{question:'Resumí',start:'2026-10-01',end:'2026-10-19'})).status===503,'No simulated AI response without credentials');
const scenario=domain.pricing(100000,3.5,3.2,3.6,-.05);ok(Math.abs(scenario.base-30000)<1e-6&&Math.abs(scenario.proposed-38000)<1e-6&&Math.abs(scenario.maxLoss-.25)<1e-8,'Pricing and volume break-even are consistent');

export {engine,call,response,ok,routes,tmp,one,clear,objects};
await (await import('./verify-fleet.mjs')).default({engine,call,response,ok,tmp,one,clear,objects});
console.log(JSON.stringify({passed:tests,database:'PostgreSQL (PGlite)',externalAiCalls:0}));
await engine.close();
