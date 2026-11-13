/**
 * Inspeção da estrutura do servidor SÓ via REST (não abre sessão de gateway),
 * por isso pode correr com o bot ligado.
 *
 *   npm run inspect
 */
import 'dotenv/config';
import { ChannelType, REST, Routes } from 'discord.js';

const token = process.env.DISCORD_TOKEN;
const guildId = process.env.GUILD_ID;

if (!token || !guildId || token.startsWith('cola-o-token')) {
  console.error('❌ Preenche DISCORD_TOKEN e GUILD_ID no .env.');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(token);

const ICON = {
  [ChannelType.GuildText]: '#',
  [ChannelType.GuildVoice]: '🔊',
  [ChannelType.GuildAnnouncement]: '📢',
  [ChannelType.GuildForum]: '💬',
  [ChannelType.GuildStageVoice]: '🎙️',
};

try {
  const [channels, roles] = await Promise.all([
    rest.get(Routes.guildChannels(guildId)),
    rest.get(Routes.guildRoles(guildId)),
  ]);

  const byPos = (a, b) => a.position - b.position;
  const categories = channels.filter((c) => c.type === ChannelType.GuildCategory).sort(byPos);
  const loose = channels.filter((c) => c.type !== ChannelType.GuildCategory && !c.parent_id);

  console.log('\n📋 ESTRUTURA\n');

  for (const cat of categories) {
    const children = channels.filter((c) => c.parent_id === cat.id).sort(byPos);
    const hidden = children.length === 0 ? ' (vazia)' : '';
    console.log(`${cat.name}${hidden}`);
    for (const c of children) {
      console.log(`   ${ICON[c.type] ?? '?'}${c.name}${c.topic ? '' : c.type === ChannelType.GuildText ? '   (sem tópico)' : ''}`);
    }
  }

  if (loose.length) {
    console.log('\n(sem categoria)');
    for (const c of loose) console.log(`   ${ICON[c.type] ?? '?'}${c.name}`);
  }

  const sortedRoles = [...roles].sort((a, b) => b.position - a.position);
  console.log(`\n🎭 CARGOS (${sortedRoles.length - 1})`);
  for (const r of sortedRoles) {
    if (r.name === '@everyone') continue;
    const flags = [
      r.managed ? 'managed' : '',
      (BigInt(r.permissions) & 8n) === 8n ? 'ADMIN' : '',
    ].filter(Boolean).join(' ');
    console.log(`   ${r.name}${flags ? `  [${flags}]` : ''}`);
  }

  const textCount = channels.filter((c) => c.type === ChannelType.GuildText).length;
  const voiceCount = channels.filter((c) => c.type === ChannelType.GuildVoice).length;
  console.log(`\n${categories.length} categorias · ${textCount} texto · ${voiceCount} voz · ${sortedRoles.length - 1} cargos\n`);
} catch (err) {
  console.error(`❌ Erro: ${err.message}`);
  if (err.code === 401) console.error('   Token inválido. Faz Reset Token no portal.');
  process.exit(1);
}
