/**
 * Verificações de integridade que não precisam de token nem de rede.
 * Uso: npm run self-test
 */
import { checks, areas } from '../lib/checks/index.js';
import { SENSITIVE_NAME } from '../lib/checks/security.js';
import { PING_GAMES, buildPingComponents } from '../lib/pingRoles.js';
import { buildReportEmbeds, toMarkdown } from '../lib/report.js';
import { SEVERITY, normalizeChannelName } from '../lib/util.js';

const problems = [];
const check = (condition, message) => {
  if (!condition) problems.push(message);
};

// 1. Estrutura das verificações
for (const c of checks) {
  check(typeof c.id === 'string' && c.id.includes('.'), `check sem id válido: ${c.id}`);
  check(areas.includes(c.area), `check ${c.id} com área inválida: ${c.area}`);
  check(typeof c.run === 'function', `check ${c.id} sem run()`);
}
check(new Set(checks.map((c) => c.id)).size === checks.length, 'ids de check duplicados');

// 1b. Deteção de canais sensíveis (evitar falsos positivos)
const shouldMatch = [
  'admin',
  'admin/mod',
  'staff-chat',
  'mod',
  'mod-log',
  'moderação',
  'logs',
  'reports',
  'ban-appeals',
  'tickets',
];
const shouldNotMatch = [
  'modpack',
  'gaming',
  'general',
  'software',
  'airsoft',
  'memes',
  'free-games',
  'welcome',
  'announcements',
  'music',
  'files',
  'notifications',
  'new-realeses',
];
for (const name of shouldMatch) {
  check(SENSITIVE_NAME.test(name), `canal sensível não detetado: ${name}`);
}
for (const name of shouldNotMatch) {
  check(!SENSITIVE_NAME.test(name), `falso positivo em canal normal: ${name}`);
}

// 1c. Normalização de nomes (acentos são válidos; emojis não)
const nameCases = [
  ['anúncios', 'anúncios'],
  ['jogos-grátis', 'jogos-grátis'],
  ['Geral', 'geral'],
  ['software💻', 'software'],
  ['admin/mod', 'admin-mod'],
  ['  Muito   Espaço  ', 'muito-espaço'],
];
for (const [input, expected] of nameCases) {
  check(
    normalizeChannelName(input) === expected,
    `normalizeChannelName("${input}") = "${normalizeChannelName(input)}", esperado "${expected}"`,
  );
}

// 2. Findings sintéticos no pior caso (textos longos, todas as áreas)
const long = 'x'.repeat(1200);
const synthetic = Array.from({ length: 45 }, (_, i) => ({
  id: `test.${i}`,
  area: areas[i % areas.length],
  severity: Object.keys(SEVERITY)[i % Object.keys(SEVERITY).length],
  title: `${long} ${i}`,
  detail: `${long} ${long}`,
  fix:
    i % 2 === 0
      ? { risk: 'safe', description: long, run: async () => 'ok' }
      : undefined,
  manual: i % 2 === 0 ? undefined : long,
}));

const guild = {
  id: '123456789012345678',
  name: 'Servidor de teste muito comprido '.repeat(3),
  memberCount: 1234,
  channels: { cache: { size: 42 } },
  roles: { cache: { size: 7 } },
};

const embeds = buildReportEmbeds(guild, synthetic);
check(embeds.length <= 10, `demasiados embeds: ${embeds.length}`);

for (const [index, embed] of embeds.entries()) {
  const data = embed.data;
  const total =
    (data.title?.length ?? 0) +
    (data.description?.length ?? 0) +
    (data.footer?.text?.length ?? 0) +
    (data.fields ?? []).reduce((n, f) => n + f.name.length + f.value.length, 0);

  check(total <= 6000, `embed #${index} com ${total} caracteres (limite 6000)`);
  check((data.fields?.length ?? 0) <= 25, `embed #${index} com demasiados fields`);
  if (data.description) {
    check(data.description.length <= 4096, `embed #${index} description > 4096`);
  }
  for (const field of data.fields ?? []) {
    check(field.name.length <= 256, `field name > 256: ${field.name.slice(0, 40)}`);
    check(field.value.length <= 1024, `field value > 1024 (${field.value.length})`);
  }
}

// 3. Markdown
// 1d. Cargos de ping
check(
  new Set(PING_GAMES.map((g) => g.roleName)).size === PING_GAMES.length,
  'cargos de ping duplicados',
);
check(
  PING_GAMES.every((g) => g.roleName && g.label && g.emoji),
  'cargo de ping sem roleName/label/emoji',
);

const fakeRoles = PING_GAMES.map((g, i) => ({ ...g, role: { id: String(1000 + i), name: g.roleName } }));
const rows = buildPingComponents(fakeRoles);
check(rows.length <= 5, `demasiadas linhas de botões: ${rows.length}`);
check(rows.every((r) => r.components.length <= 5), 'linha com mais de 5 botões');
check(
  rows.flatMap((r) => r.components).length === PING_GAMES.length,
  'botões a menos que cargos',
);

const md = toMarkdown(guild, synthetic);
check(typeof md === 'string' && md.length > 0, 'markdown vazio');
check(md.includes('## '), 'markdown sem secções');
check(!md.includes('undefined'), 'markdown contém "undefined"');

// 4. Relatório vazio
const emptyEmbeds = buildReportEmbeds(guild, []);
check(emptyEmbeds.length === 1, 'relatório vazio devia ter 1 embed');

if (problems.length) {
  console.error('❌ self-test falhou:');
  for (const problem of problems) console.error(`   • ${problem}`);
  process.exit(1);
}

console.log(`✅ self-test OK — ${checks.length} verificações, ${embeds.length} embeds no pior caso.`);
