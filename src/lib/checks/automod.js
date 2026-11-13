import {
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleKeywordPresetType,
  AutoModerationRuleTriggerType as Trigger,
  GuildDefaultMessageNotifications,
  GuildExplicitContentFilter,
  GuildVerificationLevel,
  PermissionFlagsBits as P,
} from 'discord.js';

const DEFAULT_RULES = [
  {
    key: 'spam',
    name: 'Auditoria · Anti-spam',
    triggerType: Trigger.Spam,
    triggerMetadata: undefined,
  },
  {
    key: 'mentions',
    name: 'Auditoria · Menções em massa',
    triggerType: Trigger.MentionSpam,
    triggerMetadata: { mentionTotalLimit: 6 },
  },
  {
    key: 'preset',
    name: 'Auditoria · Conteúdo impróprio',
    triggerType: Trigger.KeywordPreset,
    triggerMetadata: {
      presets: [
        AutoModerationRuleKeywordPresetType.Profanity,
        AutoModerationRuleKeywordPresetType.SexualContent,
        AutoModerationRuleKeywordPresetType.Slurs,
      ],
    },
  },
];

const blockAction = (text) => [
  {
    type: AutoModerationActionType.BlockMessage,
    metadata: { customMessage: text },
  },
];

async function fetchRules(guild) {
  if (!guild.members.me.permissions.has(P.ManageGuild)) return { error: 'perms' };
  try {
    return { rules: await guild.autoModerationRules.fetch() };
  } catch (err) {
    return { error: err.message };
  }
}

export const automodChecks = [
  {
    id: 'am.read',
    area: 'automod',
    async run({ guild }) {
      if (guild.members.me.permissions.has(P.ManageGuild)) return null;
      return {
        severity: 'medium',
        title: 'Bot sem "Gerir servidor" — AutoMod não verificável',
        detail:
          'Sem esta permissão o bot não consegue ler nem criar regras de AutoMod, ' +
          'nem alterar o nível de verificação do servidor.',
        manual: 'Dar "Gerir servidor" ao cargo do bot.',
      };
    },
  },

  {
    id: 'am.missing',
    area: 'automod',
    async run({ guild }) {
      const { rules, error } = await fetchRules(guild);
      if (error) return null;

      const present = new Set(rules.map((r) => r.triggerType));
      const missing = DEFAULT_RULES.filter((d) => !present.has(d.triggerType));
      if (!missing.length) return null;

      const names = missing.map((m) => `• ${m.name}`).join('\n');

      return {
        severity: rules.size === 0 ? 'high' : 'medium',
        title:
          rules.size === 0
            ? 'AutoMod totalmente desativado'
            : `${missing.length} regra(s) de AutoMod em falta`,
        detail:
          `Regras existentes: **${rules.size}**.\n\nSeriam criadas:\n${names}\n\n` +
          'Sem AutoMod, spam, menções em massa e conteúdo impróprio só são travados à mão.',
        fix: {
          risk: 'safe',
          description: `Criar ${missing.length} regra(s) de AutoMod com bloqueio automático`,
          async run({ guild: g }) {
            const created = [];
            for (const rule of missing) {
              try {
                await g.autoModerationRules.create({
                  name: rule.name,
                  eventType: AutoModerationRuleEventType.MessageSend,
                  triggerType: rule.triggerType,
                  triggerMetadata: rule.triggerMetadata,
                  actions: blockAction(
                    'Mensagem bloqueada automaticamente pelo AutoMod do servidor.',
                  ),
                  enabled: true,
                  reason: 'Auditoria: proteção base em falta',
                });
                created.push(rule.name);
              } catch (err) {
                created.push(`${rule.name} (falhou: ${err.message})`);
              }
            }
            return `Regras criadas: ${created.join('; ')}.`;
          },
        },
      };
    },
  },

  {
    id: 'am.disabled',
    area: 'automod',
    async run({ guild }) {
      const { rules, error } = await fetchRules(guild);
      if (error) return null;

      const disabled = rules.filter((r) => !r.enabled);
      if (!disabled.size) return null;

      return {
        severity: 'medium',
        title: `${disabled.size} regra(s) de AutoMod desativada(s)`,
        detail: disabled.map((r) => `• **${r.name}** (${r.triggerType})`).join('\n'),
        fix: {
          risk: 'safe',
          description: `Ativar ${disabled.size} regra(s)`,
          async run() {
            let count = 0;
            for (const rule of disabled.values()) {
              await rule.setEnabled(true, 'Auditoria: regra desativada');
              count += 1;
            }
            return `${count} regra(s) ativada(s).`;
          },
        },
      };
    },
  },

  {
    id: 'am.verification',
    area: 'automod',
    async run({ guild }) {
      if (guild.verificationLevel >= GuildVerificationLevel.Medium) return null;
      const isNone = guild.verificationLevel === GuildVerificationLevel.None;

      return {
        severity: isNone ? 'high' : 'medium',
        title: isNone
          ? 'Nível de verificação: nenhum'
          : 'Nível de verificação: baixo',
        detail:
          'Com verificação baixa/nenhuma, contas acabadas de criar entram e podem fazer raid ' +
          'imediatamente (spam, links maliciosos, menções em massa).',
        manual: 'Definições do servidor → Moderação → Nível de verificação → "Médio".',
        fix: {
          risk: 'safe',
          description: isNone
            ? 'Subir verificação de "Nenhum" para "Baixo"'
            : 'Subir verificação de "Baixo" para "Médio"',
          async run({ guild: g }) {
            const target = isNone
              ? GuildVerificationLevel.Low
              : GuildVerificationLevel.Medium;
            await g.setVerificationLevel(target, 'Auditoria: nível de verificação demasiado baixo');
            return `Nível de verificação atualizado para ${target}.`;
          },
        },
      };
    },
  },

  {
    id: 'am.explicit-filter',
    area: 'automod',
    async run({ guild }) {
      if (guild.explicitContentFilter === GuildExplicitContentFilter.AllMembers) return null;
      return {
        severity: 'medium',
        title: 'Filtro de conteúdo explícito não cobre todos os membros',
        detail:
          'O filtro está desligado ou só se aplica a membros sem cargos. ' +
          'Com "todos os membros", imagens e texto explícitos são bloqueados antes de aparecerem.',
        fix: {
          risk: 'safe',
          description: 'Ativar filtro de conteúdo explícito para todos os membros',
          async run({ guild: g }) {
            await g.setExplicitContentFilter(
              GuildExplicitContentFilter.AllMembers,
              'Auditoria: filtro de conteúdo explícito',
            );
            return 'Filtro de conteúdo explícito ativado para todos os membros.';
          },
        },
      };
    },
  },

  {
    id: 'am.notifications',
    area: 'automod',
    async run({ guild }) {
      if (guild.defaultMessageNotifications !== GuildDefaultMessageNotifications.AllMessages) {
        return null;
      }
      return {
        severity: 'low',
        title: 'Notificações padrão: "todas as mensagens"',
        detail:
          'Cada mensagem em qualquer canal notifica o servidor inteiro. ' +
          'Contribui para fadiga de notificações e faz membros silenciarem o servidor.',
        fix: {
          risk: 'safe',
          description: 'Mudar notificações padrão para "apenas menções"',
          async run({ guild: g }) {
            await g.setDefaultMessageNotifications(
              GuildDefaultMessageNotifications.OnlyMentions,
              'Auditoria: excesso de notificações',
            );
            return 'Notificações padrão definidas para "apenas menções".';
          },
        },
      };
    },
  },

  {
    id: 'am.raid-joins',
    area: 'automod',
    async run({ guild, membersFetched }) {
      if (!membersFetched) return null;
      const hourAgo = Date.now() - 3_600_000;
      const recent = guild.members.cache.filter(
        (m) => m.joinedTimestamp && m.joinedTimestamp > hourAgo,
      );
      if (recent.size < 10) return null;

      return {
        severity: 'high',
        title: `⚠️ ${recent.size} entradas na última hora`,
        detail:
          'Um volume anormal de entradas pode indicar raid em curso.\n' +
          recent
            .first(10)
            .map((m) => `• ${m.user.tag}`)
            .join('\n') +
          '\n\nAção imediata: ativa o modo de quarentena, restringe convites e sobe a verificação.',
        manual:
          'Definições → Moderação → pausar convites / nível de verificação "Elevado" temporariamente.',
      };
    },
  },
];
