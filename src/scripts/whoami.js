/**
 * Diagnóstico rápido: em que servidores está o bot?
 * Uso: npm run whoami
 */
import { Client, Events, GatewayIntentBits } from 'discord.js';
import { config, assertConfig } from '../config.js';

try {
  assertConfig();
} catch (err) {
  console.error(`❌ ${err.message}`);
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, async (c) => {
  console.log(`\n🤖 Bot: ${c.user.tag} (${c.user.id})`);

  const guilds = [...c.guilds.cache.values()].sort((a, b) => b.memberCount - a.memberCount);
  if (!guilds.length) {
    console.log('\n⚠️  O bot não está em NENHUM servidor. Usa `npm run invite`.\n');
  } else {
    console.log(`\n📋 Servidores (${guilds.length}):`);
    for (const g of guilds) {
      const mark = g.id === config.guildId ? '  ✅ ← GUILD_ID do .env' : '';
      console.log(`   ${g.name} · ${g.id} · ${g.memberCount} membros${mark}`);
    }
  }

  const target = c.guilds.cache.get(config.guildId);
  console.log(
    target
      ? `\n✅ GUILD_ID ${config.guildId} corresponde a "${target.name}".`
      : `\n❌ GUILD_ID ${config.guildId} NÃO corresponde a nenhum servidor do bot.`,
  );

  const invites = await c.generateInvite({
    scopes: ['bot', 'applications.commands'],
    permissions: 805391536n,
  });
  console.log(`\n🔗 Link de convite:\n   ${invites}\n`);

  client.destroy();
  process.exit(0);
});

client.login(config.token).catch((err) => {
  console.error('❌ Falha no login:', err.message);
  process.exit(1);
});
