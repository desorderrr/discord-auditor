import {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { buildPingComponents, resolvePingRoles, PING_GAMES } from '../lib/pingRoles.js';

export default {
  data: new SlashCommandBuilder()
    .setName('cargos')
    .setDescription('Painel de cargos de ping dos jogos.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((sub) =>
      sub
        .setName('publicar')
        .setDescription('Publica (ou republica) o painel de cargos no canal #boas-vindas')
        .addChannelOption((option) =>
          option
            .setName('canal')
            .setDescription('Canal onde publicar (por omissão #cargos)')
            .setRequired(false),
        ),
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guild = interaction.guild;
    const resolved = resolvePingRoles(guild);

    if (!resolved.length) {
      await interaction.editReply(
        '❌ Não encontrei nenhum cargo de ping. Corre `npm run blueprint -- --apply` primeiro.',
      );
      return;
    }

    const target =
      interaction.options.getChannel('canal') ??
      guild.channels.cache.find((c) => c.name === 'boas-vindas') ??
      interaction.channel;

    const missing = PING_GAMES.length - resolved.length;

    const embed = new EmbedBuilder()
      .setTitle('🎮 Cargos de ping')
      .setDescription(
        'Clica nos jogos que jogas para **receber** os pings. Clica outra vez para **deixar de receber**.\n\n' +
          resolved.map(({ emoji, label }) => `${emoji} **${label}**`).join('\n') +
          '\n\nPodes escolher quantos quiseres — cada botão é independente.',
      )
      .setColor(0x5865f2)
      .setFooter({ text: 'Só tu vês a confirmação. Ninguém sabe o que escolheste.' });

    if (missing > 0) {
      embed.addFields({
        name: '⚠️ Cargos em falta',
        value: `${missing} cargo(s) ainda não existem no servidor. Corre \`npm run blueprint -- --apply\`.`,
      });
    }

    try {
      await target.send({ embeds: [embed], components: buildPingComponents(resolved) });
    } catch (err) {
      if (err?.code === 50013) {
        await interaction.editReply(
          `❌ Não tenho permissão para publicar em ${target}.\n\n` +
            'Dá ao bot **Enviar mensagens** nesse canal, ou corre `npm run blueprint -- --apply` ' +
            '(com o bot parado) — isso corrige automaticamente.',
        );
        return;
      }
      throw err;
    }

    await interaction.editReply(`✅ Painel publicado em ${target}.`);
  },
};
