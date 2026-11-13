# Correr no Raspberry Pi

O Pi já está ligado 24/7 (AdGuard Home), por isso é o melhor sítio para o bot.
O bot usa ~80 MB de RAM — não incomoda o AdGuard.

## 1. Instalar Node 20+

```bash
sudo apt update
sudo apt install -y git curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version
```

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
