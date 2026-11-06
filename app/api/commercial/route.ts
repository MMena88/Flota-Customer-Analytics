import {withApi} from '@/lib/api';
import {all,body,json,fingerprint} from '@/lib/server';
import {storageAdmin} from '@/lib/storage';
import {storageBucket} from '@/lib/supabase/config';
import {readCommercialReport,missingProductMessage,summarizeCommercial,matchCustomers,customerKey,type CommercialData,type CommercialHistory} from '@/lib/commercial';
import {commercialImportStatus,planCommercialRepair,planCommercialUpdate} from '@/lib/commercial-import';
import {compareCommercialVolume,ComparisonInputError} from '@/lib/commercial-comparison';
import {isFuelFamily} from '@/lib/commercial-products';
export const runtime='nodejs';export const maxDuration=120;
const key='commercial/current.json';
async function load():Promise<CommercialData>{const {data,error}=await storageAdmin().download(key,{cacheNonce:crypto.randomUUID()});if(error){if(String((error as {statusCode?:string}).statusCode)==='404'||String((error as {statusCode?:string}).statusCode)==='400'&&error.message.toLowerCase().includes('not found'))return {rows:[],updatedAt:'',source:'',paymentNames:[],history:[]};throw new Error('No se pudo leer la base de rentabilidad.')}return JSON.parse(await data!.text())}
export const GET=withApi(async(req,member)=>{
 const p=new URL(req.url).searchParams;
 if(p.get('view')==='imports')return json({...commercialImportStatus(await load()),canEdit:member.role!=='viewer'});
 const [data,accounts]=await Promise.all([load(),all<{source_name:string}>('SELECT source_name FROM fleet_accounts')]);
 const names=[...data.paymentNames,...accounts.map(a=>a.source_name)];
 if(p.get('view')==='volume-comparison'){
  try{return json(compareCommercialVolume(data.rows,names,data.confirmedNames||[],Object.fromEntries(p)));}
  catch(error){if(error instanceof ComparisonInputError)return json({error:error.message},400);throw error;}
 }
 const family=p.get('family');
 // The legacy empty product parameter means all products. An explicit sku can select a blank source reference.
 const product=p.get('sku')??(p.get('product')||undefined);
 if(family!==null&&(!isFuelFamily(family)||product!==undefined))return json({error:'Elegí un grupo de combustible válido o un producto individual.'},400);
 const metric=p.get('metric')==='productMargin'?'productMargin':'grossMargin';
 const confirmedNames=data.confirmedNames||[];
 const filters={confirmedNames,start:p.get('start')||'',end:p.get('end')||'',segment:p.get('segment')||'',product,family:family??undefined,groupFuels:p.get('groupFuels')==='1',search:p.get('search')||''};
 const result=summarizeCommercial(data.rows,names,metric,filters),full=summarizeCommercial(data.rows,names,metric,{confirmedNames});
 const dates=data.rows.map(r=>r.date).sort(),matches=matchCustomers(data.rows,names);
 const pending=[...matches.codes].filter(([k,v])=>matches.payment.has(k)&&v.size>1&&!confirmedNames.includes(k))
  .map(([k,v])=>({key:k,name:data.rows.find(r=>customerKey(r.name)===k)?.name||k,codes:[...v]}));
 const catalog=[...new Set(data.rows.map(r=>r.product))].sort();
 const scopeProducts=filters.segment?[...new Set(full.points.filter(r=>r.segment===filters.segment).map(r=>r.product))].sort():catalog;
 return json({...result,pending,segments:[...new Set([...data.rows.map(x=>x.segment),...full.points.map(x=>x.segment)])].sort(),
  sourceSegments:[...new Set(data.rows.map(x=>x.segment))].sort(),products:catalog.filter(Boolean),scopeProducts,
  bounds:{first:dates[0]||'',last:dates.at(-1)||''},updatedAt:data.updatedAt,source:data.source,history:commercialImportStatus(data).history,totalRows:data.rows.length});
});

const maxCsv=30*1024*1024;
const jsonFile={contentType:'application/json',cacheControl:'0'};
const uuid=/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
function csvName(name:unknown){
 if(typeof name!=='string'||!name.toLowerCase().endsWith('.csv')||name.length>200)throw new Error('Seleccioná el CSV original de Commercial.');
 return name;
}
async function staged(path:unknown,memberId:string,folder:'uploads'|'staging'){
 const prefix='commercial/'+folder+'/'+memberId+'/';
 if(typeof path!=='string'||!path.startsWith(prefix)||!path.endsWith('.csv')||!uuid.test(path.slice(prefix.length,-4)))throw new Error('Archivo de carga inválido.');
 const {data,error}=await storageAdmin().download(path,{cacheNonce:crypto.randomUUID()});
 if(error||!data||!data.size||data.size>maxCsv)throw new Error('No se pudo leer el archivo preparado. Volvé a seleccionarlo.');
 return readCommercialReport(new Uint8Array(await data.arrayBuffer()));
}
async function saveActive(data:CommercialData) {
 const text=JSON.stringify(data), storage=storageAdmin();
 const write=await storage.upload(key,text,{...jsonFile,upsert:true});
 if(write.error)throw new Error('No se pudo guardar la base Commercial.');
 const check=await storage.download(key,{cacheNonce:crypto.randomUUID()});
 if(check.error||await check.data?.text()!==text)throw new Error('La escritura no se pudo verificar. Revisá el historial antes de volver a intentar.');
}
async function checkpoint(data:CommercialData) {
 const id=crypto.randomUUID(),path='commercial/versions/'+id+'.json',text=JSON.stringify(data),storage=storageAdmin();
 const result=await storage.upload(path,text,{...jsonFile,upsert:false});
 if(result.error)throw new Error('No se pudo crear el respaldo. Se conservó la base actual.');
 const copy=await storage.download(path,{cacheNonce:crypto.randomUUID()});
 if(copy.error||await copy.data?.text()!==text)throw new Error('El respaldo no pudo verificarse. Se conservó la base actual.');
 return id;
}
async function publish(current:CommercialData,rows:CommercialData['rows'],entry:CommercialHistory) {
 const backup=await checkpoint(current);
 const next={...current,rows,updatedAt:entry.at,source:entry.source,history:[{...entry,backup},...current.history].slice(0,30)};
 await saveActive(next);
 return {...commercialImportStatus(next),saved:true,rows:rows.length};
}
export const POST=withApi(async(req,member)=>{
 try{
  const b=await body(req);
  if(b.action==='prepare'){
   csvName(b.name);
   if(!Number.isInteger(b.size)||b.size<1||b.size>maxCsv)throw new Error('El máximo para un CSV Commercial es 30 MB.');
   const folder=b.purpose==='repair'?'staging':'uploads',path='commercial/'+folder+'/'+member.id+'/'+crypto.randomUUID()+'.csv';
   const {data,error}=await storageAdmin().createSignedUploadUrl(path);
   if(error||!data)throw new Error('No se pudo preparar el archivo.');
   return json({path,token:data.token,bucket:storageBucket});
  }
  const current=await load();
  if(b.action==='confirmName'||b.action==='paymentNames'){
   if(b.action==='confirmName'){
    if(typeof b.key!=='string'||!current.rows.some(r=>customerKey(r.name)===b.key))throw new Error('Cliente inválido.');
    current.confirmedNames=[...new Set([...(current.confirmedNames||[]),b.key])];
   }else{
    if(!Array.isArray(b.names)||b.names.length>20000||b.names.some((n:unknown)=>typeof n!=='string'||n.length>500))throw new Error('Lista de clientes inválida.');
    current.paymentNames=[...new Set<string>([...current.paymentNames,...b.names])];
   }
   await saveActive(current);return json({saved:true,rows:current.rows.length});
  }
  const latest=current.history[0];
  if((b.action==='finish'||b.action==='applyRepair')&&typeof b.token==='string'&&b.token===latest?.operation){
   return json({...commercialImportStatus(current),saved:true,rows:current.rows.length,alreadySaved:true});
  }
  if(b.action==='preview'||b.action==='finish'){
   const name=csvName(b.name),report=await staged(b.path,member.id,'uploads');
   if(report.kind!=='detail')throw new Error(missingProductMessage);
   if(commercialImportStatus(current).suspectRows)throw new Error('Primero repará la carga anterior sin producto en Carga diaria.');
   if(b.mode!==undefined&&!['rows','scopes'].includes(b.mode))throw new Error('Modo de actualización inválido.');
   const mode=b.mode==='scopes'?'scopes':'rows',plan=planCommercialUpdate(current.rows,report.rows,mode);
   const token=await fingerprint([current.updatedAt,current.rows,report,name,mode,member.id]);
   if(b.action==='preview')return json({token,...plan.summary});
   if((b.token!==undefined||mode==='scopes')&&b.token!==token)return json({error:'El histórico cambió. Revisá la vista previa otra vez antes de guardar.'},409);
   if(plan.rows===current.rows)return json({...commercialImportStatus(current),saved:true,rows:current.rows.length,unchanged:true});
   return json(await publish(current,plan.rows,{kind:'import',at:new Date().toISOString(),source:name,from:report.from,to:report.to,rows:report.rows.length,operation:token}));
  }
  if(b.action==='previewRepair'||b.action==='applyRepair'){
   const originalName=csvName(b.originalName);
   const [summary,original]=await Promise.all([staged(b.badPath,member.id,'staging'),staged(b.originalPath,member.id,'staging')]);
   const plan=planCommercialRepair(current,summary,original,originalName);
   const token=await fingerprint([current,summary,original,originalName,member.id,'repair']);
   if(b.action==='previewRepair')return json({...plan.summary,token});
   if(b.token!==token)return json({error:'Los datos cambiaron. Revisá de nuevo la reparación.'},409);
   const result=await publish(current,plan.rows,{kind:'repair',at:new Date().toISOString(),source:originalName,from:summary.from,to:summary.to,rows:plan.summary.restored,operation:token});
   // Only remove the two temporary copies made specifically for this repair.
   await storageAdmin().remove([b.badPath,b.originalPath]).catch(()=>{});
   return json({...result,repair:plan.summary});
  }
  if(b.action==='undo'){
   if(!latest||latest.kind!=='import'||!latest.backup||!uuid.test(latest.backup)||b.version!==current.updatedAt)return json({error:'La última carga cambió o no tiene un respaldo reversible.'},409);
   const snap=await storageAdmin().download('commercial/versions/'+latest.backup+'.json',{cacheNonce:crypto.randomUUID()});
   if(snap.error||!snap.data)throw new Error('No se encontró la versión anterior. Se conservó la base actual.');
   const previous:CommercialData=JSON.parse(await snap.data.text());
   if(!Array.isArray(previous.rows)||!Array.isArray(previous.history))throw new Error('El respaldo no es válido.');
   const at=new Date().toISOString(),backup=await checkpoint(current);
   const next={...current,rows:previous.rows,source:previous.source,updatedAt:at,history:[{kind:'undo' as const,at,source:latest.source,rows:latest.rows,from:latest.from,to:latest.to,backup},...current.history].slice(0,30)};
   await saveActive(next);return json({...commercialImportStatus(next),saved:true,rows:next.rows.length});
  }
  throw new Error('Acción inválida.');
 }catch(e){return json({error:(e as Error).message},400);}
},{serialize:true});
