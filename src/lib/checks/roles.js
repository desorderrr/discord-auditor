import { PermissionFlagsBits as P } from 'discord.js';
import { PING_GAMES } from '../pingRoles.js';

const DEFAULT_NAMES = /^(new role|novo cargo|cargo novo|role|new-role|cargo)$/i;
const MAX_ROLES = 80;

/** Cargos de ping são opt-in: podem estar vazios sem ser "poluição". */
const PING_ROLE_NAMES = new Set(PING_GAMES.map((g) => g.roleName));

export const roleChecks = [
  {
    id: 'role.empty',
    area: 'roles',
    async run({ guild, membersFetched }) {
      if (!membersFetched) return null;

      const empty = guild.roles.cache.filter(
        (role) =>
          role.id !== guild.id &&
          !role.managed &&
          !PING_ROLE_NAMES.has(role.name) &&
          role.members.size === 0,
      );
      if (empty.size < 2) return null;

      const withPerms = empty.filter((r) => r.permissions.bitfield !== 0n);

      return {
        severity: withPerms.size ? 'medium' : 'low',
        title: `${empty.size} cargo(s) sem nenhum membro`,
        detail:
          empty
            .map((r) => `• **${r.name}** — ${r.hexColor}${r.permissions.bitfield ? ' (com permissões)' : ''}`)
            .slice(0, 15)
            .join('\n') +
          (withPerms.size
            ? `\n\n⚠️ ${withPerms.size} destes cargos têm permissões ativas: são permissões "adormecidas" que ninguém está a usar e que podem ser atribuídas por engano.`
            : '\n\nCargos sem membros só poluem a lista e a hierarquia.'),
        fix: {
          risk: 'risky',
          description: `Apagar ${empty.size} cargo(s) sem membros`,
          async run({ guild: g }) {
            let count = 0;
            for (const role of empty.values()) {
              const current = g.roles.cache.get(role.id);
              if (!current || current.members.size > 0) continue;
              if (current.position >= g.members.me.roles.highest.position) continue;
              try {
                await current.delete('Auditoria: cargo sem membros');
                count += 1;
              } catch {
                // cargo acima do bot ou gerido por integração
              }
            }
            return `${count} cargo(s) apagado(s).`;
          },
        },
      };
    },
  },

  {
    id: 'role.duplicates',
    area: 'roles',
    async run({ guild }) {
      const groups = new Map();
      for (const role of guild.roles.cache.values()) {
        if (role.id === guild.id || role.managed) continue;
        const key = role.name.trim().toLowerCase();
        groups.set(key, [...(groups.get(key) ?? []), role]);
      }
      const dupes = [...groups.values()].filter((list) => list.length > 1);
      if (!dupes.length) return null;

      return {
        severity: 'low',
        title: `${dupes.length} nome(s) de cargo duplicado(s)`,
        detail:
          dupes
            .map((list) => `• **${list[0].name}** ×${list.length}`)
            .slice(0, 15)
            .join('\n') +
          '\n\nCargos com o mesmo nome tornam a atribuição e os logs ambíguos.',
        manual: 'Renomear ou fundir os duplicados.',
      };
    },
  },

  {
    id: 'role.default-names',
    area: 'roles',
    async run({ guild }) {
      const unfilled = guild.roles.cache.filter(
        (role) => role.id !== guild.id && !role.managed && DEFAULT_NAMES.test(role.name.trim()),
      );
      if (!unfilled.size) return null;

      return {
        severity: 'medium',
        title: `${unfilled.size} cargo(s) com nome por preencher`,
        detail:
          unfilled.map((r) => `• **${r.name}** (${r.members.size} membro(s))`).join('\n') +
          '\n\nCargos com o nome padrão não dizem nada aos membros e normalmente têm permissões esquecidas.',
        manual: 'Renomear para o propósito real (ex.: "Membro", "Verificado", "Staff").',
      };
    },
  },

  {
    id: 'role.unmanageable',
    area: 'roles',
    async run({ guild }) {
      const me = guild.members.me;
      const above = guild.roles.cache.filter(
        (role) =>
          role.id !== guild.id &&
          role.id !== me.roles.highest.id &&
          role.position >= me.roles.highest.position &&
          role.permissions.has(P.ManageGuild | P.Administrator),
      );
      if (!above.size) return null;

      const duplicateNames = above.some(
        (role) =>
          guild.roles.cache.filter(
            (r) => r.name.trim().toLowerCase() === role.name.trim().toLowerCase(),
          ).size > 1,
      );

      return {
        severity: 'info',
        title: `${above.size} cargo(s) acima do cargo do bot`,
        detail:
          above
            .map((r) => `• **${r.name}** — posição ${r.position} · id \`${r.id}\``)
            .join('\n') +
          `\n\nO cargo mais alto do bot é **${me.roles.highest.name}** (posição ${me.roles.highest.position}). ` +
          'O Discord não deixa um bot alterar cargos que estão acima do dele.' +
          (duplicateNames
            ? '\n\n🔎 Há cargos com o mesmo nome (ex.: mais do que um "Bot"). Usa o **id** para saber qual é qual.'
            : '') +
          '\n\nPara o bot poder corrigir estes cargos, arrasta o cargo dele para cima deles em Definições → Cargos.',
        manual: 'Definições → Cargos → arrastar o cargo do bot para cima destes.',
      };
    },
  },

  {
    id: 'role.risky-mass',
    area: 'roles',
    async run({ guild, membersFetched }) {
      if (!membersFetched || guild.members.cache.size < 20) return null;
      const dangerous = [P.Administrator, P.BanMembers, P.KickMembers, P.ManageGuild, P.ManageRoles];
      const threshold = guild.members.cache.size * 0.5;

      const broad = guild.roles.cache.filter(
        (role) =>
          role.id !== guild.id &&
          !role.managed &&
          role.members.size >= threshold &&
          role.permissions.any(dangerous),
      );
      if (!broad.size) return null;

      return {
        severity: 'high',
        title: `${broad.size} cargo(s) com permissões de moderação dados a mais de metade do servidor`,
        detail:
          broad
            .map((r) => `• **${r.name}** — ${r.members.size} membros com ${r.permissions.toArray().filter((p) => ['Administrator', 'BanMembers', 'KickMembers', 'ManageGuild', 'ManageRoles'].includes(p)).join(', ')}`)
            .join('\n') +
          '\n\nPermissões de moderação devem estar em cargos pequenos e de confiança.',
        manual: 'Mover essas permissões para um cargo de staff separado.',
      };
    },
  },

  {
    id: 'role.bloat',
    area: 'roles',
    async run({ guild }) {
      const total = guild.roles.cache.size - 1;
      if (total <= MAX_ROLES) return null;

      return {
        severity: 'info',
        title: `${total} cargos (acima de ${MAX_ROLES})`,
        detail:
          'Listas de cargos muito longas tornam-se impossíveis de gerir e escondem cargos com permissões perigosas.',
      };
    },
  },
];
