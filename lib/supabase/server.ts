import {cookies} from 'next/headers';
import {createServerClient} from '@supabase/ssr';
import {createClient} from '@supabase/supabase-js';
import {supabaseConfig} from './config';
import {AccessError} from '../api-guard';
export async function serverSupabase(){const c=supabaseConfig();if(!c)throw new AccessError('La conexión de Supabase está pendiente de configuración.',503);const jar=await cookies();return createServerClient(c.url,c.key,{cookies:{getAll:()=>jar.getAll(),setAll:values=>{try{values.forEach(({name,value,options})=>jar.set(name,value,options))}catch{/* Server Components use the refreshed cookies from proxy.ts. */}}}});}
export function publicSupabase(){const c=supabaseConfig();if(!c)throw new AccessError('La conexión de Supabase está pendiente de configuración.',503);return createClient(c.url,c.key,{auth:{persistSession:false,autoRefreshToken:false}});}
