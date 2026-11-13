import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { runAudit, areas } from '../lib/audit.js';
import { AREA_LABEL, scoreLabel, summarize } from '../lib/util.js';
import { buildReportEmbeds, saveReport } from '../lib/report.js';
import { permissionWarning } from '../lib/preflight.js';

export const areaChoices = areas.map((area) => ({ name: AREA_LABEL[area], value: area }));

export default {
  data: new SlashCommandBuilder()
    .setName('audit')
    .setDescription('Analisa o servidor e mostra um relatório de problemas (não altera nada).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addStringOption((option) =>
      option
        .setName('area')
        .setDescription('Limitar a auditoria a uma área específica')
        .addChoices(...areaChoices),
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guild = interaction.guild;
    const area = interaction.options.getString('area');
    const warning = permissionWarning(guild);

    const findings = await runAudit(guild, { areas: area ? [area] : null });
    const paths = await saveReport(guild, findings);
    const embeds = buildReportEmbeds(guild, findings);
    const { score, total } = summarize(findings);

    const header = [
      warning,
      `📄 Relatório completo: \`${paths.markdown}\``,
      `Sugestão: \`/fix\` mostra o que pode ser corrigido automaticamente.`,
    ]
      .filter(Boolean)
      .join('\n');

    await interaction.editReply({ content: header, embeds });

    console.log(
      `[audit] ${guild.name} (${guild.id}) → ${total} problema(s), pontuação ${score}/100 (${scoreLabel(score)}).`,
    );
  },
};
