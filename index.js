require('dotenv').config();

const express = require('express');
const noblox = require('noblox.js');
const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
} = require('discord.js');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (_, res) => {
  res.send('Bot aktif');
});

app.listen(PORT, () => {
  console.log(`Web server ${PORT} portunda çalışıyor`);
});

const TOKEN = process.env.TOKEN;
const ROBLOX_COOKIE = process.env.ROBLOX_COOKIE;
console.log("COOKIE DEBUG:", ROBLOX_COOKIE);
const GROUP_ID = Number(process.env.GROUP_ID);

// Virgülle ayrılmış Discord ID listesi
const ALLOWED_DISCORD_IDS = (process.env.ALLOWED_DISCORD_IDS || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

async function registerSlashCommands(clientId) {
  const commands = [
    new SlashCommandBuilder()
      .setName('rutbe-degistir')
      .setDescription('Belirtilen kullanıcının Roblox grup rütbesini değiştirir.')
      .addStringOption((option) =>
        option
          .setName('kullanici')
          .setDescription('Roblox kullanıcı adı')
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName('rutbe')
          .setDescription('Grup içindeki tam rütbe adı')
          .setRequired(true)
      ),
  ].map((command) => command.toJSON());

  const rest = new REST({ version: '10' }).setToken(TOKEN);

  await rest.put(Routes.applicationCommands(clientId), {
    body: commands,
  });

  console.log('Slash komutları yüklendi.');
}

async function setupRoblox() {
  const robloxUser = await noblox.setCookie(ROBLOX_COOKIE);
  console.log(`Roblox giriş yapıldı: ${robloxUser.UserName}`);
}

function isAllowedUser(discordUserId) {
  return ALLOWED_DISCORD_IDS.includes(discordUserId);
}

client.once('clientReady', async (readyClient) => {
  try {
    console.log(`Bot hazır: ${readyClient.user.tag}`);
    await setupRoblox();
    await registerSlashCommands(readyClient.user.id);
  } catch (error) {
    console.error('Başlangıç hatası:', error);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'rutbe-degistir') return;

  // Sadece izinli ID'ler kullansın
  if (!isAllowedUser(interaction.user.id)) {
    return interaction.reply({
      content: 'Bu komutu kullanma yetkin yok.',
      ephemeral: true,
    });
  }

  const username = interaction.options.getString('kullanici', true).trim();
  const rankName = interaction.options.getString('rutbe', true).trim();

  await interaction.reply({
    content: 'İşlem yapılıyor...',
    ephemeral: true,
  });

  try {
    // Kullanıcı ID'sini bul
    const targetUserId = await noblox.getIdFromUsername(username);

    // Gruptaki rolleri çek
    const roles = await noblox.getRoles(GROUP_ID);

    // Rütbeyi isme göre bul (büyük/küçük harf farkını önemseme)
    const matchedRole = roles.find(
      (role) => role.name.toLowerCase() === rankName.toLowerCase()
    );

    if (!matchedRole) {
      const roleList = roles.map((r) => r.name).join(', ');
      return interaction.editReply(
        `Böyle bir rütbe bulunamadı.\nGeçerli rütbeler: ${roleList}`
      );
    }

    // Rütbe değiştir
    await noblox.setRank(GROUP_ID, targetUserId, matchedRole.name);

    await interaction.editReply('Başarıyla rütbe değiştirildi!');
  } catch (error) {
    console.error('Rütbe değiştirme hatası:', error);

    await interaction.editReply(
      'Rütbe değiştirilirken hata oluştu. Kullanıcı adı, yetki veya Roblox cookie bilgisi yanlış olabilir.'
    );
  }
});

client.login(TOKEN).catch((error) => {
  console.error('Discord giriş hatası:', error);
});