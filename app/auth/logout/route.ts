import {serverSupabase} from '@/lib/supabase/server';
export async function POST(req:Request){const origin=req.headers.get('origin');if((origin&&origin!==new URL(req.url).origin)||req.headers.get('sec-fetch-site')==='cross-site')return new Response('Origen no permitido',{status:403});await (await serverSupabase()).auth.signOut();return Response.redirect(new URL('/login',req.url),303);}
