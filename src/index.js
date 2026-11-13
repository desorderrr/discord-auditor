import { Client, Events, GatewayIntentBits, MessageFlags, Options } from 'discord.js';
import { config, assertConfig, buildIntents } from './config.js';
import auditCommand from './commands/audit.js';
import fixCommand from './commands/fix.js';
import cargosCommand from './commands/cargos.js';
import { deployCommands } from './scripts/deploy-commands.js';
import { isAuthorized } from './lib/preflight.js';
import { isDisallowedIntents } from './lib/util.js';
import { handlePingButton } from './lib/pingRoles.js';

try {
  assertConfig();
} catch (err) {
  console.error(`❌ ${err.message}`);
  process.exit(1);
}

const commands = new Map([
  [auditCommand.data.name, auditCommand],
  [fixCommand.data.name, fixCommand],
  [cargosCommand.data.name, cargosCommand],
]);

let runningClient = null;

/**
 * Caches mínimos: o bot não lê mensagens nem presenças, por isso não vale a pena
 * guardá-las. Reduz bastante o consumo (importante em planos de 100 MB).
 */
function makeClient(intents) {
  return new Client({
    intents,
    makeCache: Options.cacheWithLimits({
      ...Options.DefaultMakeCacheSettings,
      MessageManager: 0,
      PresenceManager: 0,
      ReactionManager: 0,
      GuildStickerManager: 0,
      GuildScheduledEventManager: 0,
    }),
  });
}

function attachHandlers(client) {
  client.once(Events.ClientReady, async (readyClient) => {
    config.membersIntentEnabled = readyClient.options.intents.has(
      GatewayIntentBits.GuildMembers,
    );

    console.log(`✅ Ligado como ${readyClient.user.tag}`);
    console.log(
      `   Servidor alvo: ${config.guildId} · membros: ${
        readyClient.guilds.cache.get(config.guildId)?.memberCount ?? '?'
      } · intent de membros: ${config.membersIntentEnabled ? 'ativo' : 'NÃO ativo'}`,
    );

    if (!config.membersIntentEnabled) {
      console.warn(
        '⚠️ A correr sem o intent "Server Members": verificação de cargos vazios,\n' +
          '   bots com Administrador e deteção de raids ficam desativadas.\n' +
          '   Ativa em https://discord.com/developers/applications → Bot →\n' +
          '   Privileged Gateway Intents → Server Members Intent → Save Changes.\n',
      );
    }

    if (!readyClient.guilds.cache.has(config.guildId)) {
      console.warn(
        `⚠️ O bot não está no servidor ${config.guildId}. Usa \`npm run invite\`.`,
      );
    }

    if (config.registerOnStart) {
      try {
        const count = await deployCommands();
        console.log(`✅ ${count} slash command(s) registados.`);
      } catch (err) {
        console.warn(`⚠️ Não foi possível registar os comandos: ${err.message}`);
      }
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isButton() && interaction.customId.startsWith('ping:')) {
      if (!interaction.inGuild()) return;
      try {
        await handlePingButton(interaction);
      } catch (err) {
        console.error('[ping] erro:', err);
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = commands.get(interaction.commandName);
    if (!command) return;

    if (!interaction.inGuild()) {
      await interaction.reply({
        content: '❌ Este bot só funciona dentro de um servidor.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const authorized = isAuthorized(
      interaction.member,
      interaction.memberPermissions,
      config.auditRoleIds,
    );

    if (!authorized) {
      await interaction.reply({
        content:
          '❌ Não tens permissão para usar este comando (precisas de **Gerir servidor**' +
          (config.auditRoleIds.length ? ' ou de um cargo autorizado' : '') +
          ').',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(`[${interaction.commandName}] erro:`, err);
      const payload = {
        content: `❌ Ocorreu um erro: ${err.message}`,
        flags: MessageFlags.Ephemeral,
      };
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
  });

  client.on(Events.Error, (err) => console.error('[client error]', err));
}

/** Liga com os intents pedidos; se o Discord recusar, tenta sem "Server Members". */
async function start() {
  const client = makeClient(buildIntents());
  attachHandlers(client);

  try {
    await client.login(config.token);
    runningClient = client;
    return;
  } catch (err) {
    if (!isDisallowedIntents(err) || !config.membersIntent) throw err;
  }

  console.warn(
    '⚠️ "Used disallowed intents": o intent Server Members não está ativado no portal.\n' +
      '   A arrancar sem ele (algumas verificações ficam desativadas)…\n',
  );
  client.destroy();

  const fallback = makeClient(buildIntents({ members: false }));
  attachHandlers(fallback);
  await fallback.login(config.token);
  runningClient = fallback;
}

process.on('SIGINT', () => {
  console.log('\nA desligar…');
  runningClient?.destroy();
  process.exit(0);
});

start().catch((err) => {
  console.error(`❌ Falha no login: ${err.message}`);

  if (isDisallowedIntents(err)) {
    console.error(
      '\n   Ativa "Server Members Intent" em:\n' +
        '   https://discord.com/developers/applications → tua app → Bot →\n' +
        '   Privileged Gateway Intents → Server Members Intent → Save Changes.\n' +
        '   (Confirma que clicaste em "Save Changes" e espera ~1 minuto.)',
    );
  } else if (err?.code === 'TokenInvalid' || /token/i.test(err?.message ?? '')) {
    console.error(
      '\n   O DISCORD_TOKEN está inválido. Faz Reset Token no portal e atualiza o .env.',
    );
  }

  process.exit(1);
});
