import {createServerClient} from '@supabase/ssr';
import {NextResponse,type NextRequest} from 'next/server';
import {supabaseConfig} from './lib/supabase/config';
export async function proxy(request:NextRequest){const c=supabaseConfig();if(!c)return NextResponse.next();let response=NextResponse.next({request});const supabase=createServerClient(c.url,c.key,{cookies:{getAll:()=>request.cookies.getAll(),setAll:values=>{values.forEach(({name,value})=>request.cookies.set(name,value));response=NextResponse.next({request});values.forEach(({name,value,options})=>response.cookies.set(name,value,options));}}});await supabase.auth.getUser();return response;}
export const config={matcher:['/((?!_next/static|_next/image|favicon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)']};
