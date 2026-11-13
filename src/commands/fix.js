import {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { runAudit } from '../lib/audit.js';
import { applyFixes, previewFixes } from '../lib/fixer.js';
import { buildReportEmbeds, saveReport } from '../lib/report.js';
import { permissionWarning } from '../lib/preflight.js';
import { truncate } from '../lib/util.js';
import { areaChoices } from './audit.js';

export default {
  data: new SlashCommandBuilder()
    .setName('fix')
    .setDescription('Mostra (ou aplica) as correções automáticas para os problemas encontrados.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addBooleanOption((option) =>
      option
        .setName('aplicar')
        .setDescription('Aplicar de facto as correções (por omissão só pré-visualiza)')
        .setRequired(false),
    )
    .addBooleanOption((option) =>
      option
        .setName('arriscadas')
        .setDescription('Incluir correções arriscadas (apagar cargos/canais, remover Administrador)')
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName('area')
        .setDescription('Limitar a uma área específica')
        .addChoices(...areaChoices),
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guild = interaction.guild;
    const apply = interaction.options.getBoolean('aplicar') ?? false;
    const allowRisky = interaction.options.getBoolean('arriscadas') ?? false;
    const area = interaction.options.getString('area');

    const findings = await runAudit(guild, { areas: area ? [area] : null });
    const warning = permissionWarning(guild);

    if (!apply) {
      const preview = previewFixes(findings, { allowRisky });

      if (!preview.length) {
        await interaction.editReply({
          content: '✅ Não há nada para corrigir automaticamente.',
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle('🔎 Pré-visualização das correções')
        .setDescription(
          'Nada foi alterado. Para aplicar, corre `/fix aplicar:true`.\n' +
            (allowRisky
              ? '⚠️ As **correções arriscadas estão incluídas** nesta pré-visualização.'
              : 'As correções arriscadas estão de fora (usa `arriscadas:true`).'),
        )
        .setColor(0xfee75c)
        .addFields(
          ...preview.slice(0, 20).map((item) => ({
            name: truncate(
              `${item.risk === 'risky' ? '⚠️ ' : ''}${item.title}`,
              256,
            ),
            value: truncate(
              `${item.description}${item.willRun ? '' : '\n*(não será aplicada sem `arriscadas:true`)*'}`,
              1020,
            ),
          })),
        );

      await interaction.editReply({ content: warning ?? undefined, embeds: [embed] });
      return;
    }

    const results = await applyFixes(findings, { guild, allowRisky });
    const paths = await saveReport(guild, findings, { applied: results });
    const embeds = buildReportEmbeds(guild, findings, { applied: results });

    await interaction.editReply({
      content: [warning, `📄 Relatório completo: \`${paths.markdown}\``]
        .filter(Boolean)
        .join('\n'),
      embeds,
    });
  },
};
