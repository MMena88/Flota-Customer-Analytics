import {withApi} from '@/lib/api';
import {db,json} from '@/lib/server';
import {signedDownload} from '@/lib/storage';
export const runtime='nodejs';
async function download(req:Request){const id=new URL(req.url).searchParams.get('id'),doc=await db().prepare('SELECT key,name FROM documents WHERE id=?').bind(id).first<{key:string;name:string}>();if(!doc)return json({error:'Archivo no encontrado.'},404);return Response.redirect(await signedDownload(doc.key,doc.name),302);}
export const GET=withApi(download);
