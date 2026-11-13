import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';

/**
 * Fonte única dos cargos de ping.
 * `roleName` tem de coincidir com o cargo no servidor (blueprint/target.js).
 */
export const PING_GAMES = [
  { roleName: '🔫 CS2', label: 'Counter-Strike 2', emoji: '🔫' },
  { roleName: '🪖 Battlefield 6', label: 'Battlefield 6', emoji: '🪖' },
  { roleName: '🧟 DayZ', label: 'DayZ', emoji: '🧟' },
  { roleName: '🎮 Arma', label: 'Arma', emoji: '🎮' },
  { roleName: '🪂 Squad', label: 'Squad', emoji: '🪂' },
  { roleName: '🚨 Ready or Not', label: 'Ready or Not', emoji: '🚨' },
  { roleName: '🎯 EFT', label: 'Escape from Tarkov', emoji: '🎯' },
  { roleName: '⛏️ Minecraft', label: 'Minecraft', emoji: '⛏️' },
  { roleName: '🌴 GTA VI', label: 'GTA VI', emoji: '🌴' },
  { roleName: '🔔 Notícias', label: 'Notícias', emoji: '🔔' },
];

/** Devolve apenas os jogos cujo cargo existe no servidor. */
export function resolvePingRoles(guild) {
  return PING_GAMES.map((game) => {
    const role = guild.roles.cache.find((r) => r.name === game.roleName);
    return role ? { ...game, role } : null;
  }).filter(Boolean);
}

/** Botões em linhas de 5 (máximo do Discord). */
export function buildPingComponents(resolved) {
  const buttons = resolved.map(({ role, label, emoji }) =>
    new ButtonBuilder()
      .setCustomId(`ping:${role.id}`)
      .setLabel(label)
      .setEmoji(emoji)
      .setStyle(ButtonStyle.Secondary),
  );

  const rows = [];
  for (let i = 0; i < buttons.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
  }
  return rows;
}

/** Trata o clique num botão de ping: adiciona ou remove o cargo. */
export async function handlePingButton(interaction) {
  const roleId = interaction.customId.slice('ping:'.length);
  const guild = interaction.guild;
  const role = guild.roles.cache.get(roleId);
  const game = PING_GAMES.find((g) => g.roleName === role?.name);

  if (!role || !game) {
    await interaction.reply({
      content: '❌ Este cargo já não existe. Pede à staff para republicar o painel.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const me = guild.members.me;
  if (me.roles.highest.position <= role.position) {
    await interaction.reply({
      content: `❌ O cargo do bot está abaixo de **${role.name}**; não consigo geri-lo.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const member = interaction.member;
  const has = member.roles.cache.has(role.id);

  try {
    if (has) {
      await member.roles.remove(role, 'Cargos: escolha do membro');
    } else {
      await member.roles.add(role, 'Cargos: escolha do membro');
    }
  } catch (err) {
    await interaction.reply({
      content: `❌ Não consegui alterar o cargo: ${err.message}`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.reply({
    content: has
      ? `➖ Removido **${role.name}**. Deixas de receber estes pings.`
      : `➕ Adicionado **${role.name}**. Vais ser avisado quando alguém usar @${role.name}.`,
    flags: MessageFlags.Ephemeral,
  });
}
