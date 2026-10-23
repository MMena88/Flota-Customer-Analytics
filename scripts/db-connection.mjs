import {existsSync} from 'node:fs';
import {Client} from 'pg';

export async function adminConnection() {
  if (existsSync('.env.local')) process.loadEnvFile('.env.local');
  const value = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
  if (!value) throw new Error('Configurá MIGRATION_DATABASE_URL o DATABASE_URL en .env.local.');
  const url = new URL(value);
  const local = ['localhost','127.0.0.1','::1'].includes(url.hostname);
  for (const key of ['sslmode','sslcert','sslkey','sslrootcert']) url.searchParams.delete(key);
  const client = new Client({
    connectionString: url.toString(), connectionTimeoutMillis: 15000,
    ssl: local ? false : {rejectUnauthorized:true,...(process.env.DATABASE_CA_CERT ? {ca:process.env.DATABASE_CA_CERT} : {})},
    application_name:'puma-admin',
  });
  await client.connect();
  return client;
}
export function reportFailure(error) {
  // Database errors can include connection credentials or private values. Log only a code.
  console.error(error.code ? `Operación fallida (${error.code}). Revisá conexión, permisos y el paso indicado.` : 'Operación fallida. Revisá los parámetros y la configuración de .env.local.');
  process.exitCode = 1;
}
