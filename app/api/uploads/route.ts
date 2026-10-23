import {withApi} from '@/lib/api';
import {body,clientById,db,insert,json,now} from '@/lib/server';
import {fleetJob} from '@/lib/fleet-server';
import {storageAdmin} from '@/lib/storage';
import {storageBucket} from '@/lib/supabase/config';
import {str} from '@/lib/domain';
import type {Member} from '@/lib/api-guard';
export const runtime='nodejs';
export const maxDuration=120;
type Intent={id:string;owner_id:string;kind:'document'|'fleet';client_id:string|null;import_id:string|null;object_key:string;name:string;mime:string;size:number;summary:string;status:string};
async function upload(req:Request,member:Member){try{
 const b=await body(req);
 if(b.action==='prepare'){
  const kind=b.kind,name=str(b.name,200),size=Number(b.size),mime=str(b.mime,150)||'application/octet-stream';
  if(!['document','fleet'].includes(kind)||!name||!Number.isSafeInteger(size)||size<1||size>(kind==='fleet'?30:10)*1024*1024)throw new Error('Archivo o tamaño no válido.');
  const ext=name.split('.').at(-1)?.toLowerCase();if(!(kind==='fleet'?['xlsx']:['pdf','docx','xlsx','csv','txt','png','jpg','jpeg']).includes(ext||''))throw new Error('Formato de archivo no admitido.');
  const clientId=kind==='document'?str(b.clientId):null,importId=kind==='fleet'?str(b.importId):null;
  if(clientId)await clientById(clientId);if(kind==='document'&&!clientId)throw new Error('Falta el cliente.');
  if(importId){const job=await fleetJob(importId);if(job.status!=='complete')throw new Error('Terminá de importar antes de conservar el archivo original.');}if(kind==='fleet'&&!importId)throw new Error('Falta la carga.');
  const id=crypto.randomUUID(),key=kind+'/'+id+'.'+ext;
  await db().batch([insert('upload_intents',{id,owner_id:member.id,kind,client_id:clientId,import_id:importId,object_key:key,name,mime,size,summary:str(b.summary,5000)})]);
  const {data,error}=await storageAdmin().createSignedUploadUrl(key,{upsert:false});if(error||!data)throw new Error('No se pudo preparar la carga privada.');
  return json({uploadId:id,path:data.path,token:data.token,bucket:storageBucket});
 }
 if(b.action==='finish'){
  const item=await db().prepare('SELECT * FROM upload_intents WHERE id=? AND owner_id=? FOR UPDATE').bind(str(b.uploadId),member.id).first<Intent>();if(!item)throw new Error('Carga no encontrada.');if(item.status==='complete')return json({saved:true});
  const {data,error}=await storageAdmin().download(item.object_key);if(error||!data)throw new Error('El archivo aún no está disponible. Volvé a intentar.');if(data.size!==item.size)throw new Error('El tamaño recibido no coincide con el archivo.');
  const bytes=await data.arrayBuffer();
  if(item.kind==='fleet'){
   const job=await fleetJob(item.import_id!);const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');if(hash!==job.file_hash)throw new Error('El archivo no coincide con el reporte importado.');
   await db().prepare('UPDATE fleet_imports SET source_key=? WHERE id=?').bind(item.object_key,job.id).run();
  }else{
   const ext=item.name.split('.').at(-1)?.toLowerCase(),extracted=['csv','txt'].includes(ext||'')?new TextDecoder().decode(bytes).slice(0,40000):'';
   await db().batch([insert('documents',{id:item.id,client_id:item.client_id,key:item.object_key,name:item.name,mime:item.mime,size:item.size,summary:item.summary,extracted_text:extracted,created_at:now()})]);
  }
  await db().prepare("UPDATE upload_intents SET status='complete',completed_at=now() WHERE id=?").bind(item.id).run();return json({saved:true});
 }
 throw new Error('Acción de archivo inválida.');
}catch(e){return json({error:(e as Error).message},400)}}
export const POST=withApi(upload);
