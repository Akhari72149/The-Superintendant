const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const { Client, GatewayIntentBits } = require("discord.js");

const CHANNEL_ID = "1142843038725591082";

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const status = process.argv[2] || "success";
const mode = process.argv[3] || "manual";

client.once("ready", async () => {
  try {
    const channel = await client.channels.fetch(CHANNEL_ID);

    if (!channel) {
      console.error("Backup notice channel not found.");
      process.exit(1);
    }

    const now = new Date().toLocaleString("en-GB", {
      timeZone: "Europe/London",
      hour12: false,
    });

    let message;

    if (status === "success") {
      message = `✅ **Server backup completed**\nMode: **${mode}**\nTime: **${now}**`;
    } else if (status === "cancelled") {
      message = `⚠️ **Server backup cancelled**\nMode: **${mode}**\nTime: **${now}**`;
    } else {
      message = `❌ **Server backup failed**\nMode: **${mode}**\nTime: **${now}**`;
    }

    await channel.send(message);
    console.log("Backup notice sent.");
    process.exit(0);
  } catch (err) {
    console.error("Failed to send backup notice:", err);
    process.exit(1);
  }
});

if (!process.env.TOKEN) {
  console.error("Missing TOKEN in C:\\discord-bot\\.env");
  process.exit(1);
}

client.login(process.env.TOKEN);