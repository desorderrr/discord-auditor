import { PermissionFlagsBits as P } from 'discord.js';

/** Permissões que o bot precisa para auditar (e corrigir) sem falhas. */
export const REQUIRED_PERMISSIONS = [
  P.ViewChannel,
  P.ManageChannels,
  P.ManageRoles,
  P.ManageGuild,
  P.ManageWebhooks,
  P.ViewAuditLog,
  P.SendMessages,
  P.EmbedLinks,
  P.ReadMessageHistory,
];

export function missingPermissions(guild) {
  const me = guild.members.me;
  if (!me) return ['(o bot não está neste servidor)'];
  const missing = me.permissions.missing(REQUIRED_PERMISSIONS);
  return missing;
}

export function permissionWarning(guild) {
  const missing = missingPermissions(guild);
  if (!missing.length) return null;
  return (
    '⚠️ Faltam permissões ao bot: **' +
    missing.join(', ') +
    '**. Algumas verificações vão ser ignoradas e as correções podem falhar.'
  );
}

export function isAuthorized(member, memberPermissions, auditRoleIds) {
  if (memberPermissions?.has(P.Administrator)) return true;
  if (auditRoleIds.length) {
    return auditRoleIds.some((id) => member.roles.cache.has(id));
  }
  return memberPermissions?.has(P.ManageGuild) ?? false;
}
