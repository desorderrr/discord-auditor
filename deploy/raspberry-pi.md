# Correr no Raspberry Pi

O Pi já está ligado 24/7 (AdGuard Home), por isso é o melhor sítio para o bot.
O bot usa ~80 MB de RAM — não incomoda o AdGuard.

## 1. Instalar Node 20+

Vê primeiro a arquitetura:

```bash
uname -m
```

### aarch64 (64 bits)

```bash
sudo apt update
sudo apt install -y git curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version
```

### armv7l (32 bits)

O NodeSource já não publica pacotes para armhf, e o Node 24+ deixou de ter binários
armv7l. Usa o último LTS com suporte a 32 bits (Node 22):

```bash
sudo apt update
sudo apt install -y git curl
cd /tmp
curl -fsSLO https://nodejs.org/dist/v22.23.5/node-v22.23.5-linux-armv7l.tar.xz
sudo tar -xJf node-v22.23.5-linux-armv7l.tar.xz -C /usr/local --strip-components=1
node --version   # v22.x
```

> Para atualizar mais tarde: repete o download com a versão nova. Só existem versões
> armv7l até à linha 22; acima disso é preciso um sistema operativo de 64 bits.

## 2. Obter o projeto

```bash
cd ~
git clone https://github.com/desorderrr/discord-auditor.git
cd discord-auditor
npm run setup
```

## 3. Configurar o `.env`

```bash
nano .env
```

Preenche:

```env
DISCORD_TOKEN=...
CLIENT_ID=1570744336138899546
GUILD_ID=1278298283323822134
REGISTER_ON_START=true
```

## 4. Testar

```bash
npm start
```

Deve aparecer `✅ Ligado como ...`. Se sim, `Ctrl+C` e passa ao serviço.

## 5. Correr sempre (systemd)

```bash
sudo cp deploy/discord-auditor.service /etc/systemd/system/
```

Abre o ficheiro e ajusta o utilizador/pasta se não for `pi`:

```bash
sudo nano /etc/systemd/system/discord-auditor.service
```

Depois:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now discord-auditor
sudo systemctl status discord-auditor
```

## 6. Ver os logs

```bash
journalctl -u discord-auditor -f
```

## Comandos úteis

```bash
sudo systemctl restart discord-auditor   # reiniciar
sudo systemctl stop discord-auditor      # parar
journalctl -u discord-auditor -n 100     # últimas 100 linhas
```

## Atualizar o bot

```bash
cd ~/discord-auditor
git pull
npm install
sudo systemctl restart discord-auditor
```

Se a versão nova mudar o `package.json`, o `npm install` trata das dependências.

## Notificações automáticas (FitGirl Repacks)

O script `src/scripts/fitgirl.js` lê o feed do FitGirl e publica as novidades no
webhook configurado. A primeira execução só grava o estado (não despeja o arquivo
no canal); depois publica apenas o que for novo.

**1. Criar o webhook** — no Discord: canal `#jogos-grátis` → editar → Integrações →
Webhooks → Novo webhook. Copia a URL.

**2. Guardar a URL** (no Pi):

```bash
cd ~/discord-auditor
nano .env   # acrescenta: FITGIRL_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

**3. Testar** (não publica nada, só mostra):

```bash
node src/scripts/fitgirl.js --dry-run
```

**4. Agendar a cada 20 minutos:**

```bash
sudo cp deploy/fitgirl.service deploy/fitgirl.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now fitgirl.timer
systemctl list-timers fitgirl.timer
```

Ver o que aconteceu na última execução:

```bash
journalctl -u fitgirl.service -n 30 --no-pager
```

## Notificações do GitHub

As releases do repositório são anunciadas por GitHub Actions
(`.github/workflows/notify-release.yml`). Basta definir o secret:

```bash
gh secret set DISCORD_WEBHOOK --body "https://discord.com/api/webhooks/..."
```

A partir daí, cada release publicada aparece no canal. Para testar sem criar
uma release: **Actions → Notificar Discord → Run workflow**.

