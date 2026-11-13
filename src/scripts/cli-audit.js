/**
 * Auditoria por linha de comandos — sem slash commands.
 *
 * Uso:
 *   npm run audit
 *   npm run audit -- --area=security
 *   npm run audit -- --fix
 *   npm run audit -- --fix --risky
 *   npm run audit -- --json
 */
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { config, assertConfig, buildIntents } from '../config.js';
import { runAudit, areas as ALL_AREAS } from '../lib/audit.js';
import { applyFixes } from '../lib/fixer.js';
import { saveReport, toMarkdown } from '../lib/report.js';
import { isDisallowedIntents } from '../lib/util.js';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];

const apply = flag('fix');
const allowRisky = flag('risky');
const noSave = flag('no-save');
const asJson = flag('json');

const areaArg = option('area');
if (areaArg && !ALL_AREAS.includes(areaArg)) {
  console.error(`❌ Área inválida: "${areaArg}". Opções: ${ALL_AREAS.join(', ')}.`);
  process.exit(1);
}

try {
  assertConfig();
} catch (err) {
  console.error(`❌ ${err.message}`);
  process.exit(1);
}

async function auditWith(client) {
  try {
    const guild = await client.guilds.fetch(config.guildId);
    await guild.members.fetchMe();
    await guild.channels.fetch();
    await guild.roles.fetch();

    console.log(`🔍 A auditar "${guild.name}" (${guild.memberCount} membros)…\n`);

    const findings = await runAudit(guild, { areas: areaArg ? [areaArg] : null });

    let results = null;
    if (apply) {
      console.log('🛠️  A aplicar correções…\n');
      results = await applyFixes(findings, { guild, allowRisky });
      for (const r of results) {
        const icon = r.status === 'applied' ? '✅' : r.status === 'failed' ? '❌' : '⏭️';
        console.log(`${icon} ${r.finding.title} → ${r.message}`);
      }
      console.log('');
    }

    if (asJson) {
      console.log(
        JSON.stringify(
          {
            findings: findings.map(({ fix, ...rest }) => ({
              ...rest,
              fix: fix ? { description: fix.description, risk: fix.risk } : undefined,
            })),
            applied: results,
          },
          null,
          2,
        ),
      );
    } else {
      console.log(toMarkdown(guild, findings, { applied: results }));
    }

    if (!noSave) {
      const paths = await saveReport(guild, findings, { applied: results });
      console.log(`\n📄 Relatório guardado em:\n   ${paths.markdown}\n   ${paths.json}`);
    }

    if (!apply && findings.some((f) => f.fix)) {
      console.log(
        '\n💡 Há correções disponíveis. Aplica as seguras com `npm run audit -- --fix`' +
          ' (as arriscadas exigem `--risky`).',
      );
    }

    client.destroy();
    process.exit(0);
  } catch (err) {
    if (err?.code === 10004) {
      console.error(
        `❌ O bot não está no servidor ${config.guildId} (ou o GUILD_ID está errado).\n` +
          '   → `npm run whoami` mostra os servidores onde o bot está.\n' +
          '   → `npm run invite` gera o link para o adicionar.',
      );
    } else {
      console.error('❌ Erro na auditoria:', err);
    }
    client.destroy();
    process.exit(1);
  }
}

/** Liga e corre a auditoria. Devolve o cliente, ou lança o erro do login. */
async function connect(intents) {
  const client = new Client({ intents });
  client.once(Events.ClientReady, () => {
    config.membersIntentEnabled = client.options.intents.has(
      GatewayIntentBits.GuildMembers,
    );
    if (!config.membersIntentEnabled) {
      console.warn(
        '⚠️ Sem intent "Server Members": cargos vazios, bots com admin e deteção de raids ficam de fora.\n',
      );
    }
    auditWith(client);
  });

  await client.login(config.token);
  return client;
}

try {
  await connect(buildIntents());
} catch (err) {
  if (isDisallowedIntents(err) && config.membersIntent) {
    console.warn(
      '⚠️ "Used disallowed intents": o Server Members Intent não está ativo no portal.\n' +
        '   A repetir a auditoria sem esse intent…\n',
    );
    await connect(buildIntents({ members: false })).catch((e) => {
      console.error('❌ Falha no login:', e.message);
      process.exit(1);
    });
  } else {
    console.error('❌ Falha no login:', err.message);
    if (isDisallowedIntents(err)) {
      console.error(
        '\n   Ativa "Server Members Intent" em https://discord.com/developers/applications\n' +
          '   → Bot → Privileged Gateway Intents → Save Changes.',
      );
    }
    process.exit(1);
  }
}
