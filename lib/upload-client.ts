'use client';
import {browserSupabase} from './supabase/client';
import {api} from '@/app/ui';
export async function uploadPrivateFile(file:File,metadata:{kind:'document'|'fleet';clientId?:string;importId?:string;summary?:string}){
 const prepared=await api<{uploadId:string;path:string;token:string;bucket:string}>('uploads',{action:'prepare',...metadata,name:file.name,size:file.size,mime:file.type});
 const {error}=await browserSupabase().storage.from(prepared.bucket).uploadToSignedUrl(prepared.path,prepared.token,file,{contentType:file.type||'application/octet-stream'});
 if(error)throw new Error('No se pudo enviar el archivo. Intentá nuevamente.');
 await api('uploads',{action:'finish',uploadId:prepared.uploadId});
}
