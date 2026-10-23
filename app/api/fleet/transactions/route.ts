import {withApi} from '@/lib/api';
export const runtime='nodejs';
export const maxDuration=120;
import {all,db,json} from '@/lib/server';
import {fleetFilters,purchase,refund,issue} from '@/lib/fleet-server';
import {validDate,str} from '@/lib/domain';
async function handleGET(req:Request){try{const p=new URL(req.url).searchParams,start=p.get('start')||'2000-01-01',end=p.get('end')||'2100-12-31';if(!validDate(start)||!validDate(end)||start>end)throw new Error('Período inválido.');const f=fleetFilters(p,start,end),kind=p.get('class');if(kind==='purchase')f.where+=` AND (${purchase})`;if(kind==='refund')f.where+=` AND (${refund})`;if(kind==='issue')f.where+=` AND (${issue})`;if(kind==='preauth')f.where+=" AND lower(t.kind)='pre-authorisation'";if(kind==='missing')f.where+=` AND (${purchase} OR ${refund}) AND t.product=''`;
 const search=str(p.get('q'),200);if(search){f.where+=" AND (t.transaction_id LIKE ? ESCAPE '\\' OR t.driver LIKE ? ESCAPE '\\' OR t.plate LIKE ? ESCAPE '\\' OR t.merchant LIKE ? ESCAPE '\\')";const q='%'+search.replace(/[\\%_]/g,'\\$&')+'%';f.args.push(q,q,q,q);}
 const page=Math.max(1,Math.min(100000,Number(p.get('page'))||1)),size=100,from='FROM fleet_current t JOIN fleet_accounts a ON a.account=t.account JOIN clients c ON c.id=a.client_id';const [count,rows]=await Promise.all([db().prepare(`SELECT count(*) AS n ${from} WHERE ${f.where}`).bind(...f.args).first<{n:number}>(),all(`SELECT t.*,a.client_id,c.name AS client_name ${from} WHERE ${f.where} ORDER BY t.date DESC,t.time DESC,t.transaction_id DESC LIMIT ? OFFSET ?`,...f.args,size,(page-1)*size)]);return json({total:count?.n||0,rows,page,size});}catch(e){return json({error:(e as Error).message},400);}}

export const GET=withApi(handleGET);
