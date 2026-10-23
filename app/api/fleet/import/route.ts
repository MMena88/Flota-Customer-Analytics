import {withApi} from '@/lib/api';
export const runtime='nodejs';
export const maxDuration=120;
import {signedDownload} from '@/lib/storage';
import {all,body,db,insert,json,now,checkOrigin} from '@/lib/server';
import {fleetJob,importFleetBatch,type FleetImport} from '@/lib/fleet-server';
import {str} from '@/lib/domain';
async function handlePOST(req:Request){try{
 checkOrigin(req);
 const b=await body(req);
 if(b.action==='start'){const hash=str(b.fileHash,64),source=str(b.source,250),total=Number(b.totalRows);if(!/^[a-f0-9]{64}$/.test(hash)||!source||!Number.isInteger(total)||total<1||total>250000)throw new Error('Archivo o cantidad de registros inválida.');const existing=await db().prepare('SELECT * FROM fleet_imports WHERE file_hash=?').bind(hash).first<FleetImport>();if(existing){if(existing.total_rows!==total)throw new Error('La cantidad de registros no coincide con la carga original.');if(existing.status==='discarded'){const active=await db().prepare("SELECT id FROM fleet_imports WHERE status='loading'").first();if(active)throw new Error('Completá o descartá la otra carga pendiente.');await db().prepare("UPDATE fleet_imports SET status='loading' WHERE id=?").bind(existing.id).run();return json({job:await fleetJob(existing.id),duplicate:false});}return json({job:existing,duplicate:existing.status==='complete'});}const pending=await all<FleetImport>("SELECT * FROM fleet_imports WHERE status='loading'");if(pending.length)return json({error:'Hay una carga pendiente. Reanudá el archivo '+pending[0].source+' o descartá esa carga antes de iniciar otra.',pending:pending[0]},409);const id=crypto.randomUUID();await db().batch([insert('fleet_imports',{id,file_hash:hash,source,total_rows:total,status:'loading',created_at:now()})]);return json({job:await fleetJob(id),duplicate:false});}
 const job=await fleetJob(str(b.importId));
 if(b.action==='batch')return json(await importFleetBatch(job,Number(b.offset),b.rows));
 if(b.action==='finish'){if(job.status==='complete')return json({job});if(job.status!=='loading'||job.processed!==job.total_rows)throw new Error('Faltan bloques por recibir. Seleccioná nuevamente el archivo para reanudar.');const check=await db().prepare('SELECT COALESCE(SUM(rows),0) AS n FROM fleet_batches WHERE import_id=?').bind(job.id).first<{n:number}>();if(check?.n!==job.total_rows)throw new Error('No se pudo conciliar la carga.');await db().batch([db().prepare("UPDATE fleet_imports SET status='complete',completed_at=? WHERE id=? AND status='loading'").bind(now(),job.id),db().prepare("UPDATE clients SET products=COALESCE((SELECT string_agg(DISTINCT t.product, ',') FROM fleet_current t JOIN fleet_accounts a ON a.account=t.account WHERE a.client_id=clients.id AND t.product<>'' AND lower(t.status)='approved' AND lower(t.kind)='spend'),'') WHERE products='' AND id IN (SELECT client_id FROM fleet_accounts)")]);return json({job:await fleetJob(job.id)});}
 if(b.action==='discard'){if(job.status!=='loading')throw new Error('Solo se puede descartar una carga incompleta.');await db().prepare("UPDATE fleet_imports SET status='discarded' WHERE id=? AND status='loading'").bind(job.id).run();return json({discarded:true});}
 throw new Error('Acción no válida.');
 }catch(e){return json({error:(e as Error).message},400);}}
async function handleGET(req:Request){try{const id=new URL(req.url).searchParams.get('id');if(!id)throw new Error('Falta la carga.');const job=await fleetJob(id);if(new URL(req.url).searchParams.has('download')){if(!job.source_key)throw new Error('El archivo original no está disponible.');return Response.redirect(await signedDownload(job.source_key,'Payment24-'+job.id+'.xlsx'),302);}return json({job});}catch(e){return json({error:(e as Error).message},400);}}

export const POST=withApi(handlePOST, {serialize:true});

export const GET=withApi(handleGET);
