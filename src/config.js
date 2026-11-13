import 'dotenv/config';
import { GatewayIntentBits } from 'discord.js';

const bool = (value, fallback) => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'sim'].includes(String(value).toLowerCase());
};

const int = (value, fallback) => {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
};

export const config = {
  token: process.env.DISCORD_TOKEN ?? '',
  clientId: process.env.CLIENT_ID ?? '',
  guildId: process.env.GUILD_ID ?? '',
  registerOnStart: bool(process.env.REGISTER_ON_START, true),
  auditRoleIds: (process.env.AUDIT_ROLE_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
  fetchMembers: bool(process.env.FETCH_MEMBERS, true),
  deadChannelDays: int(process.env.DEAD_CHANNEL_DAYS, 90),
  /** Pedir o intent privilegiado "Server Members" (obrigatório para cargos vazios). */
  membersIntent: bool(process.env.ENABLE_MEMBERS_INTENT, true),
  /** Preenchido em runtime: o intent ficou realmente ativo nesta ligação. */
  membersIntentEnabled: null,
};

export function buildIntents({ members = config.membersIntent } = {}) {
  const intents = [GatewayIntentBits.Guilds];
  if (members) intents.push(GatewayIntentBits.GuildMembers);
  return intents;
}

export function assertConfig({ requireGuild = true } = {}) {
  const missing = [];
  if (!config.token) missing.push('DISCORD_TOKEN');
  if (!config.clientId) missing.push('CLIENT_ID');
  if (requireGuild && !config.guildId) missing.push('GUILD_ID');

  if (missing.length) {
    throw new Error(
      `Faltam variáveis no .env: ${missing.join(', ')}. Copia .env.example para .env e preenche os valores.`,
    );
  }
}
