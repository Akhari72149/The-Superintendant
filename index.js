require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder,
} = require("discord.js");

const { exec } = require("child_process");

const serverStatusBatch = `"C:\\discord-bot\\commands\\Check Server Status.bat"`;

const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;

const factionRoles = {
  "212th": "212th Attack Battalion",
  "501st": "501st Legion",
  "91st": "91st Recon Company",
  "327th": "327th Star Corps",
  "38th": "38th Assault Corps",
};

const extraRoleName = "GARC Member";
const roleToRemoveId = "492653693091577856";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

const commands = [
  new SlashCommandBuilder()
    .setName("request-tags")
    .setDescription("Request your GARC faction tags")
    .addStringOption((option) =>
      option
        .setName("faction")
        .setDescription("Select your faction")
        .setRequired(true)
        .addChoices(
          { name: "212th Attack Battalion", value: "212th" },
          { name: "501st Legion", value: "501st" },
          { name: "91st Recon Company", value: "91st" },
          { name: "327th Star Corps", value: "327th" },
          { name: "38th Assault Corps", value: "38th" }
        )
    )
    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription("Your requested Discord/unit name")
        .setRequired(true)
    ),
].map((command) => command.toJSON());

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  if (!clientId || !guildId) {
    console.error("Missing CLIENT_ID or GUILD_ID in .env");
    return;
  }

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  try {
    console.log("Registering slash commands...");

    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: commands,
    });

    console.log("Slash commands registered.");
  } catch (error) {
    console.error("Failed to register slash commands:", error);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "request-tags") return;

  try {
    if (!interaction.guild) {
      await interaction.reply({
        content: "❌ This command can only be used inside the server.",
        ephemeral: true,
      });
      return;
    }

    const channelName = interaction.channel?.name?.toLowerCase();

    if (channelName !== "requesting-tags") {
      await interaction.reply({
        content: "❌ Please use `/request-tags` in the `requesting-tags` channel.",
        ephemeral: true,
      });
      return;
    }

    const faction = interaction.options.getString("faction", true);
    const name = interaction.options.getString("name", true).trim();

    if (!name) {
      await interaction.reply({
        content: "❌ Please enter a valid name.",
        ephemeral: true,
      });
      return;
    }

    const factionRoleName = factionRoles[faction];

    if (!factionRoleName) {
      await interaction.reply({
        content:
          "❌ Invalid faction. If you are GARC, please read the pinned message. If not, please contact a 101st NCO.",
        ephemeral: true,
      });
      return;
    }

    await interaction.guild.roles.fetch();

    const factionRole = interaction.guild.roles.cache.find(
      (role) => role.name === factionRoleName
    );

    const extraRole = interaction.guild.roles.cache.find(
      (role) => role.name === extraRoleName
    );

    const roleToRemove = interaction.guild.roles.cache.get(roleToRemoveId);

    if (!factionRole) {
      await interaction.reply({
        content: `❌ Requested faction role not found: **${factionRoleName}**`,
        ephemeral: true,
      });
      return;
    }

    if (!extraRole) {
      await interaction.reply({
        content: `❌ Extra role not found: **${extraRoleName}**`,
        ephemeral: true,
      });
      return;
    }

    const member = await interaction.guild.members.fetch(interaction.user.id);

    await member.roles.add(factionRole);
    await member.roles.add(extraRole);

    if (roleToRemove && member.roles.cache.has(roleToRemove.id)) {
      await member.roles.remove(roleToRemove);
    }

    let nicknameUpdated = true;

    await member.setNickname(name).catch(() => {
      nicknameUpdated = false;
    });

    const embed = new EmbedBuilder()
      .setColor(0x00ff66)
      .setTitle("✅ Tags Assigned")
      .setDescription(`Tags have been assigned for **${name}**.`)
      .addFields(
        {
          name: "Faction",
          value: factionRoleName,
          inline: true,
        },
        {
          name: "Member Role",
          value: extraRoleName,
          inline: true,
        },
        {
          name: "Nickname",
          value: nicknameUpdated
            ? `Updated to **${name}**`
            : "Could not update automatically. Please update your nickname manually.",
          inline: false,
        }
      )
      .setFooter({
        text: `Requested by ${interaction.user.tag}`,
      })
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
    });

    console.log(
      `[TAG REQUEST] Assigned ${factionRoleName} and ${extraRoleName} to ${interaction.user.tag}`
    );
  } catch (error) {
    console.error("Slash command error:", error);

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: "❌ Something went wrong while assigning your tags.",
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: "❌ Something went wrong while assigning your tags.",
        ephemeral: true,
      });
    }
  }
});

client.on("messageCreate", async (msg) => {
  try {
    if (msg.author.bot) return;
    if (!msg.guild) return;

    const content = msg.content.trim();
    const command = content.toLowerCase();
    const channelName = msg.channel.name?.toLowerCase();

    if (command === "server status") {
      const allowedChannels = ["bot-channel", "server-control"];

      if (!allowedChannels.includes(channelName)) return;

      await msg.channel.send("Checking server status...");

      exec(serverStatusBatch, async (error, stdout, stderr) => {
        if (error) {
          console.error(
            `Error executing Server Status command: ${stderr || error.message}`
          );

          await msg.channel.send("Failed to check server status.");
          return;
        }

        const output = stdout?.trim() || "No status output returned.";

        await msg.channel.send({
          content: `**Server Status:**\n\`\`\`\n${output.slice(0, 1900)}\n\`\`\``,
        });
      });

      return;
    }

    if (channelName === "loa") {
      const loaRole = msg.guild.roles.cache.find((role) => role.name === "LOA");

      if (!loaRole) {
        console.error("LOA role not found.");
        await msg.react("❌");
        return;
      }

      const member = await msg.guild.members.fetch(msg.author.id);

      const firstLine =
        content
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)[0] || "";

      const isEndingLoa = firstLine.toLowerCase().includes("end");

      if (isEndingLoa) {
        await member.roles.remove(loaRole);
        await msg.react("👍");
        return;
      }

      await member.roles.add(loaRole);
      await msg.react("👍");
      return;
    }
  } catch (error) {
    console.error("Message handler error:", error);

    try {
      await msg.react("❌");
    } catch {}
  }
});

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

client.login(process.env.TOKEN);