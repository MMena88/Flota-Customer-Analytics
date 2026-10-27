import {BarChart3, Users, ArrowUpRight, ShieldCheck} from 'lucide-react';
import LoginForm from './login-form';
import {Brand} from '../brand';
import {supabaseConfig} from '@/lib/supabase/config';
export const dynamic = 'force-dynamic';
export default async function Login({searchParams}: {searchParams: Promise<{reason?: string}>}) {
  const p = await searchParams;
  return <main className="auth-page">
    <section className="auth-story">
      <div className="auth-brand"><Brand/><span>EL SALVADOR</span></div>
      <div className="auth-story-content">
        <div className="auth-kicker">INTELIGENCIA COMERCIAL</div>
        <h1>Tu flota.<br/>Tus clientes.<br/><span>Una visión clara.</span></h1>
        <p>Transformá la información de cada día en decisiones para hacer crecer tu negocio.</p>
        <div className="auth-features">
          <div><Users size={22}/><span><b>Una cartera conectada</b><small>La información de cada cliente, en un solo lugar.</small></span></div>
          <div><BarChart3 size={22}/><span><b>El foco en lo importante</b><small>Volumen, evolución y ranking de clientes.</small></span></div>
          <div><ArrowUpRight size={22}/><span><b>Más contexto para decidir</b><small>Oportunidades, margen y seguimiento comercial.</small></span></div>
        </div>
      </div>
      <div className="auth-story-footer">PUMA FLOTA <span>Gestión comercial · El Salvador</span></div>
    </section>
    <section className="auth-entry"><div className="auth-card">
      <div className="auth-secure"><ShieldCheck size={18}/> ESPACIO PRIVADO</div>
      <h2>Bienvenido a tu<br/>espacio comercial.</h2>
      <p>Ingresá para consultar tu cartera y actualizar la información de tu equipo.</p>
      {!supabaseConfig() || p.reason === '503'
        ? <div className="notice amber"><p>El acceso todavía no está disponible. Contactá al administrador para completar la configuración.</p></div>
        : <LoginForm denied={p.reason === '403'}/>}
    </div><p className="auth-entry-footer">Información de tu equipo. Acceso autorizado.</p></section>
  </main>;
}
