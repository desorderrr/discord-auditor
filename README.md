# 🩺 discord-auditor

[![CI](https://github.com/desorderrr/discord-auditor/actions/workflows/ci.yml/badge.svg)](https://github.com/desorderrr/discord-auditor/actions/workflows/ci.yml)
[![Licença: MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-blue.svg)](LICENSE)

Bot que **analisa o teu servidor Discord**, dá uma pontuação de saúde e **corrige automaticamente** os problemas que encontrar — com pré-visualização antes de tocar em nada.

Feito com Node.js 20+ e discord.js v14.

---

## Início rápido

```powershell
npm run setup     # verifica o Node, cria o .env e instala dependências
notepad .env      # preenche DISCORD_TOKEN, CLIENT_ID e GUILD_ID
npm start
```

No Discord: `/audit` para o relatório · `/cargos publicar` para o painel de cargos.

O resto (criar a aplicação, convidar o bot, permissões) está em [Instalação](#instalação).

---

## O que verifica

| Área | Exemplos de problemas detetados |
| --- | --- |
| 🔐 **Segurança e permissões** | `@everyone` com Administrador/Expulsar/Banir, cargos com Administrador, canais "staff/mod/logs" abertos a todos, Administrador dado por overwrite de canal, 2FA do servidor desativado, convites permanentes sem limite, webhooks órfãos, bots com Administrador |
| 📁 **Estrutura de canais** | nomes fora do padrão, canais sem categoria, nomes duplicados, canais sem tópico, canais mortos (>90 dias), categorias vazias, canais NSFW abertos a todos, permissões de cargos apagados |
| 🛡️ **Anti-raid / AutoMod** | AutoMod desligado, regras em falta (spam, menções em massa, conteúdo impróprio), regras desativadas, nível de verificação baixo, filtro de conteúdo explícito, notificações em "todas as mensagens", picos de entradas (raid em curso) |
| 🎭 **Cargos e hierarquia** | cargos sem membros, cargos com nomes duplicados, cargos com nome padrão ("novo cargo"), cargos acima do bot (impossíveis de gerir), permissões de moderação dados a mais de metade do servidor, excesso de cargos |

Cada problema tem **severidade** (crítico / alto / médio / baixo / info) e contribui para uma pontuação de 0 a 100.

---

## Instalação

### 0. Requisitos

- [Node.js 20 ou superior](https://nodejs.org) (`node --version` deve funcionar)

> Confirma com `node --version` — tem de ser **20 ou superior**. Se acabaste de instalar, abre um terminal novo para o PATH atualizar.

### 1. Criar a aplicação

1. Vai a <https://discord.com/developers/applications> → **New Application** → dá-lhe um nome.
2. Separador **Bot** → **Reset Token** → copia o token (só aparece uma vez).
3. Ainda em **Bot**, ativa **Server Members Intent** (obrigatório para detetar cargos vazios e raids).
4. Separador **General Information** → copia o **Application ID**.

### 2. Configurar

```powershell
cd caminho\para\discord-auditor
copy .env.example .env
notepad .env
```

Preenche:

```env
DISCORD_TOKEN=o-token-do-passo-1
CLIENT_ID=123456789012345678
GUILD_ID=123456789012345678   # clica com o botão direito no servidor -> Copiar ID
```

(Para veres IDs: Definições do Discord → Avançado → **Modo de programador**.)

### 3. Convidar o bot

Com o `CLIENT_ID` já no `.env`, o link exato é gerado por:

```powershell
npm run invite
```

Ou constrói-o à mão, substituindo `O_TEU_CLIENT_ID`:

```
https://discord.com/api/oauth2/authorize?client_id=O_TEU_CLIENT_ID&permissions=805391536&scope=bot%20applications.commands
```

Esse valor de `permissions` inclui: Ver canais, Gerir canais, Gerir cargos, Gerir servidor, Gerir webhooks, Ver registo de auditoria, Enviar mensagens, Inserir links, Ler histórico.

> ⚠️ **Importante:** depois de o bot entrar, arrasta o **cargo dele para cima** dos cargos que queres que ele corrija. O Discord não deixa um bot gerir cargos acima do seu.

### 4. Instalar e arrancar

```powershell
npm install
npm start
```

Os slash commands são registados automaticamente no servidor. No Discord escreve `/audit`.

---

## Comandos

### `/audit`

Faz o diagnóstico completo e devolve o relatório em embeds + um ficheiro em `reports/`. **Não altera nada.**

Opções:
- `area` — limitar a `security`, `channels`, `automod` ou `roles`.

### `/fix`

Pré-visualiza as correções automáticas disponíveis.

- `/fix` → mostra o que **seria** feito.
- `/fix aplicar:true` → aplica as correções **seguras**.
- `/fix aplicar:true arriscadas:true` → inclui também as arriscadas (apagar cargos/canais/categorias vazias, remover Administrador, apagar webhooks e convites).

---

## Linha de comandos (sem Discord)

```powershell
npm run audit                              # relatório no terminal + ficheiro
npm run audit -- --area=security           # só uma área
npm run audit -- --json                    # saída JSON
npm run audit -- --fix                     # aplica correções seguras
npm run audit -- --fix --risky             # aplica também as arriscadas
```

Útil para correr periodicamente e comparar relatórios (ficam em `reports/*.md` e `*.json`).

---

## Segurança: `safe` vs `risky`

| Risco | Exemplos | Precisa de `arriscadas:true`? |
| --- | --- | --- |
| `safe` | remover permissões perigosas de `@everyone`, ocultar canais internos, criar regras de AutoMod, subir verificação, normalizar nomes de canais, limpar overwrites órfãs | Não |
| `risky` | apagar cargos sem membros, apagar categorias vazias, remover Administrador de cargos, apagar webhooks/convites, restringir canais NSFW | **Sim** |

Tudo o que é aplicado fica registado no relatório (`reports/`) com o resultado de cada correção.

---

## Problemas comuns

### `Used disallowed intents` (código 4014)

O bot pediu o intent privilegiado **Server Members** e a aplicação não o tem ativo.

1. <https://discord.com/developers/applications> → tua aplicação → **Bot**
2. **Privileged Gateway Intents** → liga **Server Members Intent**
3. Clica **Save Changes** (sem isto não guarda) e espera ~1 minuto
4. `npm start`

O bot, a partir da v1.1, arranca na mesma sem o intent (com um aviso) — mas perde as verificações
de cargos vazios, bots com Administrador e deteção de raids. Para as ter todas, ativa-o.

### `Invalid token` / `401: Unauthorized`

O `DISCORD_TOKEN` está errado, expirou ou foi resetado. Faz **Reset Token** no portal e atualiza o `.env`.

### Arranca mas não aparece no servidor

Corre `npm run whoami` — mostra os servidores onde o bot está e se o `GUILD_ID` do `.env` corresponde a algum.
Se a lista estiver vazia, o bot não foi convidado: `npm run invite`.

### "Not in guild" / sem permissões

O cargo do bot tem de estar **acima** dos cargos que quer gerir e ter as permissões do link de convite.

### `/cargos publicar`

Publica (ou republica) o **painel de cargos de ping** no `#boas-vindas`. Só staff (Gerir servidor).

Cada membro clica nos jogos que joga e recebe/remove o cargo correspondente — sem passar pela staff.
Funciona com **botões** (não reações): o estado é lido do membro a cada clique, por isso o painel
continua a funcionar depois de reiniciar o bot, e não depende de emojis nem de cache de mensagens.

Jogos configurados em `src/lib/pingRoles.js` (e criados pelo blueprint):

`🔫 CS2` · `🪖 Battlefield 6` · `🧟 DayZ` · `🎮 Arma` · `🪂 Squad` · `🚨 Ready or Not` · `🎯 EFT` · `⛏️ Minecraft` · `🔔 Notícias`

Para acrescentar um jogo: adiciona o cargo em `src/blueprint/target.js` **e** a entrada em
`src/lib/pingRoles.js` (o `roleName` tem de coincidir), depois:

```powershell
npm run blueprint -- --apply
```

## Alojar na Discloud

`discloud.config` já está configurado (`MAIN=src/index.js`, `RAM=128`, `VERSION=latest`).

1. `npm run pack` gera `discord-auditor-v<versão>.zip` (sem `node_modules` nem `.env`).
2. Na Discloud: a tua app → **Enviar** → escolhe o zip.
3. No separador **Variáveis**, define:
   - `DISCORD_TOKEN`
   - `CLIENT_ID`
   - `GUILD_ID`
   - `REGISTER_ON_START=true`
4. Inicia a app e vê os **Logs** — deve aparecer `✅ Ligado como ...`.

> ⚠️ Não corras o bot na Discloud **e** no teu PC ao mesmo tempo: as duas ligações com o mesmo
> token entram em conflito e uma delas é derrubada.

## Deixar o bot sempre ligado

Os botões e as reações só respondem com o bot **online**.

**Testar** (janela visível, Ctrl+C para parar):

```powershell
.\start-bot.cmd
```

**Sempre ligado** (sem janela, log em `logs\bot.log`) — cria uma tarefa que arranca ao iniciares sessão:

```powershell
# corre dentro da pasta do projeto
schtasks /Create /TN "Discord Auditor Bot" /SC ONLOGON /TR "wscript.exe \"%CD%\bot-background.vbs\"" /F
```

Para remover: `schtasks /Delete /TN "Discord Auditor Bot" /F`

## Aplicar a estrutura do servidor

O `src/blueprint/target.js` descreve o servidor-alvo (categorias, canais, tópicos, cargos).

```powershell
npm run blueprint            # mostra o que faria (dry-run)
npm run blueprint -- --apply # aplica
```

É idempotente: se já estiver tudo aplicado, diz "O servidor já corresponde ao blueprint".
Antes de aplicar, guarda o estado atual em `reports/pre-blueprint-*.json`.

## Testes

O projeto tem dois testes que **não precisam de token**:

```powershell
npm test          # servidor simulado: corre as 31 verificações + todas as correções
npm run self-test # limites dos embeds do Discord e estrutura das verificações
```

## Desempenho e limites

- Em servidores com mais de **25 000 membros** a lista de membros não é carregada (demasiado pesado); as verificações que dependem dela são saltadas.
- Auditar demora tipicamente **2–20 segundos**.
- O bot nunca altera nada sem `aplicar:true` / `--fix`.
- O relatório em `reports/` é sempre gerado — em caso de dúvida, consulta-o antes de corrigir.

---

## Estrutura

```
src/
  index.js                 # bot + slash commands
  config.js                # leitura do .env
  commands/
    audit.js               # /audit
    fix.js                 # /fix
  lib/
    audit.js               # corre todas as verificações
    fixer.js               # aplica correções
    report.js              # embeds + relatório markdown/json
    preflight.js           # permissões do bot e autorização
    util.js                # helpers, severidades, pontuação
    checks/
      security.js          # permissões, webhooks, convites, 2FA
      channels.js          # estrutura e higiene de canais
      automod.js           # AutoMod e anti-raid
      roles.js             # cargos e hierarquia
  scripts/
    deploy-commands.js     # registo dos slash commands
    cli-audit.js           # auditoria por terminal
    self-test.js           # testes de integridade
test/
  mock-audit.mjs           # servidor simulado (npm test)
reports/                   # relatórios gerados (ignorado pelo git)
```

## Licença

MIT — podes usar, modificar e distribuir, desde que mantenhas o aviso de copyright.
Ver [LICENSE](LICENSE).

## Adicionar uma verificação

Cria uma entrada em `src/lib/checks/<área>.js`:

```js
{
  id: 'sec.exemplo',
  area: 'security',
  async run({ guild }) {
    if (tudoBem) return null;
    return {
      severity: 'high',
      title: 'Problema X',
      detail: 'Explicação do problema.',
      manual: 'Como corrigir à mão.',
      fix: {
        risk: 'safe',                        // ou 'risky'
        description: 'O que a correção faz',
        async run({ guild }) { /* ... */ return 'feito'; },
      },
    };
  },
}
```

O relatório, a pontuação e os comandos atualizam-se sozinhos.
