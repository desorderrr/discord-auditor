/**
 * Cria o zip de distribuição com a versão do package.json no nome:
 *   discord-auditor-v1.0.0.zip
 *
 *   npm run pack
 */
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { name, version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

const outName = `${name}-v${version}.zip`;
const outPath = path.join(root, outName);

const EXCLUDE = new Set(['node_modules', '.env', 'reports', 'logs', '.git', 'test']);

const items = readdirSync(root, { withFileTypes: true })
  .map((entry) => entry.name)
  .filter((entry) => !EXCLUDE.has(entry) && !entry.endsWith('.zip'));

if (!items.length) {
  console.error('X Nada para empacotar.');
  process.exit(1);
}

if (existsSync(outPath)) rmSync(outPath);

const list = items.map((item) => `'${path.join(root, item).replace(/'/g, "''")}'`).join(',');
const command = `Compress-Archive -Path @(${list}) -DestinationPath '${outPath}' -Force`;

execFileSync('powershell', ['-NoProfile', '-Command', command], { stdio: 'inherit' });

console.log(`✅ ${outName} (${Math.round(readFileSync(outPath).length / 1024)} KB)`);
