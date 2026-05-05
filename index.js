require("dotenv").config();

const { Client, GatewayIntentBits } = require("discord.js");
const { exec } = require("child_process");

const serverStatusBatch =
  `"C:\\discord-bot\\commands\\Check Server Status.bat"`;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
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

    // Server status command
    if (command === "server status") {
      const allowedChannels = ["bot-channel", "server-control"];

      if (!allowedChannels.includes(msg.channel.name)) return;

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
    if (msg.channel.name === "loa") {
      const loaRole = msg.guild.roles.cache.find((role) => role.name === "LOA");

      if (!loaRole) {
        await msg.react("❌");
        console.error("LOA role not found.");
        return;
      }

      const member = await msg.guild.members.fetch(msg.author.id);

      const firstLine =
        content
          .split("\n")
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
    }
  } catch (error) {
    console.error("Message handler error:", error);

    try {
      await msg.react("❌");
    } catch {}
  }
});

client.login(process.env.TOKEN);