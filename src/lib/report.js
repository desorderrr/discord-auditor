import { EmbedBuilder } from 'discord.js';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  AREA_LABEL,
  SEVERITY_EMOJI,
  SEVERITY_LABEL,
  formatDate,
  scoreLabel,
  sortFindings,
  summarize,
  truncate,
} from './util.js';

const MAX_EMBEDS = 10;
const MAX_FIELDS_PER_EMBED = 25;
const MAX_EMBED_CHARS = 5200; // o Discord corta acima de 6000 por embed

const fixable = (f) => Boolean(f.fix);

function embedChars(embed) {
  const d = embed.data;
  return (
    (d.title?.length ?? 0) +
    (d.description?.length ?? 0) +
    (d.footer?.text?.length ?? 0) +
    (d.fields ?? []).reduce((sum, field) => sum + field.name.length + field.value.length, 0)
  );
}

function findingField(finding) {
  const lines = [truncate(finding.detail, 900)];

  if (finding.fix) {
    const risk = finding.fix.risk === 'risky' ? ' (⚠️ arriscada)' : '';
    lines.push(`\n**Correção automática${risk}:** ${finding.fix.description}`);
  } else if (finding.manual) {
    lines.push(`\n**Correção manual:** ${finding.manual}`);
  }

  return {
    name: truncate(
      `${SEVERITY_EMOJI[finding.severity]} ${finding.title}`,
      256,
    ),
    value: truncate(lines.join(''), 1020),
  };
}

export function buildReportEmbeds(guild, findings, { applied = null } = {}) {
  const { counts, score, total } = summarize(findings);
  const autoFixable = findings.filter(fixable).length;

  const summary = new EmbedBuilder()
    .setTitle(`🩺 Auditoria — ${truncate(guild.name, 200)}`)
    .setDescription(
      total === 0
        ? '✅ Não foram encontrados problemas nas verificações executadas.'
        : `**Pontuação: ${score}/100 — ${scoreLabel(score)}**\n` +
            `Encontrados **${total}** problema(s), dos quais **${autoFixable}** têm correção automática.`,
    )
    .addFields(
      {
        name: 'Problemas',
        value:
          `🟥 Crítico: **${counts.critical}**\n` +
          `🟧 Alto: **${counts.high}**\n` +
          `🟨 Médio: **${counts.medium}**\n` +
          `🟦 Baixo: **${counts.low}**\n` +
          `⬜ Info: **${counts.info}**`,
        inline: true,
      },
      {
        name: 'Servidor',
        value:
          `Membros: **${guild.memberCount}**\n` +
          `Canais: **${guild.channels.cache.size}**\n` +
          `Cargos: **${guild.roles.cache.size - 1}**`,
        inline: true,
      },
      {
        name: 'Modo',
        value: applied
          ? 'Correções **aplicadas** (ver abaixo).'
          : 'Apenas relatório (**dry-run**). Usa `/fix` para corrigir.',
        inline: false,
      },
    )
    .setFooter({ text: `ID do servidor: ${guild.id} · ${formatDate(new Date())}` })
    .setColor(score >= 70 ? 0x57f287 : score >= 45 ? 0xfee75c : 0xed4245);

  const embeds = [summary];
  const maxFindingsEmbeds = applied ? MAX_EMBEDS - 1 : MAX_EMBEDS;
  let current = null;

  for (const finding of sortFindings(findings.filter((f) => !f.error))) {
    const field = findingField(finding);
    const fieldSize = field.name.length + field.value.length + 2;

    const needsNew =
      !current ||
      (current.data.fields?.length ?? 0) >= MAX_FIELDS_PER_EMBED ||
      embedChars(current) + fieldSize > MAX_EMBED_CHARS;

    if (needsNew) {
      if (embeds.length >= maxFindingsEmbeds) break;
      current = new EmbedBuilder()
        .setColor(
          finding.severity === 'critical'
            ? 0xed4245
            : finding.severity === 'high'
              ? 0xe67e22
              : finding.severity === 'medium'
                ? 0xfee75c
                : 0x5865f2,
        )
        .setTitle(AREA_LABEL[finding.area] ?? finding.area);
      embeds.push(current);
    }
    current.addFields(field);
  }

  if (applied) {
    const appliedOk = applied.filter((r) => r.status === 'applied');
    const failed = applied.filter((r) => r.status === 'failed');
    const skipped = applied.filter((r) => r.status === 'skipped');

    const results = new EmbedBuilder()
      .setTitle('🛠️ Resultado das correções')
      .setColor(failed.length ? 0xfee75c : 0x57f287)
      .setDescription(
        `✅ Aplicadas: **${appliedOk.length}**\n` +
          `❌ Falharam: **${failed.length}**\n` +
          `⏭️ Ignoradas (arriscadas): **${skipped.length}**`,
      )
      .addFields(
        ...(appliedOk.length
          ? [
              {
                name: 'Aplicadas',
                value: truncate(
                  appliedOk.map((r) => `• ${r.finding.title} → ${r.message}`).join('\n'),
                  1000,
                ),
              },
            ]
          : []),
        ...(failed.length
          ? [
              {
                name: 'Falhas',
                value: truncate(
                  failed.map((r) => `• ${r.finding.title}: ${r.message}`).join('\n'),
                  1000,
                ),
              },
            ]
          : []),
      );

    if (embeds.length < MAX_EMBEDS) embeds.push(results);
    else embeds[MAX_EMBEDS - 1] = results;  }

  return embeds;
}

export function toMarkdown(guild, findings, { applied = null } = {}) {
  const { counts, score, total } = summarize(findings);
  const lines = [
    `# Auditoria — ${guild.name}`,
    '',
    `- **Servidor:** ${guild.name} (\`${guild.id}\`)`,
    `- **Data:** ${formatDate(new Date())}`,
    `- **Membros:** ${guild.memberCount}`,
    `- **Pontuação:** ${score}/100 (${scoreLabel(score)})`,
    `- **Problemas:** ${total} (crítico ${counts.critical}, alto ${counts.high}, médio ${counts.medium}, baixo ${counts.low}, info ${counts.info})`,
    '',
  ];

  const byArea = new Map();
  for (const finding of sortFindings(findings)) {
    byArea.set(finding.area, [...(byArea.get(finding.area) ?? []), finding]);
  }

  for (const [area, list] of byArea) {
    lines.push(`## ${AREA_LABEL[area] ?? area}`, '');
    for (const finding of list) {
      lines.push(
        `### ${SEVERITY_EMOJI[finding.severity]} [${SEVERITY_LABEL[finding.severity]}] ${finding.title}`,
        '',
        finding.detail,
        '',
      );
      if (finding.fix) {
        const risk = finding.fix.risk === 'risky' ? ' (arriscada)' : '';
        lines.push(`- **Correção automática${risk}:** ${finding.fix.description}`);
      }
      if (finding.manual) lines.push(`- **Correção manual:** ${finding.manual}`);
      lines.push(`- **Regra:** \`${finding.id}\``, '');
    }
  }

  if (applied) {
    lines.push('## Resultado das correções', '');
    for (const result of applied) {
      const icon =
        result.status === 'applied' ? '✅' : result.status === 'failed' ? '❌' : '⏭️';
      lines.push(
        `${icon} **${result.finding.title}** — ${
          result.status === 'applied'
            ? result.message
            : result.status === 'failed'
              ? `falhou: ${result.message}`
              : 'ignorada (correção arriscada)'
        }`,
      );
    }
    lines.push('');
  }

  lines.push('---', '_Relatório gerado automaticamente pelo discord-auditor._');

  return lines.join('\n');
}

/** Guarda o relatório em reports/ e devolve os caminhos. */
export async function saveReport(guild, findings, { applied = null, dir = 'reports' } = {}) {
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = path.join(dir, `${guild.id}-${stamp}`);

  await writeFile(`${base}.md`, toMarkdown(guild, findings, { applied }), 'utf8');
  await writeFile(
    `${base}.json`,
    JSON.stringify(
      {
        guild: { id: guild.id, name: guild.name, memberCount: guild.memberCount },
        generatedAt: new Date().toISOString(),
        summary: summarize(findings),
        findings: findings.map(({ fix, ...rest }) => ({
          ...rest,
          fix: fix ? { description: fix.description, risk: fix.risk } : undefined,
        })),
        applied,
      },
      null,
      2,
    ),
    'utf8',
  );

  return { markdown: `${base}.md`, json: `${base}.json` };
}
