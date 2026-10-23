import {withApi} from '@/lib/api';
export const runtime='nodejs';
export const maxDuration=120;
import {body,clientById,db,insert,json,now} from '@/lib/server';
import {str,validDate} from '@/lib/domain';
async function handlePOST(req:Request){try{const b=await body(req);await clientById(b.client_id);if(!validDate(b.date))throw new Error('Fecha inválida.');const a={id:crypto.randomUUID(),client_id:b.client_id,date:b.date,type:str(b.type)||'Nota',title:str(b.title),body:str(b.body,20000),created_at:now()};if(!a.title||!a.body)throw new Error('Completá título y detalle.');await db().batch([insert('activities',a)]);return json({activity:a});}catch(e){return json({error:(e as Error).message},400);}}

export const POST=withApi(handlePOST);
