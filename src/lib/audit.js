import { config } from '../config.js';
import { checks, areas as ALL_AREAS } from './checks/index.js';
import { sortFindings } from './util.js';

const MAX_MEMBERS_FETCH = 25_000;

/**
 * Corre todas as verificações e devolve a lista de problemas.
 * Cada problema: { id, area, severity, title, detail, manual?, fix? }
 */
export async function runAudit(guild, { areas = null } = {}) {
  const selected = areas?.length ? ALL_AREAS.filter((a) => areas.includes(a)) : ALL_AREAS;
  const activeChecks = checks.filter((c) => selected.includes(c.area));

  const ctx = {
    guild,
    config,
    membersFetched: false,
  };

  const membersAllowed =
    config.fetchMembers &&
    config.membersIntentEnabled !== false &&
    guild.memberCount <= MAX_MEMBERS_FETCH;

  if (membersAllowed) {
    try {
      await guild.members.fetch({ time: 180_000 });
      ctx.membersFetched = true;
    } catch {
      ctx.membersFetched = false;
    }
  }

  const findings = [];

  for (const check of activeChecks) {
    try {
      const result = await check.run(ctx);
      const list = Array.isArray(result) ? result : [result];
      for (const finding of list) {
        if (!finding) continue;
        findings.push({ id: check.id, area: check.area, ...finding });
      }
    } catch (err) {
      findings.push({
        id: check.id,
        area: check.area,
        severity: 'info',
        title: `Verificação \`${check.id}\` falhou`,
        detail: `Não foi possível concluir esta verificação: ${err.message}`,
        error: true,
      });
    }
  }

  if (config.fetchMembers && !ctx.membersFetched) {
    const reason =
      guild.memberCount > MAX_MEMBERS_FETCH
        ? `O servidor tem ${guild.memberCount} membros (acima do limite de ${MAX_MEMBERS_FETCH}); a lista completa não foi carregada por ser demasiado pesada.`
        : 'O intent privilegiado **Server Members** não está ativo (ou falhou o pedido da lista de membros).';

    findings.push({
      id: 'meta.members',
      area: 'security',
      severity: 'info',
      title: 'Lista de membros indisponível',
      detail:
        `${reason}\n\n` +
        'Verificações saltadas: cargos vazios, bots com Administrador, permissões de moderação dados a mais de metade do servidor e deteção de entradas em massa (raid).',
      manual:
        'Developer Portal → tua app → Bot → Privileged Gateway Intents → **Server Members Intent** → Save Changes. Depois reinicia o bot.',
    });
  }

  return sortFindings(findings);
}

export { ALL_AREAS as areas };
