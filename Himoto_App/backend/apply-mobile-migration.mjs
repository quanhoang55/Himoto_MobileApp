import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { rootCertificates } from 'node:tls';
import { parseEnv } from 'node:util';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDirectory = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(backendDirectory, '..');
const workspaceRoot = resolve(appRoot, '..');
const webRoot = resolve(workspaceRoot, 'Himoto');
const envFile = resolve(appRoot, '.env');
const migrationFile = resolve(webRoot, 'docs/sql/2026-10-25-mobile-sessions.sql');

if (!process.argv.includes('--confirm-test-database')) {
  console.error('This changes database schema. Re-run with --confirm-test-database only for your isolated non-production database.');
  process.exit(2);
}
if (!existsSync(envFile) || !existsSync(migrationFile)) {
  console.error('Missing Himoto_App/.env or the mobile session SQL migration.');
  process.exit(2);
}

Object.assign(process.env, parseEnv(readFileSync(envFile, 'utf8')));
const rawUrl = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL;
if (!rawUrl) {
  console.error('Set DATABASE_URL in Himoto_App/.env first.');
  process.exit(2);
}

const webRequire = createRequire(resolve(webRoot, 'package.json'));
const { Pool } = webRequire('pg');
const { load } = webRequire('./scripts/lib/load-typescript.cjs');
const { SUPABASE_ROOT_CA } = load(resolve(webRoot, 'src/lib/server/supabase-ca'));
const connectionUrl = new URL(rawUrl);
for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) connectionUrl.searchParams.delete(key);
const extraCa = process.env.DATABASE_SSL_CA ? [process.env.DATABASE_SSL_CA.replace(/\\n/g, '\n')] : [];
const pool = new Pool({
  connectionString: connectionUrl.toString(),
  ssl: { rejectUnauthorized: true, ca: [...rootCertificates, SUPABASE_ROOT_CA, ...extraCa] },
  max: 1,
  connectionTimeoutMillis: 8000,
});

try {
  const present = await pool.query(`SELECT
    to_regclass('himoto.management_mobile_login_attempts') IS NOT NULL AS login_attempts,
    to_regclass('himoto.management_mobile_sessions') IS NOT NULL AS sessions`);
  if (present.rows[0].login_attempts && present.rows[0].sessions) {
    console.log('Mobile session tables already exist.');
  } else {
    await pool.query(readFileSync(migrationFile, 'utf8'));
    const verified = await pool.query(`SELECT
      to_regclass('himoto.management_mobile_login_attempts') IS NOT NULL AS login_attempts,
      to_regclass('himoto.management_mobile_sessions') IS NOT NULL AS sessions`);
    if (!verified.rows[0].login_attempts || !verified.rows[0].sessions) throw new Error('Migration verification failed.');
    console.log('Mobile session migration applied and verified.');
  }
} catch (error) {
  console.error('[mobile-migration] failed', { code: error?.code || 'unknown', name: error?.name || 'unknown' });
  process.exitCode = 1;
} finally {
  await pool.end();
}
