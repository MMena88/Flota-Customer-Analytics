import {serverSupabase,publicSupabase} from './supabase/server';
import {database} from './database';
import {AccessError,type Member} from './api-guard';
export async function requireMember(req?:Request):Promise<Member>{
 const authorization=req?.headers.get('authorization');
 const result=authorization?.startsWith('Bearer ')?await publicSupabase().auth.getUser(authorization.slice(7)):await (await serverSupabase()).auth.getUser();
 if(result.error||!result.data.user)throw new AccessError('Iniciá sesión para continuar.',401);
 const user=result.data.user;if(!process.env.DATABASE_URL&&!process.env.POSTGRES_URL)throw new AccessError('La base de datos está pendiente de configuración.',503);
 const member=await database.prepare('SELECT role FROM app_members WHERE user_id=? AND active=true').bind(user.id).first<{role:Member['role']}>();
 if(!member)throw new AccessError('Tu cuenta no tiene acceso a este espacio. Contactá al administrador.',403);
 return {id:user.id,email:user.email||'',displayName:String(user.user_metadata?.full_name||user.email||'Equipo Puma'),role:member.role};
}
