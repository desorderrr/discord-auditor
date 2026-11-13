// Teste de runtime com um servidor Discord simulado (não usa rede nem token).
import { Collection, ChannelType, PermissionsBitField, PermissionFlagsBits as P } from 'discord.js';

const GID = '100000000000000000';
const ALL = new PermissionsBitField(Object.values(P));

const role = (id, name, perms = 0n, position = 1, members = []) => ({
  id,
  name,
  managed: false,
  position,
  hexColor: '#99aab5',
  permissions: new PermissionsBitField(perms),
  members: new Collection(members.map((m) => [m, {}])),
  setPermissions: async () => {},
  delete: async () => {},
});

const everyone = role(
  GID,
  '@everyone',
  P.ViewChannel | P.SendMessages | P.ReadMessageHistory,
  0,
);
const adminRole = role('r1', 'Admin', P.Administrator, 5, ['u1', 'u2']);
const newRole = role('r2', 'novo cargo', 0n, 2, []);
const dupeA = role('r3', 'Staff', 0n, 3, ['u1']);
const dupeB = role('r4', 'Staff', 0n, 4, ['u1']);

const overwrite = (allow = 0n, deny = 0n) =>
  new Collection([
    [
      GID,
      {
        id: GID,
        type: 0,
        allow: new PermissionsBitField(allow),
        deny: new PermissionsBitField(deny),
      },
    ],
  ]);

const makeChannel = (over = {}) => {
  const channel = {
    id: 'c1',
    name: 'General Chat',
    type: ChannelType.GuildText,
    parentId: null,
    nsfw: false,
    topic: null,
    lastMessageId: null,
    isThread: () => false,
    permissionsFor: () => new PermissionsBitField(P.ViewChannel | P.SendMessages),
    permissionOverwrites: {
      cache: new Collection(),
      edit: async () => {},
      delete: async () => {},
    },
    setName: async () => {},
    setParent: async () => {},
    delete: async () => {},
    toString() {
      return `#${this.name}`;
    },
    ...over,
  };
  return channel;
};

const category = makeChannel({
  id: 'cat1',
  name: 'Geral',
  type: ChannelType.GuildCategory,
});
const noCategory = makeChannel();
const dead = makeChannel({
  id: 'c2',
  name: 'morto',
  parentId: 'cat1',
  lastMessageId: '100000000000000000', // 2015 -> muito antigo
  topic: 'ok',
});
const staffLeak = makeChannel({
  id: 'c3',
  name: 'staff-logs',
  parentId: 'cat1',
  topic: 'logs',
  lastMessageId: '100000000000000000',
});
// só de leitura: nunca deve contar como "canal morto"
const rules = makeChannel({
  id: 'c4',
  name: 'rules',
  parentId: 'cat1',
  topic: 'Regras',
  lastMessageId: null,
  permissionsFor: () => new PermissionsBitField(P.ViewChannel),
  permissionOverwrites: {
    cache: overwrite(0n, P.SendMessages),
    edit: async () => {},
    delete: async () => {},
  },
});
// "modpack" não é canal de staff (falso positivo clássico do "mod")
const modpack = makeChannel({
  id: 'c5',
  name: 'modpack',
  parentId: 'cat1',
  topic: 'Modpacks',
  lastMessageId: null,
});
// texto + voz com o mesmo nome é normal, não é duplicado
const voiceChat = makeChannel({
  id: 'c6',
  name: 'chat',
  type: ChannelType.GuildVoice,
  parentId: 'cat1',
});
const textChat = makeChannel({ id: 'c7', name: 'chat', parentId: 'cat1' });

// Categoria privada: o canal herda o deny e NÃO deve ser sinalizado.
const privateCat = makeChannel({
  id: 'cat2',
  name: 'Staff',
  type: ChannelType.GuildCategory,
  permissionOverwrites: {
    cache: overwrite(0n, P.ViewChannel),
    edit: async () => {},
    delete: async () => {},
  },
});
const hiddenLogs = makeChannel({
  id: 'c8',
  name: 'mod-logs',
  parentId: 'cat2',
  lastMessageId: null,
});
hiddenLogs.parent = privateCat;

const channels = new Collection([
  [category.id, category],
  [privateCat.id, privateCat],
  [noCategory.id, noCategory],
  [dead.id, dead],
  [staffLeak.id, staffLeak],
  [rules.id, rules],
  [modpack.id, modpack],
  [voiceChat.id, voiceChat],
  [textChat.id, textChat],
  [hiddenLogs.id, hiddenLogs],
]);

const me = {
  id: 'bot',
  permissions: ALL,
  roles: { highest: { id: 'botrole', position: 10, name: 'Bot' } },
};

const guild = {
  id: GID,
  name: 'Servidor de Teste',
  memberCount: 100,
  mfaLevel: 0,
  verificationLevel: 0,
  explicitContentFilter: 0,
  defaultMessageNotifications: 0,
  roles: {
    everyone,
    cache: new Collection([
      [GID, everyone],
      ['r1', adminRole],
      ['r2', newRole],
      ['r3', dupeA],
      ['r4', dupeB],
    ]),
  },
  channels: {
    cache: channels,
    create: async (options) => ({
      id: 'cat-archive',
      name: options.name,
      type: ChannelType.GuildCategory,
      parentId: null,
    }),
  },
  members: {
    me,
    cache: new Collection(
      ['u1', 'u2'].map((id) => [id, { id, user: { id, bot: false, tag: `${id}#0001` }, permissions: new PermissionsBitField(0n), joinedTimestamp: Date.now() }]),
    ),
    fetch: async () => {},
    fetchMe: async () => me,
  },
  invites: {
    fetch: async () =>
      new Collection([
        ['abc', { code: 'abc', expiresAt: null, maxUses: 0, uses: 5, channel: noCategory, delete: async () => {} }],
      ]),
  },
  fetchWebhooks: async () =>
    new Collection([
      ['wh1', { name: 'hook', owner: { id: 'u9', tag: 'gone#0001' }, channel: noCategory, sourceGuild: null, delete: async () => {} }],
    ]),
  autoModerationRules: {
    fetch: async () => new Collection(),
    create: async () => ({}),
  },
  setVerificationLevel: async () => {},
  setExplicitContentFilter: async () => {},
  setDefaultMessageNotifications: async () => {},
};

const { runAudit } = await import('../src/lib/audit.js');
const findings = await runAudit(guild, {});

const failed = findings.filter((f) => f.error);
console.log(`findings: ${findings.length}`);
for (const f of findings) {
  console.log(` ${f.error ? '❌' : '•'} [${f.severity}] ${f.id}`);
}
if (failed.length) {
  console.error('\nVerificações que rebentaram:');
  for (const f of failed) console.error(` - ${f.id}: ${f.detail}`);
  process.exit(1);
}
if (findings.length < 10) {
  console.error('Poucos findings — o mock não está a exercitar as verificações.');
  process.exit(1);
}

// Falsos positivos que já foram corrigidos: não podem voltar.
const sensitive = findings.find((f) => f.id === 'sec.sensitive-channels');
if (sensitive && sensitive.detail.includes('#modpack')) {
  console.error('❌ #modpack voltou a ser classificado como canal sensível.');
  process.exit(1);
}
if (!sensitive || !sensitive.detail.includes('#staff-logs')) {
  console.error('❌ #staff-logs devia ser classificado como canal sensível.');
  process.exit(1);
}

const deadFinding = findings.find((f) => f.id === 'chan.dead');
if (deadFinding && deadFinding.detail.includes('#rules')) {
  console.error('❌ Canal só de leitura (#rules) contado como morto.');
  process.exit(1);
}

const dupFinding = findings.find((f) => f.id === 'chan.duplicates');
if (dupFinding && dupFinding.detail.includes('#chat')) {
  console.error('❌ Canal de texto e de voz com o mesmo nome contado como duplicado.');
  process.exit(1);
}

// Canal dentro de categoria privada: herda o deny e não pode ser sinalizado.
if (sensitive && sensitive.detail.includes('#mod-logs')) {
  console.error('❌ Canal dentro de categoria privada contado como exposto.');
  process.exit(1);
}
const topics = findings.find((f) => f.id === 'chan.no-topic');
if (topics && topics.detail.includes('#mod-logs')) {
  console.error('❌ Canal oculto contado como "sem tópico".');
  process.exit(1);
}

// Exercita também as correções (com todas as arriscadas incluídas).
const { applyFixes } = await import('../src/lib/fixer.js');
const results = await applyFixes(findings, { guild, allowRisky: true });

const failedFixes = results.filter((r) => r.status === 'failed');
console.log(`\ncorreções: ${results.length} (${results.filter((r) => r.status === 'applied').length} aplicadas)`);
for (const r of results) {
  const icon = r.status === 'applied' ? '✅' : r.status === 'failed' ? '❌' : '⏭️';
  console.log(` ${icon} ${r.finding.id}: ${r.message ?? ''}`);
}

if (failedFixes.length) {
  console.error('\nCorreções que rebentaram:');
  for (const r of failedFixes) console.error(` - ${r.finding.id}: ${r.message}`);
  process.exit(1);
}

console.log('\n✅ runAudit + applyFixes executaram sem erros.');
