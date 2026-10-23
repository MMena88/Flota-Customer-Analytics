'use client';
import {createBrowserClient} from '@supabase/ssr';
import {supabaseConfig} from './config';
export function browserSupabase(){const c=supabaseConfig();if(!c)throw new Error('Falta configurar Supabase.');return createBrowserClient(c.url,c.key);}
