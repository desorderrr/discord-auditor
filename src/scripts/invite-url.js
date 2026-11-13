/**
 * Gera o link de convite do bot com as permissões necessárias.
 * Uso: npm run invite
 */
import { config } from '../config.js';

const PERMISSIONS = 805391536n; // ver canais, gerir canais/cargos/servidor/webhooks, audit log, enviar mensagens/embeds

if (!config.clientId) {
  console.error('❌ Define CLIENT_ID no .env primeiro.');
  process.exit(1);
}

const url = new URL('https://discord.com/api/oauth2/authorize');
url.searchParams.set('client_id', config.clientId);
url.searchParams.set('permissions', PERMISSIONS.toString());
url.searchParams.set('scope', 'bot applications.commands');

console.log('\n🔗 Link de convite do bot:\n');
console.log(url.toString());
console.log('\n⚠️  Depois de entrar, arrasta o cargo do bot para cima dos cargos que queres gerir.\n');
