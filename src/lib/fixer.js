import { config } from '../config.js';

/**
 * Aplica as correções disponíveis nos findings.
 * Correções com risk "risky" só correm se allowRisky = true.
 */
export async function applyFixes(findings, { guild, allowRisky = false } = {}) {
  const results = [];

  for (const finding of findings.filter((f) => f.fix)) {
    if (finding.fix.risk === 'risky' && !allowRisky) {
      results.push({ finding, status: 'skipped', message: 'correção arriscada' });
      continue;
    }

    try {
      const message = await finding.fix.run({ guild, config });
      results.push({ finding, status: 'applied', message });
    } catch (err) {
      results.push({ finding, status: 'failed', message: err.message });
    }
  }

  return results;
}

/** Lista o que seria corrigido, sem tocar em nada. */
export function previewFixes(findings, { allowRisky = false } = {}) {
  return findings
    .filter((f) => f.fix)
    .map((f) => ({
      title: f.title,
      description: f.fix.description,
      risk: f.fix.risk,
      willRun: f.fix.risk !== 'risky' || allowRisky,
    }));
}
