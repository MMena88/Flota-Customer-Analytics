import {adminConnection,reportFailure} from './db-connection.mjs';
import {applyMigrations} from './migration-runner.mjs';
let connection;
try {
  connection = await adminConnection();
  await applyMigrations(connection,new URL('../supabase/migrations/',import.meta.url));
  console.log('Migraciones completas.');
} catch (error) { reportFailure(error); }
finally { await connection?.end(); }
