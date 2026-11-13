/**
 * Estrutura-alvo do servidor.
 *
 * `from` indica o(s) canal(is) que já existem e devem ser reaproveitados:
 * o primeiro encontrado é renomeado/movido; os restantes são arquivados
 * (conteúdo preservado, canal oculto).
 *
 * Nada é apagado: canais fundidos vão para a categoria de arquivo.
 */
export const blueprint = {
  archiveCategory: '🗄️ Arquivo',

  categories: [
    {
      name: '📌 INÍCIO',
      from: ['Welcome'],
      channels: [
        {
          name: 'boas-vindas',
          from: ['welcome'],
          readonly: true,
          topic: 'Começa aqui: lê as #regras e escolhe os teus jogos no painel.',
        },
        {
          name: 'entradas',
          readonly: true,
          allowRoles: ['Sapphire'],
          topic: 'Avisos automáticos de quem entra no servidor.',
        },
        {
          name: 'regras',
          from: ['rules'],
          readonly: true,
          topic: 'Regras do servidor. Lê antes de participar.',
        },
        {
          name: 'anúncios',
          from: ['announcements'],
          readonly: true,
          topic: 'Anúncios oficiais. Só a staff publica aqui.',
        },
      ],
    },
    {
      name: '💬 COMUNIDADE',
      from: ['Community'],
      channels: [
        {
          name: 'geral',
          from: ['geral'],
          topic: 'Conversa geral. Tudo o que não tem canal próprio.',
        },
      ],
    },
    {
      name: '🎮 JOGOS',
      channels: [
        {
          name: 'cs2',
          topic: 'Counter-Strike 2 — combina partidas. Usa @CS2 para avisar quem joga.',
        },
        {
          name: 'battlefield-6',
          topic: 'Battlefield 6 — combina partidas. Usa @Battlefield 6 para avisar quem joga.',
        },
        {
          name: 'dayz',
          topic: 'DayZ — sobrevivência, bases e encontros. Usa @DayZ para avisar.',
        },
        {
          name: 'arma',
          topic: 'Arma — operações e modpacks (o antigo #modpack está no Arquivo). Usa @Arma para avisar.',
        },
        {
          name: 'squad',
          topic: 'Squad — coordenação de esquadrões. Usa @Squad para avisar.',
        },
        {
          name: 'ready-or-not',
          topic: 'Ready or Not — táticas e sessões. Usa @Ready or Not para avisar.',
        },
        {
          name: 'escape-from-tarkov',
          from: ['escape-from-tarkov'],
          topic: 'Escape from Tarkov — raids e loot. Usa @EFT para avisar.',
        },
        {
          name: 'minecraft',
          topic: 'Minecraft — servidor, construções e projetos. Usa @Minecraft para avisar.',
        },
      ],
    },
    {
      name: '🔔 NOTÍCIAS',
      from: ['Free games', 'Plex Media Server'],
      channels: [
        {
          name: 'jogos-grátis',
          from: ['free-games'],
          readonly: true,
          topic: 'Jogos grátis e promoções (automático).',
        },
      ],
    },
    {
      name: '📺 PLEX',
      channels: [
        {
          name: 'notícias',
          from: ['notícias'],
          readonly: true,
          topic: 'Novidades adicionadas ao Plex (automático).',
        },
      ],
    },
    {
      name: '🔊 VOZ',
      from: ['VOICE CHANNELS'],
      channels: [
        { name: 'geral', type: 'voice', from: [{ name: 'geral', type: 'voice' }] },
        { name: 'jogos', type: 'voice', from: [{ name: 'gaming', type: 'voice' }] },
      ],
    },
    {
      name: '🛠️ STAFF',
      from: ['Admin/Mod'],
      private: true,
      channels: [
        { name: 'staff', from: ['mod', 'admin'], topic: 'Coordenação da staff.' },
        {
          name: 'logs',
          readonly: true,
          topic: 'Registo automático de ações de moderação.',
        },
        { name: 'voz-staff', type: 'voice', from: [{ name: 'admin-mod', type: 'voice' }] },
      ],
    },
  ],

  /**
   * Canais que não encaixam em lado nenhum e devem ficar arquivados.
   * `jogos`, `escape-from-tarkov` e `media` entraram aqui por estarem
   * inativos há mais de 90 dias — o histórico fica preservado no Arquivo.
   */
  archive: ['software', 'airsoft', 'jogos', 'escape-from-tarkov', 'media'],

  /** Canais a apagar (substituídos por outro). */
  remove: ['cargos'],

  roles: [
    {
      name: 'Membro',
      from: ['Member'],
      color: 0x5865f2,
      hoist: true,
      permissions: [],
    },
    {
      name: 'Mod',
      color: 0xe67e22,
      hoist: true,
      permissions: [
        'KickMembers',
        'BanMembers',
        'ManageMessages',
        'ModerateMembers',
        'ViewAuditLog',
        'ManageNicknames',
        'PinMessages',
        'BypassSlowmode',
      ],
    },
    {
      name: '🎮 Arma',
      color: 0x9b59b6,
      mentionable: true,
      permissions: [],
    },
    {
      name: '🎯 EFT',
      color: 0x7f8c8d,
      mentionable: true,
      permissions: [],
    },
    {
      name: '🔫 CS2',
      color: 0xe67e22,
      mentionable: true,
      permissions: [],
    },
    {
      name: '🪖 Battlefield 6',
      color: 0x4caf50,
      mentionable: true,
      permissions: [],
    },
    {
      name: '🧟 DayZ',
      color: 0x8b5e3c,
      mentionable: true,
      permissions: [],
    },
    {
      name: '🪂 Squad',
      color: 0x3498db,
      mentionable: true,
      permissions: [],
    },
    {
      name: '🚨 Ready or Not',
      color: 0xe74c3c,
      mentionable: true,
      permissions: [],
    },
    {
      name: '⛏️ Minecraft',
      color: 0x8bc34a,
      mentionable: true,
      permissions: [],
    },
    {
      name: '🔔 Notícias',
      color: 0xf1c40f,
      mentionable: true,
      permissions: [],
    },
  ],
};
