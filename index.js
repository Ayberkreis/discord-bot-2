require('dotenv').config();

const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Bot aktif');
});

app.listen(PORT, () => {
  console.log(`Web server ${PORT} portunda çalışıyor`);
});

console.log('Dosya çalıştı');
console.log('TOKEN var mı:', !!process.env.TOKEN);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once('clientReady', () => {
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