require("dotenv").config();

const express = require("express");
const noblox = require("noblox.js");
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");

/* =========================
   CONFIG
========================= */
const TOKEN = process.env.TOKEN;
const ROBLOX_COOKIE = process.env.ROBLOX_COOKIE;
const GROUP_ID = Number(process.env.GROUP_ID);
const GUILD_ID = process.env.GUILD_ID;
const LOG_CHANNEL_NAME = "rutbe-logs";

const ALLOWED_DISCORD_IDS = [
  "1384961870951219351",
  "1080182913431244940",
];

/* =========================
   BASIC CHECKS
========================= */
if (!TOKEN) console.error("HATA: TOKEN eksik.");
if (!ROBLOX_COOKIE) console.error("HATA: ROBLOX_COOKIE eksik.");
if (!GROUP_ID || Number.isNaN(GROUP_ID)) {
  console.error("HATA: GROUP_ID eksik veya geçersiz.");
}
if (!GUILD_ID) console.error("HATA: GUILD_ID eksik.");

/* =========================
   EXPRESS FOR RENDER
========================= */
const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (_req, res) => {
  res.send("Bot aktif");
});

app.listen(PORT, () => {
  console.log(`Web server ${PORT} portunda çalışıyor`);
});

/* =========================
   DISCORD CLIENT
========================= */
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

/* =========================
   HELPERS
========================= */
function isAllowedUser(userId) {
  return ALLOWED_DISCORD_IDS.includes(userId);
}

function safeText(text) {
  return String(text ?? "")
    .replace(/`/g, "'")
    .replace(/@/g, "@\u200b");
}

function formatError(error) {
  if (!error) return "Bilinmeyen hata";
  if (typeof error === "string") return error;
  if (error.message) return error.message;

  try {
    return JSON.stringify(error);
  } catch {
    return "Hata çözümlenemedi";
  }
}

async function getLogChannel(guild) {
  if (!guild) return null;

  try {
    const channels = await guild.channels.fetch();

    let logChannel = channels.find(
      (ch) => ch && ch.name === LOG_CHANNEL_NAME && ch.type === ChannelType.GuildText
    );

    if (logChannel) return logChannel;

    logChannel = await guild.channels.create({
      name: LOG_CHANNEL_NAME,
      type: ChannelType.GuildText,
      reason: "Rütbe logları için oluşturuldu",
    });

    return logChannel;
  } catch (error) {
    console.error("Log kanalı alma/oluşturma hatası:", error);
    return null;
  }
}

async function sendLogEmbed(guild, embed) {
  try {
    const logChannel = await getLogChannel(guild);
    if (!logChannel) return;
    await logChannel.send({ embeds: [embed] });
  } catch (error) {
    console.error("Log gönderme hatası:", error);
  }
}

function buildSuccessEmbed({
  title,
  executor,
  username,
  userId,
  oldRole,
  newRole,
  reason,
}) {
  return new EmbedBuilder()
    .setTitle(`✅ ${title}`)
    .setColor(0x22c55e)
    .addFields(
      {
        name: "Komutu kullanan",
        value: `<@${executor.id}> (\`${executor.id}\`)`,
        inline: false,
      },
      {
        name: "Roblox kullanıcı",
        value: `\`${safeText(username)}\``,
        inline: true,
      },
      {
        name: "Roblox User ID",
        value: `\`${userId}\``,
        inline: true,
      },
      {
        name: "Eski rütbe",
        value: `\`${safeText(oldRole || "Bilinmiyor")}\``,
        inline: true,
      },
      {
        name: "Yeni rütbe",
        value: `\`${safeText(newRole || "Bilinmiyor")}\``,
        inline: true,
      },
      {
        name: "Sebep",
        value: `\`${safeText(reason || "Sebep girilmedi")}\``,
        inline: false,
      }
    )
    .setTimestamp();
}

function buildErrorEmbed({
  title,
  executor,
  username,
  requestedValue,
  reason,
}) {
  return new EmbedBuilder()
    .setTitle(`❌ ${title}`)
    .setColor(0xef4444)
    .addFields(
      {
        name: "Komutu kullanan",
        value: `<@${executor.id}> (\`${executor.id}\`)`,
        inline: false,
      },
      {
        name: "Roblox kullanıcı",
        value: `\`${safeText(username || "-")}\``,
        inline: true,
      },
      {
        name: "İstenen değer",
        value: `\`${safeText(requestedValue || "-")}\``,
        inline: true,
      },
      {
        name: "Hata sebebi",
        value: `\`${safeText(reason || "Bilinmeyen hata")}\``,
        inline: false,
      }
    )
    .setTimestamp();
}

async function safeEditReply(interaction, content) {
  try {
    if (interaction.deferred || interaction.replied) {
      return await interaction.editReply({ content });
    }

    return await interaction.reply({
      content,
      flags: MessageFlags.Ephemeral,
    });
  } catch (error) {
    console.error("safeEditReply hatası:", error);
  }
}

async function findRoleByName(rankName) {
  const roles = await noblox.getRoles(GROUP_ID);

  const matchedRole = roles.find(
    (role) => role.name.toLowerCase() === rankName.toLowerCase()
  );

  return { roles, matchedRole };
}

async function getCurrentUserRoleInfo(userId) {
  const roles = await noblox.getRoles(GROUP_ID);
  const currentRankId = await noblox.getRankInGroup(GROUP_ID, userId);

  const currentRole =
    roles.find((r) => Number(r.rank) === Number(currentRankId)) || null;

  return {
    roles,
    currentRankId,
    currentRole,
  };
}

/* =========================
   ROBLOX SETUP
========================= */
async function setupRoblox() {
  console.log("Roblox giriş deneniyor...");
  await noblox.setCookie(ROBLOX_COOKIE);
  console.log("Roblox giriş başarılı.");
}

/* =========================
   COMMAND REGISTER
========================= */
async function registerSlashCommands(clientId) {
  const commands = [
    new SlashCommandBuilder()
      .setName("rutbe-degistir")
      .setDescription("Belirtilen kullanıcının rütbesini isme göre değiştirir.")
      .addStringOption((option) =>
        option
          .setName("kullanici")
          .setDescription("Roblox kullanıcı adı")
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("rutbe")
          .setDescription("Verilecek rütbenin tam adı")
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("sebep")
          .setDescription("İşlem sebebi")
          .setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName("terfi")
      .setDescription("Belirtilen kullanıcının grup rütbesini 1 kademe artırır.")
      .addStringOption((option) =>
        option
          .setName("kullanici")
          .setDescription("Roblox kullanıcı adı")
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("sebep")
          .setDescription("Terfi sebebi")
          .setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName("tenzil")
      .setDescription("Belirtilen kullanıcının grup rütbesini 1 kademe düşürür.")
      .addStringOption((option) =>
        option
          .setName("kullanici")
          .setDescription("Roblox kullanıcı adı")
          .setRequired(true)
      )
      .addStringOption((option) =>
        option
          .setName("sebep")
          .setDescription("Tenzil sebebi")
          .setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName("test")
      .setDescription("Botun cevap verip vermediğini test eder."),
  ].map((cmd) => cmd.toJSON());

  const rest = new REST({ version: "10" }).setToken(TOKEN);

  await rest.put(Routes.applicationGuildCommands(clientId, GUILD_ID), {
    body: commands,
  });

  await rest.put(Routes.applicationCommands(clientId), {
    body: commands,
  });

  console.log("Guild + Global slash komutları yüklendi.");
}

/* =========================
   READY
========================= */
client.once("clientReady", async (readyClient) => {
  console.log(`Bot hazır: ${readyClient.user.tag}`);

  try {
    await setupRoblox();
    await registerSlashCommands(readyClient.user.id);
  } catch (error) {
    console.error("Başlangıç hatası:", error);
  }
});

/* =========================
   INTERACTIONS
========================= */
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const allowedCommands = ["rutbe-degistir", "terfi", "tenzil", "test"];
  if (!allowedCommands.includes(interaction.commandName)) return;

  const guild = interaction.guild;
  const executor = interaction.user;

  try {
    // EN ERKEN NOKTA
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({
        flags: MessageFlags.Ephemeral,
      });
    }

    if (interaction.commandName === "test") {
      return await safeEditReply(interaction, "BOT ÇALIŞIYOR");
    }

    const username = interaction.options.getString("kullanici", true).trim();
    const reason =
      interaction.options.getString("sebep")?.trim() || "Sebep girilmedi";

    if (!isAllowedUser(executor.id)) {
      await safeEditReply(interaction, "Bu komutu kullanma yetkin yok.");

      await sendLogEmbed(
        guild,
        buildErrorEmbed({
          title: "Yetkisiz kullanım denemesi",
          executor,
          username,
          requestedValue: interaction.commandName,
          reason: "Bu Discord ID komut kullanma listesinde yok.",
        })
      );
      return;
    }

    const targetUserId = await noblox.getIdFromUsername(username);

    if (interaction.commandName === "rutbe-degistir") {
      const rankName = interaction.options.getString("rutbe", true).trim();
      const { matchedRole } = await findRoleByName(rankName);

      if (!matchedRole) {
        throw new Error(`'${rankName}' isminde bir rütbe bulunamadı.`);
      }

      let oldRoleName = "Bilinmiyor";
      try {
        const currentRoleName = await noblox.getRankNameInGroup(GROUP_ID, targetUserId);
        if (currentRoleName) oldRoleName = currentRoleName;
      } catch {}

      await noblox.setRank(GROUP_ID, targetUserId, matchedRole.name);

      await safeEditReply(interaction, "Başarıyla rütbe değiştirildi!");

      await sendLogEmbed(
        guild,
        buildSuccessEmbed({
          title: "Rütbe değiştirildi",
          executor,
          username,
          userId: targetUserId,
          oldRole: oldRoleName,
          newRole: matchedRole.name,
          reason,
        })
      );
      return;
    }

    if (interaction.commandName === "terfi") {
      const { roles, currentRole } = await getCurrentUserRoleInfo(targetUserId);

      if (!currentRole) {
        throw new Error("Kullanıcının mevcut grup rütbesi bulunamadı.");
      }

      const sortedRoles = [...roles].sort((a, b) => Number(a.rank) - Number(b.rank));
      const currentIndex = sortedRoles.findIndex(
        (r) => Number(r.rank) === Number(currentRole.rank)
      );

      if (currentIndex === -1) {
        throw new Error("Mevcut rütbe sıralama listesinde bulunamadı.");
      }

      if (currentIndex >= sortedRoles.length - 1) {
        throw new Error("Bu kullanıcı zaten en yüksek rütbede.");
      }

      const nextRole = sortedRoles[currentIndex + 1];

      await noblox.setRank(GROUP_ID, targetUserId, nextRole.name);

      await safeEditReply(interaction, "Başarıyla rütbe değiştirildi!");

      await sendLogEmbed(
        guild,
        buildSuccessEmbed({
          title: "Terfi işlemi başarılı",
          executor,
          username,
          userId: targetUserId,
          oldRole: currentRole.name,
          newRole: nextRole.name,
          reason,
        })
      );
      return;
    }

    if (interaction.commandName === "tenzil") {
      const { roles, currentRole } = await getCurrentUserRoleInfo(targetUserId);

      if (!currentRole) {
        throw new Error("Kullanıcının mevcut grup rütbesi bulunamadı.");
      }

      const sortedRoles = [...roles].sort((a, b) => Number(a.rank) - Number(b.rank));
      const currentIndex = sortedRoles.findIndex(
        (r) => Number(r.rank) === Number(currentRole.rank)
      );

      if (currentIndex === -1) {
        throw new Error("Mevcut rütbe sıralama listesinde bulunamadı.");
      }

      if (currentIndex <= 0) {
        throw new Error("Bu kullanıcı zaten en düşük rütbede.");
      }

      const previousRole = sortedRoles[currentIndex - 1];

      await noblox.setRank(GROUP_ID, targetUserId, previousRole.name);

      await safeEditReply(interaction, "Başarıyla rütbe değiştirildi!");

      await sendLogEmbed(
        guild,
        buildSuccessEmbed({
          title: "Tenzil işlemi başarılı",
          executor,
          username,
          userId: targetUserId,
          oldRole: currentRole.name,
          newRole: previousRole.name,
          reason,
        })
      );
      return;
    }
  } catch (error) {
    const errorMessage = formatError(error);

    console.error(`[${interaction.commandName.toUpperCase()} HATASI]`, error);

    try {
      await safeEditReply(
        interaction,
        `İşlem gerçekleştirilemedi.\nSebep: \`${safeText(errorMessage)}\``
      );
    } catch (replyError) {
      console.error("Reply hatası:", replyError);
    }

    try {
      const username = interaction.options?.getString("kullanici") || "-";

      await sendLogEmbed(
        guild,
        buildErrorEmbed({
          title: `${interaction.commandName} işlemi başarısız`,
          executor,
          username,
          requestedValue:
            interaction.commandName === "rutbe-degistir"
              ? interaction.options.getString("rutbe") || "-"
              : interaction.commandName,
          reason: errorMessage,
        })
      );
    } catch (logError) {
      console.error("Hata logu gönderilemedi:", logError);
    }
  }
});

/* =========================
   ERROR LOGS
========================= */
client.on("error", (error) => {
  console.error("CLIENT ERROR:", error);
});

client.on("shardError", (error) => {
  console.error("SHARD ERROR:", error);
});

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("UNCAUGHT EXCEPTION:", error);
});

/* =========================
   LOGIN
========================= */
client.login(TOKEN).catch((error) => {
  console.error("Discord giriş hatası:", error);
});