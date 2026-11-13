/**
 * Publica no Discord as novidades do FitGirl Repacks.
 *
 *   node src/scripts/fitgirl.js            → verifica e publica as novidades
 *   node src/scripts/fitgirl.js --dry-run  → mostra o que faria, sem publicar
 *
 * Variáveis (.env):
 *   FITGIRL_WEBHOOK_URL   URL do webhook (obrigatória, exceto com --dry-run)
 *   FITGIRL_FEED_URL      opcional; por omissão o feed oficial
 *   FITGIRL_STATE_FILE    opcional; por omissão logs/fitgirl-seen.json
 *
 * A primeira execução só grava o estado atual (não despeja o arquivo todo no
 * canal). A partir daí publica apenas o que aparecer de novo.
 */
import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DRY = process.argv.includes('--dry-run');
const WEBHOOK = process.env.FITGIRL_WEBHOOK_URL ?? '';
const FEED = process.env.FITGIRL_FEED_URL ?? 'https://fitgirl-repacks.site/feed/';
const STATE_FILE = path.resolve(process.env.FITGIRL_STATE_FILE ?? 'logs/fitgirl-seen.json');
const MAX_POSTS = 5;

/** O feed tem uma página "Upcoming Repacks" que muda de hora a hora — não é um lançamento. */
const SKIP = /upcoming repacks/i;

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decode(text) {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

function raw(block, tag) {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'));
  if (!m) return '';
  return m[1].replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '').trim();
}

function stripHtml(html) {
  return decode(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function parseItems(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)]
    .map(([, block]) => {
      const title = stripHtml(raw(block, 'title'));
      const link = raw(block, 'link');
      const guid = raw(block, 'guid') || link;
      const pubDate = raw(block, 'pubDate');
      const content = raw(block, 'content:encoded') || raw(block, 'description');
      const image = (content.match(/<img[^>]+src=["']([^"']+)["']/i) ?? [])[1] ?? null;
      const summary = stripHtml(content);
      return { title, link, guid, pubDate, image, summary };
    })
    .filter((item) => item.title && item.link && !SKIP.test(item.title));
}

async function loadState() {
  try {
    return JSON.parse(await readFile(STATE_FILE, 'utf8'));
  } catch {
    return { seeded: false, seen: [] };
  }
}

async function saveState(state) {
  await mkdir(path.dirname(STATE_FILE), { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

function buildPayload(item) {
  const embed = {
    title: item.title.slice(0, 250),
    url: item.link,
    color: 0xff6b35,
    description:
      (item.summary.length > 280 ? `${item.summary.slice(0, 280).trimEnd()}…` : item.summary) +
      `\n\n**[Ver no FitGirl](${item.link})**`,
    footer: { text: 'FitGirl Repacks' },
  };

  if (item.image) embed.thumbnail = { url: item.image };

  const date = new Date(item.pubDate);
  if (!Number.isNaN(date.getTime())) embed.timestamp = date.toISOString();

  return { username: 'FitGirl Repacks', embeds: [embed] };
}

async function send(payload) {
  const res = await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Discord respondeu ${res.status}: ${await res.text()}`);
  }
}

async function main() {
  if (!DRY && !WEBHOOK) {
    console.error('❌ Falta FITGIRL_WEBHOOK_URL no .env');
    process.exit(1);
  }

  const res = await fetch(FEED, {
    headers: { 'User-Agent': BROWSER_UA, Accept: 'application/rss+xml, application/xml' },
  });
  if (!res.ok) throw new Error(`Feed respondeu ${res.status}`);

  const items = parseItems(await res.text());
  if (!items.length) {
    console.log('Nenhum item no feed.');
    return;
  }

  const state = await loadState();

  if (!state.seeded) {
    state.seeded = true;
    state.seen = items.map((item) => item.guid);
    if (!DRY) await saveState(state);
    console.log(`Primeira execução: ${items.length} item(ns) marcados como já vistos.`);
    return;
  }

  const fresh = items.filter((item) => !state.seen.includes(item.guid));
  if (!fresh.length) {
    console.log('Sem novidades.');
    return;
  }

  const toPost = fresh.slice(0, MAX_POSTS).reverse();
  console.log(`${fresh.length} novidade(s); a publicar ${toPost.length}.`);

  for (const item of toPost) {
    if (DRY) {
      console.log(`   [dry-run] ${item.title}`);
      console.log(`             ${item.link}`);
      continue;
    }
    await send(buildPayload(item));
    console.log(`   ✅ ${item.title}`);
  }

  if (!DRY) {
    state.seen = [...state.seen, ...fresh.map((item) => item.guid)];
    await saveState(state);
  }
}

main().catch((err) => {
  console.error(`❌ ${err.message}`);
  process.exit(1);
});
