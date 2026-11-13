import { REST, Routes } from 'discord.js';
import { pathToFileURL } from 'node:url';
import { config, assertConfig } from '../config.js';
import audit from '../commands/audit.js';
import fix from '../commands/fix.js';
import cargos from '../commands/cargos.js';

export const commandData = [audit.data.toJSON(), fix.data.toJSON(), cargos.data.toJSON()];

/** Regista os slash commands no servidor indicado (efeito imediato). */
export async function deployCommands() {
  assertConfig();
  const rest = new REST({ version: '10' }).setToken(config.token);

  await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
    body: commandData,
  });

  return commandData.length;
}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  deployCommands()
    .then((count) => {
      console.log(`✅ ${count} slash command(s) registados no servidor ${config.guildId}.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Falha ao registar os comandos:', err.message);
      process.exit(1);
    });
}
