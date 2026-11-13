import { PermissionFlagsBits as P } from 'discord.js';
import { channelRef, everyonePermissions, permList } from '../util.js';

const EVERYONE_DANGEROUS = [
  P.Administrator,
  P.ManageGuild,
  P.ManageRoles,
  P.ManageChannels,
  P.ManageWebhooks,
  P.KickMembers,
  P.BanMembers,
  P.MentionEveryone,
];

const ADMIN_LIKE = [
  P.Administrator,
  P.ManageGuild,
  P.ManageRoles,
  P.ManageWebhooks,
  P.BanMembers,
  P.KickMembers,
];

/** Canais cujo nome sugere conteúdo que não devia estar aberto a todos. */
export const SENSITIVE_NAME =
  /(?:^|[^a-z0-9])(admin|staff|mods?|modera\w*|logs?|regist\w*|audit\w*|interno|internal|privad\w*|private|tickets?|relat\w*|report\w*|ban\w*|punish\w*|rh|financ\w*|backup|panic|emergency)(?=$|[^a-z0-9])/i;

export const securityChecks = [
  {
    id: 'sec.everyone-perms',
    area: 'security',
    async run({ guild }) {
      const everyone = guild.roles.everyone;
      const bad = EVERYONE_DANGEROUS.filter((bit) => everyone.permissions.has(bit));
      if (!bad.length) return null;

      return {
        severity: bad.includes(P.Administrator) ? 'critical' : 'high',
        title: '@everyone tem permissões perigosas',
        detail:
          `O cargo **@everyone** tem ${bad.length} permissõe(s) de risco: **${permList(bad)}**.\n` +
          'Qualquer pessoa que entre no servidor herda estes poderes imediatamente.',
        manual: 'Definições do servidor → Cargos → @everyone → desativar as permissões de administração/moderação.',
        fix: {
          risk: 'safe',
          description: `Remover ${permList(bad)} de @everyone`,
          async run({ guild: g }) {
            const role = g.roles.everyone;
            const before = role.permissions.bitfield;
            const after = role.permissions.remove(EVERYONE_DANGEROUS);
            await role.setPermissions(after, 'Auditoria: @everyone com permissões perigosas');
            return `@everyone atualizado (bits ${before} → ${after.bitfield}).`;
          },
        },
      };
    },
  },

  {
    id: 'sec.role-admin',
    area: 'security',
    async run({ guild, membersFetched }) {
      const risky = guild.roles.cache.filter(
        (role) => !role.managed && role.id !== guild.id && role.permissions.has(P.Administrator),
      );
      if (!risky.size) return null;

      const list = risky
        .map(
          (r) =>
            `• **${r.name}** (posição ${r.position}) — ${
              membersFetched ? `${r.members.size} membro(s)` : 'nº de membros desconhecido'
            }`,
        )
        .slice(0, 12)
        .join('\n');

      const me = guild.members.me;
      const blocked = risky.filter(
        (r) => r.id !== me.roles.highest.id && r.position >= me.roles.highest.position,
      );

      return {
        severity: risky.size > 2 ? 'high' : 'medium',
        title: `${risky.size} cargo(s) com Administrador`,
        detail:
          `${list}\n\nAdministrador ignora **todas** as permissões e restrições de canal. ` +
          'Deve estar reservado ao dono e a 1-2 cargos de confiança.' +
          (blocked.size
            ? `\n\n⚠️ **${blocked.size}** destes cargos estão acima do cargo mais alto do bot ` +
              `(**${me.roles.highest.name}**, posição ${me.roles.highest.position}) e não podem ser ` +
              'corrigidos enquanto o bot não subir na hierarquia.'
            : ''),
        manual: 'Reduzir esses cargos às permissões realmente necessárias.',
        fix: {
          risk: 'risky',
          description: `Remover Administrador de: ${risky
            .map((r) => r.name)
            .join(', ')
            .slice(0, 200)}`,
          async run({ guild: g }) {
            let count = 0;
            for (const role of risky.values()) {
              if (role.position >= g.members.me.roles.highest.position) continue;
              await role.setPermissions(
                role.permissions.remove(P.Administrator),
                'Auditoria: cargo sem necessidade de Administrador',
              );
              count += 1;
            }
            return `Administrador removido de ${count} cargo(s).`;
          },
        },
      };
    },
  },

  {
    id: 'sec.sensitive-channels',
    area: 'security',
    async run({ guild }) {
      const exposed = guild.channels.cache.filter((channel) => {
        if (channel.isThread()) return false;
        if (!SENSITIVE_NAME.test(channel.name)) return false;
        return everyonePermissions(channel, guild).has(P.ViewChannel);
      });
      if (!exposed.size) return null;

      const list = exposed.map((c) => `• ${channelRef(c)}`).slice(0, 15).join('\n');

      return {
        severity: exposed.size > 3 ? 'critical' : 'high',
        title: `${exposed.size} canal(is) sensível(is) visível(is) para @everyone`,
        detail:
          `${list}\n\nPelo nome, estes canais parecem ser internos (staff/moderação/logs) mas qualquer membro os consegue ler.`,
        manual: 'Canal → Editar canal → Permissões → @everyone → desativar "Ver canais".',
        fix: {
          risk: 'safe',
          description: `Ocultar ${exposed.size} canal(is) de @everyone`,
          async run({ guild: g }) {
            let count = 0;
            for (const channel of exposed.values()) {
              await channel.permissionOverwrites.edit(
                g.roles.everyone,
                { ViewChannel: false },
                { reason: 'Auditoria: canal interno exposto a @everyone' },
              );
              count += 1;
            }
            return `"Ver canais" desativado para @everyone em ${count} canal(is).`;
          },
        },
      };
    },
  },

  {
    id: 'sec.overwrite-admin',
    area: 'security',
    async run({ guild }) {
      const hits = [];
      for (const channel of guild.channels.cache.values()) {
        if (channel.isThread()) continue;
        for (const overwrite of channel.permissionOverwrites.cache.values()) {
          if (!overwrite.allow?.has(P.Administrator)) continue;
          const target =
            overwrite.type === 0
              ? guild.roles.cache.get(overwrite.id)
              : guild.members.cache.get(overwrite.id)?.user;
          hits.push({ channel, overwrite, name: target?.name ?? `desconhecido (${overwrite.id})` });
        }
      }
      if (!hits.length) return null;

      const list = hits
        .slice(0, 12)
        .map((h) => `• ${channelRef(h.channel)} → **${h.name}**`)
        .join('\n');

      return {
        severity: 'high',
        title: `Administrador concedido por overwrite em ${hits.length} caso(s)`,
        detail:
          `${list}\n\nPermissões de canal não devem conceder Administrador — nem em canais privados. ` +
          'Dá apenas as permissões específicas necessárias.',
        fix: {
          risk: 'risky',
          description: `Retirar Administrador das overwrites (${hits.length})`,
          async run({ guild: g }) {
            let count = 0;
            for (const hit of hits) {
              try {
                await hit.channel.permissionOverwrites.edit(
                  hit.overwrite.id,
                  { Administrator: null },
                  { reason: 'Auditoria: Administrador concedido por overwrite' },
                );
                count += 1;
              } catch {
                // ignora alvos que já não existem
              }
            }
            return `Administrador removido de ${count} overwrite(s).`;
          },
        },
      };
    },
  },

  {
    id: 'sec.mfa',
    area: 'security',
    async run({ guild }) {
      if (guild.mfaLevel === 1) return null;
      return {
        severity: 'medium',
        title: 'Exigência de 2FA desativada',
        detail:
          'Sem 2FA obrigatório, uma conta de moderador comprometida consegue fazer alterações destrutivas ' +
          '(apagar canais, banir em massa, expulsar todos).',
        manual:
          'Definições do servidor → Moderação → "Exigir autenticação de dois fatores" (só o **dono** pode ativar).',
      };
    },
  },

  {
    id: 'sec.invites',
    area: 'security',
    async run({ guild }) {
      let invites;
      try {
        invites = await guild.invites.fetch();
      } catch {
        return null;
      }
      const permanent = invites.filter((inv) => !inv.expiresAt && inv.maxUses === 0);
      if (!permanent.size) return null;

      const list = permanent
        .map((inv) => `• \`${inv.code}\` em ${channelRef(inv.channel)} — ${inv.uses} uso(s)`)
        .slice(0, 12)
        .join('\n');

      return {
        severity: permanent.size > 5 ? 'medium' : 'low',
        title: `${permanent.size} convite(s) permanente(s) e sem limite`,
        detail:
          `${list}\n\nConvites sem expiração e sem limite de usos são a via preferida de raids e contas descartáveis.`,
        fix: {
          risk: 'risky',
          description: `Apagar ${permanent.size} convite(s) permanente(s)`,
          async run({ guild: g }) {
            const fresh = await g.invites.fetch();
            let count = 0;
            for (const inv of fresh.filter((i) => !i.expiresAt && i.maxUses === 0).values()) {
              await inv.delete('Auditoria: convite permanente removido');
              count += 1;
            }
            return `${count} convite(s) apagado(s).`;
          },
        },
      };
    },
  },

  {
    id: 'sec.webhooks',
    area: 'security',
    async run(ctx) {
      const { guild } = ctx;
      let hooks;
      try {
        hooks = await guild.fetchWebhooks();
      } catch {
        return null;
      }

      const custom = hooks.filter((h) => !h.sourceGuild);
      if (!custom.size) return null;

      const orphans = custom.filter(
        (h) => h.owner && ctx.membersFetched && !guild.members.cache.has(h.owner.id),
      );

      const list = custom
        .map((h) => {
          const owner = h.owner ? `dono: ${h.owner.tag}` : 'dono desconhecido';
          return `• **${h.name}** em ${channelRef(h.channel)} (${owner})`;
        })
        .slice(0, 12)
        .join('\n');

      return {
        severity: orphans.size ? 'high' : 'low',
        title: `${custom.size} webhook(s) ativo(s)${orphans.size ? `, ${orphans.size} órfão(s)` : ''}`,
        detail:
          `${list}\n\n` +
          (orphans.size
            ? 'Webhooks cujo criador já não está no servidor podem continuar a enviar mensagens. Revê-os e apaga os que não usas.'
            : 'Webhooks são uma porta de entrada para spam. Apaga os que não estão a ser usados.'),
        fix:
          orphans.size > 0
            ? {
                risk: 'risky',
                description: `Apagar ${orphans.size} webhook(s) órfão(s)`,
                async run({ guild: g }) {
                  let count = 0;
                  for (const hook of orphans.values()) {
                    await hook.delete('Auditoria: webhook sem dono no servidor');
                    count += 1;
                  }
                  return `${count} webhook(s) apagado(s).`;
                },
              }
            : undefined,
      };
    },
  },

  {
    id: 'sec.bots-admin',
    area: 'security',
    async run(ctx) {
      if (!ctx.membersFetched) return null;
      const { guild } = ctx;
      const bots = guild.members.cache.filter(
        (m) =>
          m.user.bot &&
          m.id !== guild.members.me.id &&
          m.permissions.has(P.Administrator),
      );
      if (!bots.size) return null;

      const list = bots.map((m) => `• **${m.user.tag}**`).join('\n');

      return {
        severity: 'medium',
        title: `${bots.size} bot(s) com Administrador`,
        detail:
          `${list}\n\nBots não precisam de Administrador na maioria dos casos. ` +
          'Se um destes bots for comprometido, ganha controlo total do servidor.',
        manual: 'Substituir Administrador por um cargo com apenas as permissões que o bot realmente usa.',
      };
    },
  },

  {
    id: 'sec.audit-log',
    area: 'security',
    async run({ guild }) {
      if (!guild.members.me.permissions.has(P.ViewAuditLog)) {
        return {
          severity: 'info',
          title: 'Bot sem acesso ao registo de auditoria',
          detail:
            'Sem "Ver registo de auditoria" o bot não consegue investigar quem fez alterações recentes ' +
            '(expulsões em massa, criação de cargos, alterações de permissões).',
          manual: 'Dar a permissão "Ver registo de auditoria" ao cargo do bot.',
        };
      }
      return null;
    },
  },
];
