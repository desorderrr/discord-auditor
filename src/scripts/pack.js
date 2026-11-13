/**
 * Cria o zip de distribuição com a versão do package.json no nome:
 *   discord-auditor-v1.0.0.zip
 *
 * Usa o tar do Windows (bsdtar) em vez do Compress-Archive, porque este
 * último grava os caminhos com "\" e o zip fica inválido em Linux (Discloud).
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

// -a deixa o bsdtar escolher o formato pela extensão (.zip)
execFileSync('tar', ['-a', '-c', '-f', outPath, ...items], {
  cwd: root,
  stdio: 'inherit',
});

const size = Math.round(readFileSync(outPath).length / 1024);
console.log(`✅ ${outName} (${size} KB)`);
