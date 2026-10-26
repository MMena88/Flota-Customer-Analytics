import {AsyncLocalStorage} from 'node:async_hooks';
import {Pool,types} from 'pg';

// Values are bounded to safe integers at ingestion; aggregates remain JSON numbers.
types.setTypeParser(20, value=>Number(value));
types.setTypeParser(1700, value=>Number(value));
type Result={rows:Record<string,any>[];rowCount?:number|null};
export type Connection={query:(sql:string,args?:unknown[])=>Promise<Result>;release:()=>void};
type Driver={connect:()=>Promise<Connection>};
let driver:Driver|undefined;
const context=new AsyncLocalStorage<Connection>();
function getDriver(){
 if(driver)return driver;
 const value=process.env.DATABASE_URL||process.env.POSTGRES_URL;if(!value)throw new Error('Falta configurar la base de datos.');
 const url=new URL(value);const local=['localhost','127.0.0.1','::1'].includes(url.hostname);
 for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(key);
 driver=new Pool({connectionString:url.toString(),max:3,idleTimeoutMillis:10000,connectionTimeoutMillis:15000,allowExitOnIdle:true,ssl:local?false:{rejectUnauthorized:true,...(process.env.DATABASE_CA_CERT?{ca:process.env.DATABASE_CA_CERT}:{})},application_name:'puma-comercial'});
 return driver;
}
// This seam is available only to the isolated PostgreSQL verification harness.
export function installTestDriver(value:Driver){if(process.env.NODE_ENV!=='test')throw new Error('Test driver unavailable.');driver=value;}
export function postgresSql(sql:string){let n=0,quote='';let out='';for(let i=0;i<sql.length;i++){const c=sql[i];if(quote){out+=c;if(c===quote){if(sql[i+1]===quote){out+=sql[++i]}else quote=''}continue;}if(c==="'"||c==='"'){quote=c;out+=c}else out+=c==='?'?'$'+(++n):c;}return out;}
async function query(sql:string,args:unknown[]=[]):Promise<Result>{
 const conn=context.getStore();if(!conn)return transaction(()=>query(sql,args));
 try{return await conn.query(postgresSql(sql),args)}catch(error){const e=error as {code?:string};if(e.code)console.error('Database operation failed',{code:e.code});throw error;}
}
export class Statement{
 constructor(readonly sql:string,readonly args:unknown[]=[]){ }
 bind(...args:unknown[]){return new Statement(this.sql,args)}
 async all<T=Record<string,any>>(){return {results:(await query(this.sql,this.args)).rows as T[]}}
 async first<T=Record<string,any>>(){return ((await query(this.sql,this.args)).rows[0]??null) as T|null}
 async run(){const result=await query(this.sql,this.args);return {success:true,meta:{changes:result.rowCount??0}}}
}
export async function transaction<T>(fn:()=>Promise<T>,options:{readOnly?:boolean;serialize?:boolean}={}):Promise<T>{
 if(context.getStore())return fn();
 const conn=await getDriver().connect();
 try{await conn.query(options.readOnly?'BEGIN READ ONLY':'BEGIN');await conn.query('SET LOCAL search_path TO app_private, pg_catalog');await conn.query("SET LOCAL statement_timeout='90s'");if(options.serialize)await conn.query('SELECT pg_advisory_xact_lock(1827664101)');
  const result=await context.run(conn,fn);await conn.query('COMMIT');return result;
 }catch(error){await conn.query('ROLLBACK').catch(()=>{});throw error}finally{conn.release()}
}
export const database={prepare:(sql:string)=>new Statement(sql),batch:async(items:Statement[])=>transaction(async()=>{const results=[];for(const item of items)results.push(await item.run());return results})};
