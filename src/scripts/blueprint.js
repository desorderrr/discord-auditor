/**
 * Aplica a estrutura-alvo definida em src/blueprint/target.js.
 *
 *   npm run blueprint            → mostra o plano (dry-run)
 *   npm run blueprint -- --apply → aplica
 */
import {
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits,
  PermissionsBitField,
} from 'discord.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { config, assertConfig } from '../config.js';
import { blueprint } from '../blueprint/target.js';

const APPLY = process.argv.includes('--apply');
const TYPE = { text: ChannelType.GuildText, voice: ChannelType.GuildVoice };

const findChannel = (guild, name, type = 'text') =>
  guild.channels.cache.find((c) => c.name === name && c.type === TYPE[type]);
const findCategory = (guild, name) =>
  guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === name);

const ch = (name, type = 'text') => (type === 'voice' ? `🔊 ${name}` : `#${name}`);

const toBits = (keys) =>
  keys.reduce((acc, key) => acc | (PermissionFlagsBits[key] ?? 0n), 0n);

const bitsLabel = (bits) =>
  new PermissionsBitField(bits)
    .toArray()
    .filter((n) => !['ViewChannel', 'SendMessages', 'ReadMessageHistory'].includes(n))
    .join(', ') || '(nada)';

function permDiff(current, targetKeys) {
  const wanted = toBits(targetKeys);
  const added = wanted & ~current.bitfield;
  const removed = current.bitfield & ~wanted;

  return {
    changed: added !== 0n || removed !== 0n,
    text: [added ? `+${bitsLabel(added)}` : '', removed ? `-${bitsLabel(removed)}` : '']
      .filter(Boolean)
      .join(' '),
  };
}

async function main() {
  assertConfig();

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });
  await client.login(config.token);

  await new Promise((resolve) => client.once(Events.ClientReady, resolve));

  const guild = await client.guilds.fetch(config.guildId);
  await guild.channels.fetch();
  await guild.roles.fetch();
  await guild.members.fetch({ time: 30_000 }).catch(() => {});

  const ctx = {
    guild,
    cats: new Map(),
    archive: findCategory(guild, blueprint.archiveCategory),
    moved: new Set(),
    touched: new Set(),
    relocating: new Set(),
  };

  const plan = [];
  const add = (group, icon, text, run) => plan.push({ group, icon, text, run });

  const ensureArchive = async () => {
    if (ctx.archive) return ctx.archive;
    const existing = findCategory(guild, blueprint.archiveCategory);
    ctx.archive = existing
      ? existing
      : await guild.channels.create({
          name: blueprint.archiveCategory,
          type: ChannelType.GuildCategory,
          permissionOverwrites: [
            { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel] },
          ],
          reason: 'Blueprint: categoria de arquivo',
        });
    return ctx.archive;
  };

  const decay = async (channel) => {
    const cat = await ensureArchive();
    if (channel.parentId !== cat.id) {
      await channel.setParent(cat.id, { lockPermissions: false, reason: 'Blueprint: arquivar' });
    }
    await channel.permissionOverwrites.edit(
      guild.roles.everyone,
      { ViewChannel: false },
      { reason: 'Blueprint: canal arquivado' },
    );
  };

  // ---------- categorias ----------
  for (const cat of blueprint.categories) {
    const existing =
      findCategory(guild, cat.name) ??
      (cat.from ?? []).map((n) => findCategory(guild, n)).find(Boolean) ??
      null;

    if (!existing) {
      add('CATEGORIAS', '+', `criar “${cat.name}”`, async () => {
        ctx.cats.set(
          cat.name,
          await guild.channels.create({ name: cat.name, type: ChannelType.GuildCategory }),
        );
      });
      if (cat.private) {
        add('CATEGORIAS', '🔒', `ocultar “${cat.name}” de @everyone`, async () => {
          await ctx.cats
            .get(cat.name)
            .permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false });
        });
      }
      continue;
    }

    ctx.cats.set(cat.name, existing);

    if (existing.name !== cat.name) {
      ctx.touched.add(existing.id);
      add('CATEGORIAS', '~', `renomear “${existing.name}” → “${cat.name}”`, async () => {
        await existing.setName(cat.name, 'Blueprint: renomear categoria');
      });
    }

    if (cat.private && existing.permissionsFor(guild.roles.everyone)?.has(PermissionFlagsBits.ViewChannel)) {
      ctx.touched.add(existing.id);
      add('CATEGORIAS', '🔒', `ocultar “${cat.name}” de @everyone`, async () => {
        await existing.permissionOverwrites.edit(guild.roles.everyone, { ViewChannel: false });
      });
    }
  }

  // ---------- canais ----------
  for (const cat of blueprint.categories) {
    for (const spec of cat.channels) {
      const type = spec.type ?? 'text';
      const sources = (spec.from ?? [])
        .map((f) => (typeof f === 'string' ? { name: f, type } : f))
        .map((f) => findChannel(guild, f.name, f.type ?? type))
        .filter(Boolean);

      const survivor = findChannel(guild, spec.name, type) ?? sources[0] ?? null;
      const extras = sources.filter((c) => c.id !== survivor?.id);

      if (!survivor) {
        add('CANAIS', '+', `criar ${ch(spec.name, type)} em “${cat.name}”`, async () => {
          await guild.channels.create({
            name: spec.name,
            type: TYPE[type],
            parent: ctx.cats.get(cat.name)?.id,
            topic: type === 'text' ? spec.topic : undefined,
            permissionOverwrites: spec.readonly
              ? [
                  {
                    id: guild.roles.everyone.id,
                    ...(cat.private ? {} : { allow: [PermissionFlagsBits.ViewChannel] }),
                    deny: [
                      PermissionFlagsBits.SendMessages,
                      PermissionFlagsBits.SendMessagesInThreads,
                    ],
                  },
                  {
                    id: guild.members.me.id,
                    allow: [
                      PermissionFlagsBits.ViewChannel,
                      PermissionFlagsBits.SendMessages,
                      PermissionFlagsBits.EmbedLinks,
                    ],
                  },
                  ...(spec.allowRoles ?? [])
                    .map((name) => guild.roles.cache.find((r) => r.name === name))
                    .filter(Boolean)
                    .map((role) => ({
                      id: role.id,
                      allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.EmbedLinks,
                      ],
                    })),
                ]
              : undefined,
            reason: 'Blueprint: criar canal',
          });
        });
      } else {
        if (survivor.name !== spec.name) {
          ctx.touched.add(survivor.id);
          add('CANAIS', '~', `renomear ${ch(survivor.name, type)} → ${ch(spec.name, type)}`, async () => {
            await survivor.setName(spec.name, 'Blueprint: renomear canal');
          });
        }

        if (survivor.parentId !== ctx.cats.get(cat.name)?.id) {
          ctx.touched.add(survivor.id);
          ctx.relocating.add(survivor.id);
          add('CANAIS', '→', `mover ${spec.name} para “${cat.name}”`, async () => {
            await survivor.setParent(ctx.cats.get(cat.name).id, {
              lockPermissions: false,
              reason: 'Blueprint: mover canal',
            });
          });
          ctx.moved.add(survivor.id);
        }

        // Canal que estava arquivado e volta a ser usado.
        if (ctx.archive && survivor.parentId === ctx.archive.id) {
          ctx.touched.add(survivor.id);
          add('CANAIS', '🔓', `restaurar visibilidade de #${spec.name}`, async () => {
            await survivor.permissionOverwrites.edit(
              guild.roles.everyone,
              { ViewChannel: null },
              { reason: 'Blueprint: reativar canal' },
            );
          });
        }

        if (type === 'text' && spec.topic && survivor.topic !== spec.topic) {
          ctx.touched.add(survivor.id);
          add('CANAIS', '✎', `tópico em #${spec.name}`, async () => {
            await survivor.setTopic(spec.topic, 'Blueprint: tópico');
          });
        }

        if (spec.readonly) {
          const ow = survivor.permissionOverwrites.cache.get(guild.roles.everyone.id);

          if (cat.private) {
            // Numa categoria privada, o canal herda o deny — não pode ter allow explícito.
            if (ow?.allow.has(PermissionFlagsBits.ViewChannel)) {
              ctx.touched.add(survivor.id);
              add('CANAIS', '🔒', `#${spec.name}: herdar o acesso restrito da categoria`, async () => {
                await survivor.permissionOverwrites.edit(
                  guild.roles.everyone,
                  { ViewChannel: null },
                  { reason: 'Blueprint: canal privado' },
                );
              });
            }
          } else {
            const ev = survivor.permissionsFor(guild.roles.everyone);
            if (
              ev?.has(PermissionFlagsBits.SendMessages) ||
              !ev?.has(PermissionFlagsBits.ViewChannel)
            ) {
              ctx.touched.add(survivor.id);
              add('CANAIS', '🔒', `#${spec.name}: visível mas só leitura`, async () => {
                await survivor.permissionOverwrites.edit(guild.roles.everyone, {
                  ViewChannel: true,
                  SendMessages: false,
                  SendMessagesInThreads: false,
                });
              });
            }

            // O bot tem de conseguir publicar nos canais que gere (ex.: #regras, #cargos).
            // Exigimos overwrite explícita: não dependemos de Administrador.
            const botOverwrite = survivor.permissionOverwrites.cache.get(guild.members.me.id);
            if (!botOverwrite?.allow.has(PermissionFlagsBits.SendMessages)) {
              ctx.touched.add(survivor.id);
              add('CANAIS', '🤖', `permitir ao bot publicar em #${spec.name}`, async () => {
                await survivor.permissionOverwrites.edit(
                  guild.members.me,
                  {
                    ViewChannel: true,
                    SendMessages: true,
                    EmbedLinks: true,
                    ManageMessages: true,
                  },
                  { reason: 'Blueprint: bot publica neste canal' },
                );
              });
            }

            // Roles autorizados a publicar (ex.: Sapphire em #entradas).
            for (const roleName of spec.allowRoles ?? []) {
              const role = guild.roles.cache.find((r) => r.name === roleName);
              if (!role) continue;

              const overwrite = survivor.permissionOverwrites.cache.get(role.id);
              if (overwrite?.allow.has(PermissionFlagsBits.SendMessages)) continue;

              ctx.touched.add(survivor.id);
              add('CANAIS', '🤖', `permitir a “${roleName}” publicar em #${spec.name}`, async () => {
                await survivor.permissionOverwrites.edit(
                  role,
                  {
                    ViewChannel: true,
                    SendMessages: true,
                    EmbedLinks: true,
                  },
                  { reason: 'Blueprint: role autorizado a publicar' },
                );
              });
            }
          }
        }
      }

      for (const extra of extras) {
        if (ctx.archive && extra.parentId === ctx.archive.id) {
          ctx.moved.add(extra.id);
          continue;
        }
        ctx.touched.add(extra.id);
        add('CANAIS', '🗄️', `arquivar ${ch(extra.name, type)} (fundido em ${spec.name})`, async () => {
          ctx.moved.add(extra.id);
          await decay(extra);
        });
        ctx.moved.add(extra.id);
      }
    }
  }

  for (const name of blueprint.archive ?? []) {
    const channel = findChannel(guild, name, 'text') ?? findChannel(guild, name, 'voice');
    if (!channel || ctx.moved.has(channel.id)) continue;
    if (ctx.archive && channel.parentId === ctx.archive.id) continue;
    ctx.touched.add(channel.id);
    add('CANAIS', '🗄️', `arquivar #${channel.name}`, async () => {
      await decay(channel);
    });
  }

  for (const name of blueprint.remove ?? []) {
    const channel = findChannel(guild, name, 'text') ?? findChannel(guild, name, 'voice');
    if (!channel) continue;
    add('CANAIS', '🗑️', `apagar #${channel.name} (substituído por outro canal)`, async () => {
      await channel.delete('Blueprint: canal substituído');
    });
  }

  // ---------- acesso do bot (só onde há alterações pendentes) ----------
  const canSee = (channel) =>
    channel.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.ViewChannel);

  const accessActions = [];
  for (const id of ctx.touched) {
    const channel = guild.channels.cache.get(id);
    if (!channel || canSee(channel)) continue;
    accessActions.push({
      group: 'ACESSO',
      icon: '🔑',
      text: `dar ao bot acesso a “${channel.name}”`,
      run: async () => {
        await channel.permissionOverwrites.edit(guild.members.me, { ViewChannel: true });
      },
    });
  }
  plan.unshift(...accessActions);

  // ---------- categorias que ficam vazias ----------
  const targetIds = new Set([...ctx.cats.values()].map((c) => c.id));
  for (const old of guild.channels.cache.values()) {
    if (old.type !== ChannelType.GuildCategory) continue;
    if (targetIds.has(old.id)) continue;

    const children = guild.channels.cache.filter((c) => c.parentId === old.id);
    const willBeEmpty = children.size === 0 || [...children.values()].every((c) => ctx.moved.has(c.id));
    if (!willBeEmpty) continue;

    add('CATEGORIAS', '−', `apagar categoria “${old.name}” (ficará vazia)`, async () => {
      const still = guild.channels.cache.filter((c) => c.parentId === old.id);
      if (still.size) throw new Error(`ainda tem ${still.size} canal(is)`);
      await old.delete('Blueprint: categoria vazia');
    });
  }

  // ---------- ordem dos canais dentro das categorias ----------
  const channelOrder = [];
  for (const cat of blueprint.categories) {
    const parent = ctx.cats.get(cat.name);
    if (!parent) continue;

    cat.channels.forEach((spec, index) => {
      const channel = findChannel(guild, spec.name, spec.type ?? 'text');
      if (!channel) return;
      if (channel.parentId !== parent.id && !ctx.relocating.has(channel.id)) return;
      if (channel.rawPosition === index) return;
      channelOrder.push({ channel, index });
    });
  }

  if (channelOrder.length) {
    add('CANAIS', '↕', `ordenar ${channelOrder.length} canal(is) nas categorias`, async () => {
      for (const { channel, index } of channelOrder) {
        try {
          await channel.setPosition(index);
        } catch {
          // canal pode ter sido apagado entretanto
        }
      }
    });
  }

  // ---------- ordem das categorias ----------
  const misordered = blueprint.categories.some((cat, index) => {
    const current = ctx.cats.get(cat.name);
    return !current || current.rawPosition !== index;
  });

  if (misordered) {
    add(
      'CATEGORIAS',
      '↕',
      `ordenar: ${blueprint.categories.map((c) => c.name).join(' · ')}`,
      async () => {
        for (let i = 0; i < blueprint.categories.length; i++) {
          const name = blueprint.categories[i].name;
          const cat = ctx.cats.get(name) ?? findCategory(guild, name);
          if (cat) await cat.setPosition(i);
        }
      },
    );
  }

  // ---------- cargos ----------
  for (const spec of blueprint.roles) {
    const existing =
      guild.roles.cache.find((r) => r.name === spec.name) ??
      (spec.from ?? []).map((n) => guild.roles.cache.find((r) => r.name === n)).find(Boolean) ??
      null;

    if (!existing) {
      add('CARGOS', '+', `criar cargo “${spec.name}”`, async () => {
        await guild.roles.create({
          name: spec.name,
          colors: { primaryColor: spec.color },
          hoist: spec.hoist ?? false,
          mentionable: spec.mentionable ?? false,
          permissions: spec.permissions ?? [],
          reason: 'Blueprint: criar cargo',
        });
      });
      continue;
    }

    if (existing.name !== spec.name) {
      add('CARGOS', '~', `renomear cargo “${existing.name}” → “${spec.name}”`, async () => {
        await existing.setName(spec.name, 'Blueprint: renomear cargo');
      });
    }
    if (spec.color !== undefined && existing.color !== spec.color) {
      add('CARGOS', '🎨', `cor de “${spec.name}”`, async () => {
        await existing.setColors({ primaryColor: spec.color }, 'Blueprint: cor do cargo');
      });
    }
    if (spec.hoist !== undefined && existing.hoist !== spec.hoist) {
      add('CARGOS', '↥', `${spec.hoist ? 'agrupar' : 'desagrupar'} “${spec.name}” na lista`, async () => {
        await existing.setHoist(spec.hoist, 'Blueprint: hoist');
      });
    }
    if (spec.mentionable !== undefined && existing.mentionable !== spec.mentionable) {
      add('CARGOS', '@', `${spec.mentionable ? 'permitir' : 'proibir'} menção a “${spec.name}”`, async () => {
        await existing.setMentionable(spec.mentionable, 'Blueprint: mentionable');
      });
    }
    if (spec.permissions) {
      const diff = permDiff(existing.permissions, spec.permissions);
      if (diff.changed) {
        const bits = toBits(spec.permissions);
        add('CARGOS', '★', `permissões de “${spec.name}”: ${diff.text}`, async () => {
          await existing.setPermissions(bits, 'Blueprint: permissões do cargo');
        });
      }
    }
  }

  // ---------- notas ----------
  const notes = [];
  for (const role of guild.roles.cache.values()) {
    if (!role.managed && role.permissions.has(PermissionFlagsBits.Administrator) && !['Admin'].includes(role.name)) {
      notes.push(`Cargo “${role.name}” tem Administrador (${role.members.size} membro(s)) — revê ou apaga à mão.`);
    }
    if (
      role.managed &&
      role.permissions.has(PermissionFlagsBits.MentionEveryone | PermissionFlagsBits.ManageWebhooks)
    ) {
      notes.push(`Bot “${role.name}” pode mencionar @everyone / gerir webhooks — só via re-autorização do bot.`);
    }
  }

  printPlan(plan, notes);

  if (!APPLY) {
    console.log('\n👀 Isto foi um dry-run. Nada foi alterado.');
    console.log('   Para aplicar: npm run blueprint -- --apply\n');
    client.destroy();
    return;
  }

  console.log('\n🛠️  A aplicar…\n');

  await mkdir('reports', { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapshotFile = `reports/pre-blueprint-${stamp}.json`;
  await writeFile(
    snapshotFile,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        guild: { id: guild.id, name: guild.name },
        categories: guild.channels.cache
          .filter((c) => c.type === ChannelType.GuildCategory)
          .sort((a, b) => a.rawPosition - b.rawPosition)
          .map((c) => ({ id: c.id, name: c.name, position: c.rawPosition })),
        channels: guild.channels.cache
          .filter((c) => c.type !== ChannelType.GuildCategory)
          .map((c) => ({
            id: c.id,
            name: c.name,
            type: c.type,
            parent: c.parent?.name ?? null,
            position: c.rawPosition,
            topic: c.topic ?? null,
          })),
        roles: guild.roles.cache.map((r) => ({
          id: r.id,
          name: r.name,
          position: r.position,
          color: r.color,
          hoist: r.hoist,
          mentionable: r.mentionable,
          permissions: r.permissions.toArray(),
        })),
      },
      null,
      2,
    ),
    'utf8',
  );
  console.log(`   💾 estado atual guardado em ${snapshotFile}\n`);

  let ok = 0;
  const failed = [];
  for (const action of plan) {
    try {
      await action.run();
      ok += 1;
      console.log(`   ✅ ${action.text}`);
    } catch (err) {
      failed.push(`${action.text}: ${err.message}`);
      console.log(`   ❌ ${action.text} → ${err.message}`);
    }
  }

  console.log(`\n${ok} ação(ões) aplicada(s), ${failed.length} falha(s).`);
  if (failed.length) {
    console.log('Falhas:');
    for (const f of failed) console.log(`  • ${f}`);
  }
  console.log('\nCorre `npm run audit` para confirmar o resultado.\n');

  client.destroy();
}

function printPlan(plan, notes) {
  const groups = new Map();
  for (const action of plan) {
    groups.set(action.group, [...(groups.get(action.group) ?? []), action]);
  }

  if (!plan.length) {
    console.log('✨ O servidor já corresponde ao blueprint.');
  }

  for (const [group, list] of groups) {
    console.log(`\n${group}`);
    for (const action of list) console.log(`   ${action.icon} ${action.text}`);
  }

  if (notes.length) {
    console.log('\nNOTAS (não automatizável)');
    for (const note of notes) console.log(`   • ${note}`);
  }
}

main().catch((err) => {
  console.error('❌ Erro no blueprint:', err);
  process.exit(1);
});
