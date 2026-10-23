import {createClient} from '@supabase/supabase-js';
import {storageBucket,supabaseConfig} from './supabase/config';
export function storageAdmin(){const c=supabaseConfig(),key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;if(!c||!key)throw new Error('El almacenamiento está pendiente de configuración.');return createClient(c.url,key,{auth:{persistSession:false,autoRefreshToken:false}}).storage.from(storageBucket);}
export async function signedDownload(key:string,name:string){const {data,error}=await storageAdmin().createSignedUrl(key,60,{download:name});if(error||!data)throw new Error('No se pudo preparar la descarga.');return data.signedUrl;}
export const privateStorage={async get(key:string){const {data,error}=await storageAdmin().download(key);if(error||!data)return null;return {body:data.stream(),arrayBuffer:()=>data.arrayBuffer()}}};
