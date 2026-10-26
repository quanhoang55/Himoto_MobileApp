import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const directory = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(directory, '..');
const webRoot = resolve(appRoot, '../Himoto');
const envFile = resolve(appRoot, '.env');
const nextCli = resolve(webRoot, 'node_modules/next/dist/bin/next');
const host = process.argv.includes('--lan') ? '0.0.0.0' : '127.0.0.1';

if (!existsSync(envFile)) {
  console.error('Create Himoto_App/.env from Himoto_App/.env.example before starting the backend.');
  process.exit(1);
}
if (!existsSync(nextCli)) {
  console.error('Install web dependencies in Himoto/ before starting the backend.');
  process.exit(1);
}

const localEnv = parseEnv(readFileSync(envFile, 'utf8'));
const child = spawn(process.execPath, [nextCli, 'dev', '-H', host, '-p', '3000'], {
  cwd: webRoot,
  env: { ...process.env, ...localEnv },
  stdio: 'inherit',
});
child.on('error', error => { console.error(`Cannot start backend: ${error.message}`); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
