import {
  ChannelType,
  PermissionFlagsBits,
  PermissionsBitField,
  SnowflakeUtil,
} from 'discord.js';

/** Peso de cada severidade para o cálculo da pontuação. */
export const SEVERITY = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

export const SEVERITY_LABEL = {
  critical: 'Crítico',
  high: 'Alto',
  medium: 'Médio',
  low: 'Baixo',
  info: 'Info',
};

export const SEVERITY_EMOJI = {
  critical: '🟥',
  high: '🟧',
  medium: '🟨',
  low: '🟦',
  info: '⬜',
};

export const AREA_LABEL = {
  security: '🔐 Segurança e permissões',
  channels: '📁 Estrutura de canais',
  automod: '🛡️ Anti-raid / AutoMod',
  roles: '🎭 Cargos e hierarquia',
};

const PENALTY = {
  critical: 20,
  high: 10,
  medium: 4,
  low: 1,
  info: 0,
};

/** Nomes de permissões em português (fallback para o nome técnico). */
const PERM_PT = {
  Administrator: 'Administrador',
  ManageGuild: 'Gerir servidor',
  ManageRoles: 'Gerir cargos',
  ManageChannels: 'Gerir canais',
  ManageWebhooks: 'Gerir webhooks',
  ManageMessages: 'Gerir mensagens',
  ManageNicknames: 'Gerir alcunhas',
  ManageEmojisAndStickers: 'Gerir emojis',
  ManageEvents: 'Gerir eventos',
  ManageThreads: 'Gerir threads',
  KickMembers: 'Expulsar membros',
  BanMembers: 'Banir membros',
  ModerateMembers: 'Silenciar membros',
  MentionEveryone: 'Mencionar @everyone',
  ViewAuditLog: 'Ver registo de auditoria',
  ViewChannel: 'Ver canais',
  ViewGuildInsights: 'Ver análises',
  SendMessages: 'Enviar mensagens',
  SendMessagesInThreads: 'Enviar em threads',
  CreatePublicThreads: 'Criar threads públicas',
  CreatePrivateThreads: 'Criar threads privadas',
  EmbedLinks: 'Inserir links',
  AttachFiles: 'Anexar ficheiros',
  AddReactions: 'Adicionar reações',
  UseExternalEmojis: 'Usar emojis externos',
  UseExternalStickers: 'Usar stickers externos',
  Connect: 'Ligar à voz',
  Speak: 'Falar',
  Stream: 'Transmitir',
  MuteMembers: 'Silenciar',
  DeafenMembers: 'Ensurdecer',
  MoveMembers: 'Mover membros',
  PrioritySpeaker: 'Orador prioritário',
  ChangeNickname: 'Alterar alcunha',
  ReadMessageHistory: 'Ler histórico',
  UseApplicationCommands: 'Usar comandos',
  UseEmbeddedActivities: 'Usar atividades',
  UseSoundboard: 'Usar soundboard',
  UseExternalSounds: 'Usar sons externos',
  CreateInstantInvite: 'Criar convites',
  RequestToSpeak: 'Pedir para falar',
  CreateEvents: 'Criar eventos',
  CreateGuildExpressions: 'Criar expressões',
  SendVoiceMessages: 'Enviar mensagens de voz',
  SendPolls: 'Criar sondagens',
  UseExternalApps: 'Usar apps externas',
};

export function permLabel(name) {
  return PERM_PT[name] ?? name;
}

/** Converte um bitfield (ou array de bits) numa lista legível. */
export function permList(bits) {
  const bf = bits instanceof PermissionsBitField ? bits : new PermissionsBitField(bits);
  return bf
    .toArray()
    .map(permLabel)
    .join(', ');
}

/** Data do snowflake (lastMessageId, ids de mensagens, etc.). */
export function snowflakeDate(id) {
  if (!id) return null;
  try {
    return new Date(SnowflakeUtil.timestampFrom(id));
  } catch {
    return null;
  }
}

export function daysSince(date) {
  if (!date) return null;
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

export function formatDate(date) {
  if (!date) return '—';
  return new Intl.DateTimeFormat('pt-PT', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

export function truncate(text, max = 950) {
  const str = String(text ?? '');
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

export function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size));
  return out;
}

/**
 * Normaliza o nome de um canal para o padrão do Discord:
 * minúsculas, sem acentos, espaços -> hífen, apenas [a-z0-9-_].
 */
export function normalizeChannelName(name) {
  const normalized = String(name ?? '')
    .normalize('NFC')
    .toLowerCase()
    .trim()
    .replace(/['’"]/g, '')
    .replace(/[^\p{L}\p{N}\-_ ]+/gu, '-')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 90);

  return normalized || 'canal';
}

/** O Discord devolve 4014 quando se pedem intents que a app não tem ativados. */
export function isDisallowedIntents(err) {
  return err?.code === 4014 || /disallowed intents/i.test(err?.message ?? '');
}

/** Referência legível a um canal (funciona no Discord e no terminal). */
export function channelRef(channel) {
  if (!channel) return '(canal apagado)';
  const name = String(channel.name ?? '').replace(/`/g, "'");
  if (channel.type === ChannelType.GuildCategory) return `📂 ${name}`;
  return `#${name}`;
}

/**
 * Permissões efetivas de @everyone num canal.
 * O discord.js (v14) NÃO aplica as overwrites da categoria quando se passa um Role,
 * por isso fazemos a conta correta: base → categoria → canal.
 */
export function everyonePermissions(channel, guild) {
  let perms = new PermissionsBitField(guild.roles.everyone.permissions);

  const apply = (overwrite) => {
    if (!overwrite) return;
    if (overwrite.deny) perms = perms.remove(overwrite.deny);
    if (overwrite.allow) perms = perms.add(overwrite.allow);
  };

  apply(channel.parent?.permissionOverwrites?.cache?.get(guild.id));
  apply(channel.permissionOverwrites?.cache?.get(guild.id));

  return perms;
}

/** Canais que contam para a estrutura (exclui categorias e threads). */
export function structuralChannels(guild) {
  return guild.channels.cache.filter(
    (c) => c.type !== ChannelType.GuildCategory && !c.isThread(),
  );
}

export function textChannels(guild) {
  return guild.channels.cache.filter(
    (c) =>
      c.type === ChannelType.GuildText ||
      c.type === ChannelType.GuildAnnouncement ||
      c.type === ChannelType.GuildForum,
  );
}

/** Calcula pontuação 0-100 e contagens por severidade. */
export function summarize(findings) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  let penalty = 0;

  for (const f of findings) {
    counts[f.severity] = (counts[f.severity] ?? 0) + 1;
    penalty += PENALTY[f.severity] ?? 0;
  }

  const score = Math.max(0, Math.min(100, 100 - penalty));
  return { counts, score, total: findings.length };
}

export function scoreLabel(score) {
  if (score >= 90) return '🟢 Bom';
  if (score >= 70) return '🟡 Aceitável';
  if (score >= 45) return '🟠 Fraco';
  return '🔴 Crítico';
}

export function sortFindings(findings) {
  return [...findings].sort(
    (a, b) => (SEVERITY[b.severity] ?? 0) - (SEVERITY[a.severity] ?? 0),
  );
}

export { PermissionFlagsBits };
