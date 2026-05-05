require("dotenv").config();

const { Client, GatewayIntentBits } = require("discord.js");
const { exec } = require("child_process");

const serverStatusBatch =
  `"C:\\discord-bot\\commands\\Check Server Status.bat"`;

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

client.once("clientReady", () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on("messageCreate", async (msg) => {
  try {
    if (msg.author.bot) return;
    if (!msg.guild) return;

    const content = msg.content.trim();
    const command = content.toLowerCase();
    const channelName = msg.channel.name?.toLowerCase();

    // Server status command
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

    // LOA role handler
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

    // Requesting tags handler
    if (channelName === "requesting-tags") {
      console.log(`[TAG REQUEST] Message received from ${msg.author.tag}: ${content}`);

      if (!command.startsWith("requesting:")) {
        console.log("[TAG REQUEST] Ignored: message does not start with Requesting:");
        return;
      }

      const lines = content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      const requestingLine = lines.find((line) =>
        line.toLowerCase().startsWith("requesting:")
      );

      const nameLine = lines.find((line) =>
        line.toLowerCase().startsWith("name:")
      );

      if (!requestingLine || !nameLine) {
        await msg.channel.send(
          "Invalid format. Please use:\n```Requesting: 501st\nName: Your Name```"
        );
        await msg.react("❌");
        return;
      }

      const faction = requestingLine.replace(/^requesting:\s*/i, "").trim();
      const name = nameLine.replace(/^name:\s*/i, "").trim();

      if (!faction || !name) {
        await msg.channel.send(
          "Invalid format. Please use:\n```Requesting: 501st\nName: Your Name```"
        );
        await msg.react("❌");
        return;
      }

      const factionRoleName = factionRoles[faction];

      if (!factionRoleName) {
        await msg.channel.send(
          "Invalid faction, if you are GARC read pinned, if not please contact a 101st NCO."
        );
        await msg.react("❌");
        return;
      }

      await msg.guild.roles.fetch();

      const factionRole = msg.guild.roles.cache.find(
        (role) => role.name === factionRoleName
      );

      const extraRole = msg.guild.roles.cache.find(
        (role) => role.name === extraRoleName
      );

      const roleToRemove = msg.guild.roles.cache.get(roleToRemoveId);

      if (!factionRole) {
        await msg.channel.send(`Requested faction role not found: ${factionRoleName}`);
        await msg.react("❌");
        return;
      }

      if (!extraRole) {
        await msg.channel.send(`Extra role not found: ${extraRoleName}`);
        await msg.react("❌");
        return;
      }

      const member = await msg.guild.members.fetch(msg.author.id);

      await member.roles.add(factionRole);
      await member.roles.add(extraRole);

      if (roleToRemove && member.roles.cache.has(roleToRemove.id)) {
        await member.roles.remove(roleToRemove);
      }

      await msg.react("👍");
      await msg.channel.send(`Tags assigned for ${name}, have you updated your name?`);

      console.log(
        `[TAG REQUEST] Assigned ${factionRoleName} and ${extraRoleName} to ${msg.author.tag}`
      );

      return;
    }
  } catch (error) {
    console.error("Message handler error:", error);

    try {
      await msg.react("❌");
    } catch {}
  }
});

client.login(process.env.TOKEN);