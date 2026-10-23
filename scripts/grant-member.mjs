import {adminConnection,reportFailure} from './db-connection.mjs';
const [userId,role] = process.argv.slice(2);
if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(userId||'') || !['admin','editor','viewer'].includes(role)) {
  console.error('Uso: npm run db:member -- UUID_DEL_USUARIO admin|editor|viewer');
  process.exit(1);
}
let connection;
try {
  connection = await adminConnection();
  const {rows} = await connection.query('SELECT id FROM auth.users WHERE id=$1',[userId]);
  if (!rows.length) throw new Error('Creá primero la cuenta en Supabase Authentication.');
  await connection.query('INSERT INTO app_private.app_members(user_id,role,active) VALUES ($1,$2,true) ON CONFLICT (user_id) DO UPDATE SET role=EXCLUDED.role,active=true',[userId,role]);
  console.log(`Acceso ${role} habilitado para ${userId}.`);
} catch (error) { reportFailure(error); }
finally { await connection?.end(); }
