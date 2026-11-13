import { ChannelType, PermissionFlagsBits as P } from 'discord.js';
import {
  channelRef,
  daysSince,
  everyonePermissions,
  normalizeChannelName,
  snowflakeDate,
  textChannels,
} from '../util.js';

const MAX_CHANNELS = 60;
const MAX_DETAIL = 15;

const label = (channel) => channelRef(channel);

export const channelChecks = [
  {
    id: 'chan.naming',
    area: 'channels',
    async run({ guild }) {
      const bad = guild.channels.cache.filter((channel) => {
        if (channel.isThread() || channel.type === ChannelType.GuildCategory) return false;
        return normalizeChannelName(channel.name) !== channel.name;
      });
      if (!bad.size) return null;

      const list = bad
        .map((c) => `• ${label(c)} → \`${normalizeChannelName(c.name)}\``)
        .slice(0, MAX_DETAIL)
        .join('\n');

      return {
        severity: 'low',
        title: `${bad.size} canal(is) fora do padrão de nomes`,
        detail:
          `${list}\n\nNomes com maiúsculas, espaços ou acentos ficam inconsistentes e mais difíceis de referir em comandos.`,
        fix: {
          risk: 'safe',
          description: `Renomear ${bad.size} canal(is) para o padrão (minúsculas-com-hifen)`,
          async run({ guild: g }) {
            const takers = new Map();
            for (const c of g.channels.cache.values()) {
              const key = `${c.type}:${c.name.trim().toLowerCase()}`;
              if (!takers.has(key)) takers.set(key, new Set());
              takers.get(key).add(c.id);
            }

            let count = 0;
            const blocked = [];
            const failed = [];

            for (const channel of bad.values()) {
              const target = normalizeChannelName(channel.name);
              const ownKey = `${channel.type}:${channel.name.trim().toLowerCase()}`;
              const targetKey = `${channel.type}:${target}`;
              if (!target || target === channel.name) continue;

              // Só é colisão se OUTRO canal do mesmo tipo já usar esse nome.
              const owners = takers.get(targetKey) ?? new Set();
              if ([...owners].some((id) => id !== channel.id)) {
                blocked.push(`${channelRef(channel)} → ${target}`);
                continue;
              }

              try {
                await channel.setName(target, 'Auditoria: normalizar nome de canal');
                takers.get(ownKey)?.delete(channel.id);
                if (!takers.has(targetKey)) takers.set(targetKey, new Set());
                takers.get(targetKey).add(channel.id);
                count += 1;
              } catch (err) {
                failed.push(`${channelRef(channel)}: ${err.message}`);
              }
            }

            return (
              `${count} canal(is) renomeado(s).` +
              (blocked.length
                ? ` Ignorados por já existir outro canal do mesmo tipo com esse nome: ${blocked.join(', ')}.`
                : '') +
              (failed.length ? ` Falharam: ${failed.join('; ')}.` : '')
            );
          },
        },
      };
    },
  },

  {
    id: 'chan.no-category',
    area: 'channels',
    async run({ guild }) {
      const orphans = guild.channels.cache.filter(
        (c) =>
          !c.isThread() &&
          c.type !== ChannelType.GuildCategory &&
          !c.parentId,
      );
      if (orphans.size <= 1) return null;

      const list = orphans.map((c) => `• ${label(c)}`).slice(0, MAX_DETAIL).join('\n');

      return {
        severity: 'low',
        title: `${orphans.size} canal(is) sem categoria`,
        detail:
          `${list}\n\nCanais soltos no topo desorganizam a barra lateral e dificultam a navegação.`,
        manual:
          'Arrasta cada canal para uma categoria (ou cria categorias do tipo "📌 Início", "💬 Comunidade", "🔊 Voz", "🛠️ Staff").',
      };
    },
  },

  {
    id: 'chan.duplicates',
    area: 'channels',
    async run({ guild }) {
      const groups = new Map();
      for (const channel of guild.channels.cache.values()) {
        if (channel.isThread() || channel.type === ChannelType.GuildCategory) continue;
        // Nome igual em texto e voz é normal no Discord: só conta como duplicado no mesmo tipo.
        const key = `${channel.name.trim().toLowerCase()}|${channel.type}`;
        groups.set(key, [...(groups.get(key) ?? []), channel]);
      }
      const dupes = [...groups.values()].filter((list) => list.length > 1);
      if (!dupes.length) return null;

      const list = dupes
        .map((list) => `• ${list.map((c) => channelRef(c)).join(', ')}`)
        .slice(0, MAX_DETAIL)
        .join('\n');

      return {
        severity: 'low',
        title: `${dupes.length} nome(s) de canal duplicado(s)`,
        detail:
          `${list}\n\nCanais com o mesmo nome e o mesmo tipo geram confusão e menções erradas. ` +
          '(Nome igual em texto e em voz é normal e não é sinalizado.)',
      };
    },
  },

  {
    id: 'chan.no-topic',
    area: 'channels',
    async run({ guild }) {
      const empty = guild.channels.cache.filter((c) => {
        if (c.type !== ChannelType.GuildText && c.type !== ChannelType.GuildAnnouncement) {
          return false;
        }
        if (c.topic) return false;
        // Canais ocultos (staff/arquivo) não precisam de tópico para orientar ninguém.
        return everyonePermissions(c, guild).has(P.ViewChannel);
      });
      if (empty.size < 3) return null;

      const list = empty.map((c) => `• ${channelRef(c)}`).slice(0, MAX_DETAIL).join('\n');

      return {
        severity: 'low',
        title: `${empty.size} canal(is) de texto sem tópico`,
        detail:
          `${list}\n\nO tópico é o que aparece no topo do canal e serve de mini-regras/descrição. ` +
          'Melhora muito a orientação de membros novos.',
        manual: 'Canal → Editar canal → Tópico.',
      };
    },
  },

  {
    id: 'chan.dead',
    area: 'channels',
    async run({ guild, config }) {
      const limit = config?.deadChannelDays ?? 90;
      const dead = [];
      const never = [];

      for (const channel of textChannels(guild).values()) {
        const everyone = everyonePermissions(channel, guild);
        // Canais só de leitura (regras, anúncios) não são "mortos" por definição.
        if (!everyone.has(P.SendMessages)) continue;
        // Canais já ocultos (staff) não fazem o servidor parecer abandonado.
        if (!everyone.has(P.ViewChannel)) continue;

        const last = snowflakeDate(channel.lastMessageId);

        // Canal acabado de criar não está "morto" só por ainda não ter mensagens.
        const ageDays = (Date.now() - channel.createdTimestamp) / 86_400_000;
        if (Number.isFinite(ageDays) && ageDays < 14) continue;

        if (!last) {
          never.push(channel);
          continue;
        }
        const age = daysSince(last);
        if (age !== null && age >= limit) dead.push({ channel, age });
      }
      if (!dead.length && never.length < 3) return null;

      const parts = [];
      if (dead.length) {
        parts.push(
          `**Sem atividade há ${limit}+ dias (${dead.length}):**\n` +
            dead
              .sort((a, b) => b.age - a.age)
              .slice(0, MAX_DETAIL)
              .map((d) => `• ${channelRef(d.channel)} — ${d.age} dias`)
              .join('\n'),
        );
      }
      if (never.length) {
        parts.push(
          `**Nunca usados (${never.length}):**\n` +
            never.slice(0, MAX_DETAIL).map((c) => `• ${channelRef(c)}`).join('\n'),
        );
      }

      const targets = [...dead.map((d) => d.channel), ...never];

      return {
        severity: never.length >= 5 ? 'medium' : 'low',
        title: `${dead.length + never.length} canal(is) morto(s) ou vazio(s)`,
        detail: `${parts.join('\n\n')}\n\nCanais mortos passam a ideia de servidor abandonado.`,
        manual:
          'Arquiva (mover para uma categoria "🗄️ Arquivo" com @everyone sem "Ver canais") ou apaga os que já não fazem sentido.',
        fix: {
          risk: 'risky',
          description: `Mover ${targets.length} canal(is) para "🗄️ Arquivo" e esconder de @everyone`,
          async run({ guild: g }) {
            const ARCHIVE = '🗄️ Arquivo';

            let category = g.channels.cache.find(
              (c) => c.type === ChannelType.GuildCategory && c.name === ARCHIVE,
            );

            if (!category) {
              category = await g.channels.create({
                name: ARCHIVE,
                type: ChannelType.GuildCategory,
                permissionOverwrites: [
                  { id: g.roles.everyone.id, deny: [P.ViewChannel] },
                ],
                reason: 'Auditoria: arquivo de canais inativos',
              });
            }

            let moved = 0;
            const failed = [];

            for (const channel of targets) {
              try {
                const fresh = g.channels.cache.get(channel.id);
                if (!fresh) continue;

                if (fresh.parentId !== category.id) {
                  await fresh.setParent(category.id, {
                    lockPermissions: false,
                    reason: 'Auditoria: canal inativo',
                  });
                }

                await fresh.permissionOverwrites.edit(
                  g.roles.everyone,
                  { ViewChannel: false },
                  { reason: 'Auditoria: canal arquivado' },
                );
                moved += 1;
              } catch (err) {
                failed.push(`${channelRef(channel)}: ${err.message}`);
              }
            }

            return (
              `${moved} canal(is) movido(s) para **${ARCHIVE}** e ocultado(s) de @everyone.` +
              (failed.length ? ` Falharam: ${failed.join('; ')}.` : '')
            );
          },
        },
      };
    },
  },

  {
    id: 'chan.empty-categories',
    area: 'channels',
    async run({ guild }) {
      const categories = guild.channels.cache.filter(
        (c) => c.type === ChannelType.GuildCategory,
      );
      const empty = categories.filter(
        (cat) => !guild.channels.cache.some((c) => c.parentId === cat.id),
      );
      if (!empty.size) return null;

      return {
        severity: 'info',
        title: `${empty.size} categoria(s) vazia(s)`,
        detail: empty.map((c) => `• 📂 **${c.name}**`).join('\n'),
        fix: {
          risk: 'risky',
          description: `Apagar ${empty.size} categoria(s) vazia(s)`,
          async run({ guild: g }) {
            let count = 0;
            for (const cat of empty.values()) {
              const stillEmpty = !g.channels.cache.some((c) => c.parentId === cat.id);
              if (!stillEmpty) continue;
              await cat.delete('Auditoria: categoria vazia');
              count += 1;
            }
            return `${count} categoria(s) apagada(s).`;
          },
        },
      };
    },
  },

  {
    id: 'chan.nsfw-open',
    area: 'channels',
    async run({ guild }) {
      const open = guild.channels.cache.filter((channel) => {
        if (!('nsfw' in channel) || !channel.nsfw) return false;
        return everyonePermissions(channel, guild).has(P.ViewChannel);
      });
      if (!open.size) return null;

      return {
        severity: 'medium',
        title: `${open.size} canal(is) NSFW aberto(s) a @everyone`,
        detail:
          open.map((c) => `• ${channelRef(c)}`).join('\n') +
          '\n\nConteúdo NSFW visível a todos viola os Termos do Discord para membros menores de idade.',
        fix: {
          risk: 'risky',
          description: `Restringir ${open.size} canal(is) NSFW a maiores de idade`,
          async run({ guild: g }) {
            let count = 0;
            for (const channel of open.values()) {
              await channel.permissionOverwrites.edit(
                g.roles.everyone,
                { ViewChannel: false },
                { reason: 'Auditoria: canal NSFW aberto a @everyone' },
              );
              count += 1;
            }
            return `${count} canal(is) NSFW restringido(s) — cria um cargo de verificação de idade e dá-lhe acesso.`;
          },
        },
      };
    },
  },

  {
    id: 'chan.orphan-overwrites',
    area: 'channels',
    async run({ guild }) {
      const orphans = [];
      for (const channel of guild.channels.cache.values()) {
        if (channel.isThread()) continue;
        for (const overwrite of channel.permissionOverwrites.cache.values()) {
          if (overwrite.type !== 0) continue; // só cargos
          if (overwrite.id === guild.id) continue; // @everyone
          if (guild.roles.cache.has(overwrite.id)) continue;
          orphans.push({ channel, id: overwrite.id });
        }
      }
      if (!orphans.length) return null;

      const channels = [...new Set(orphans.map((o) => o.channel))];

      return {
        severity: 'low',
        title: `${orphans.length} permissão(ões) de cargo apagado`,
        detail:
          `${channels.slice(0, MAX_DETAIL).map((c) => `• ${channelRef(c)}`).join('\n')}\n\n` +
          'Overwrites de cargos que já não existem ficam penduradas e tornam a configuração de permissões ilegível.',
        fix: {
          risk: 'safe',
          description: `Limpar ${orphans.length} overwrite(s) órfã(s)`,
          async run() {
            let count = 0;
            for (const orphan of orphans) {
              try {
                await orphan.channel.permissionOverwrites.delete(
                  orphan.id,
                  'Auditoria: cargo apagado',
                );
                count += 1;
              } catch {
                // ignora
              }
            }
            return `${count} overwrite(s) removida(s).`;
          },
        },
      };
    },
  },

  {
    id: 'chan.bloat',
    area: 'channels',
    async run({ guild }) {
      const total = guild.channels.cache.filter((c) => !c.isThread()).size;
      if (total <= MAX_CHANNELS) return null;

      return {
        severity: 'info',
        title: `${total} canais (acima de ${MAX_CHANNELS})`,
        detail:
          'Servidores com demasiados canais têm menos atividade por canal e mais confusão. ' +
          'Considera consolidar temas e arquivar o resto.',
      };
    },
  },
];
