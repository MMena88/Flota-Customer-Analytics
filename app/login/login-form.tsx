'use client';

import {useState} from 'react';
import {browserSupabase} from '@/lib/supabase/client';

export default function LoginForm({denied}: {denied: boolean}) {
  const [error, setError] = useState(denied ? 'Tu cuenta no tiene acceso al espacio. Pedí al administrador que te agregue.' : '');
  const [busy, setBusy] = useState(false);
  return <form onSubmit={async event => {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const {error: signInError} = await browserSupabase().auth.signInWithPassword({
        email: String(form.get('email')), password: String(form.get('password')),
      });
      if (signInError) throw new Error('No pudimos iniciar sesión. Revisá tu correo y contraseña.');
      window.location.assign('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }}>
    <label className="field"><span>Correo del equipo</span><input name="email" type="email" autoComplete="username" required/></label>
    <label className="field"><span>Contraseña</span><input name="password" type="password" autoComplete="current-password" required/></label>
    {error && <p className="auth-error" role="alert">{error}</p>}
    <button className="button" disabled={busy}>{busy ? 'Ingresando…' : 'Ingresar'}</button>
    <p className="help-text">Las cuentas las habilita el administrador. Si necesitás acceso o recuperar tu contraseña, contactalo.</p>
  </form>;
}
