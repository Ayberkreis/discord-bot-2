require('dotenv').config();

console.log('Dosya çalıştı');
console.log('TOKEN var mı:', !!process.env.TOKEN);

const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once('ready', () => {
  console.log(`Bot hazır: ${client.user.tag}`);
});

client.on('messageCreate', (message) => {
  if (message.author.bot) return;

  if (message.content === '!ping') {
    message.reply('Pong!');
  }
});

client.on('error', (err) => {
  console.error('Discord client hatası:', err);
});

client.login(process.env.TOKEN).catch((err) => {
  console.error('Login hatası:', err);
});