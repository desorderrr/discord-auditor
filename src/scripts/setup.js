/**
 * Setup guiado — verifica o Node, cria o .env e instala dependências.
 *
 *   npm run setup
 */
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MIN_MAJOR = 20;
const major = Number(process.versions.node.split('.')[0]);

console.log('\n  discord-auditor · setup\n');

if (!Number.isFinite(major) || major < MIN_MAJOR) {
  console.error(`  X Node ${process.versions.node} é antigo. Instala Node ${MIN_MAJOR}+: https://nodejs.org`);
  process.exit(1);
}
console.log(`  [ok] Node ${process.versions.node}`);

const envPath = path.join(root, '.env');
const examplePath = path.join(root, '.env.example');

if (!existsSync(envPath)) {
  copyFileSync(examplePath, envPath);
  console.log('  [ok] .env criado a partir de .env.example');
} else {
  console.log('  [ok] .env já existe');
}

const missing = [];
const env = readFileSync(envPath, 'utf8');
for (const key of ['DISCORD_TOKEN', 'CLIENT_ID', 'GUILD_ID']) {
  const match = env.match(new RegExp(`^${key}=(.*)$`, 'm'));
  const value = match?.[1]?.trim() ?? '';
  if (!value || /^cola-o-token/i.test(value) || /^123456789/.test(value)) missing.push(key);
}
if (missing.length) console.log(`  [!] Falta preencher no .env: ${missing.join(', ')}`);

if (!existsSync(path.join(root, 'node_modules'))) {
  console.log('  [..] A instalar dependências (pode demorar ~10s)…');
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npm, ['install', '--no-fund', '--no-audit'], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  });
  if (result.status !== 0) {
    console.error('  X npm install falhou. Verifica a ligação à internet.');
    process.exit(1);
  }
  console.log('  [ok] Dependências instaladas');
} else {
  console.log('  [ok] Dependências já instaladas');
}

console.log('\n  Próximos passos:');
let step = 1;
if (missing.length) {
  console.log(`    ${step}. Edita o .env e preenche: ${missing.join(', ')}`);
  step += 1;
}
console.log(`    ${step}. npm start`);
console.log(`    ${step + 1}. No Discord: /audit   ·   /cargos publicar\n`);
