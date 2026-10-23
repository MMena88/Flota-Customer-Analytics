import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

export async function applyMigrations(connection, directory, log = console.log) {
  if (directory instanceof URL) directory = fileURLToPath(directory);
  const files = (await fs.readdir(directory)).filter(name => /^\d+_.+\.sql$/.test(name)).sort();
  await connection.query('BEGIN');
  try {
    await connection.query('SELECT pg_advisory_xact_lock(1827664101)');
    await connection.query('CREATE SCHEMA IF NOT EXISTS app_private');
    await connection.query('REVOKE ALL ON SCHEMA app_private FROM PUBLIC');
    await connection.query('CREATE TABLE IF NOT EXISTS app_private.schema_migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    await connection.query('ALTER TABLE app_private.schema_migrations ENABLE ROW LEVEL SECURITY');
    await connection.query('REVOKE ALL ON app_private.schema_migrations FROM PUBLIC');
    for (const name of files) {
      const sql = await fs.readFile(path.join(directory,name),'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const {rows} = await connection.query('SELECT checksum FROM app_private.schema_migrations WHERE name=$1',[name]);
      if (rows.length) {
        if (rows[0].checksum !== checksum) throw new Error(`La migración aplicada ${name} cambió. Creá una migración nueva.`);
        log(`Ya aplicada: ${name}`);
        continue;
      }
      log(`Aplicando: ${name}`);
      await connection.query(sql);
      await connection.query('INSERT INTO app_private.schema_migrations(name,checksum) VALUES ($1,$2)',[name,checksum]);
    }
    await connection.query('COMMIT');
  } catch (error) {
    await connection.query('ROLLBACK').catch(()=>{});
    throw error;
  }
}
