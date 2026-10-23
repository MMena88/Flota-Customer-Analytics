import LoginForm from './login-form';
import {supabaseConfig} from '@/lib/supabase/config';
export const dynamic='force-dynamic';
export default async function Login({searchParams}:{searchParams:Promise<{reason?:string}>}){const p=await searchParams;return <main className="auth-page"><div className="auth-card"><div className="eyebrow">PUMA COMERCIAL · EL SALVADOR</div><h1>Tu cartera, en un solo lugar.</h1><p>Acceso privado para el equipo comercial.</p>{!supabaseConfig()||p.reason==='503'?<div className="notice amber"><p>La plataforma está lista para conectar su base de datos. El administrador debe completar la configuración de Supabase en Vercel según la guía del repositorio.</p></div>:<LoginForm denied={p.reason==='403'}/>}</div></main>}
