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
const express = require("express");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(express.json());

const serverStatusBatch =
  '"C:\\Apps\\The-Superintendant\\commands\\Check Server Status.bat"';

const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;
const modteamGuildId = process.env.MODTEAM_GUILD_ID;

const websiteSecret = process.env.WEBSITE_BOT_SECRET;
const websiteActionPort = Number(process.env.WEBSITE_ACTION_PORT || 3020);
const remoteAgentBaseUrl = process.env.REMOTE_AGENT_BASE_URL;
const remoteAgentSecret = process.env.REMOTE_AGENT_SECRET;

const remoteServers = Object.freeze({
  server1: {
    label: "Server 1",
    port: 2100,
  },

  server2: {
    label: "Server 2",
    port: 2200,
  },

  server3: {
    label: "Server 3",
    port: 2300,
  },
});

const remoteServerChoices = Object.entries(remoteServers).map(
  ([value, server]) => ({
    name: `${server.label} — Port ${server.port}`,
    value,
  }),
);
const websiteAuditChannelId = "719715342884143204";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey)
    : null;

const requestTagsChannelId = "491197868560875530";
const loaChannelId = "448367192040407052";
const modteamTagChannelId = "635676190618681374";
const serverAuditChannelId = "1300274704241922058";
const adminOpenChannelId = "719715342884143204";

const factionRoles = {
  "212th": "212th Attack Battalion",
  "501st": "501st Legion",
  "91st": "91st Recon Company",
  "327th": "327th Star Corps",
  "38th": "38th Assault Corps",
};

const modteamRoles = {
  "101st": "101st",
  "501st": "501st",
  "91st": "91st",
  "327th": "327th",
  "38th": "38th",
};

const modteamSheetLink =
  "https://docs.google.com/spreadsheets/d/14G6fJP3V32_1vyI1YkjszJMyne_d-Y2kV1f-A8JG3pw/edit?usp=sharing";

const armourRequestMessage = `
**101st Armour Request Submission Guidelines**

You have selected the **101st** tag.

Before submitting an armour request, please make sure you follow the guidelines below:

**1. Use the correct sheet**
Open the spreadsheet link below and find the correct section for 101st armour requests.

**5. Wait for review**
Once submitted, the mod team will review your request when available. Do not repeatedly ping staff unless asked for more information.

**Armour Request Sheet:**
${modteamSheetLink}
`;

const extraRoleName = "GARC Member";
const roleToRemoveId = "492653693091577856";

const allowedUsers = [
  "593912175228354600",
  "364551483263418368",
  "561023307147640835",
];

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

function normaliseDiscordId(value) {
  if (!value) return null;

  const cleaned = String(value)
    .trim()
    .replace(/[<@!>]/g, "");

  return cleaned || null;
}

async function getPersonnelMentionFromSupabase(personnelId, fallbackName) {
  console.log("[website-action] Looking up target personnel ID:", personnelId);

  if (!supabase) {
    console.log(
      "[website-action] Supabase client missing. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
    return fallbackName || "Unknown";
  }

  if (!personnelId) {
    console.log("[website-action] No target personnel ID provided.");
    return fallbackName || "Unknown";
  }

  const { data, error } = await supabase
    .from("personnel")
    .select("id, name, discord_id")
    .eq("id", personnelId)
    .maybeSingle();

  if (error) {
    console.error(
      "[website-action] Failed to fetch target personnel from Supabase:",
      error,
    );
    return fallbackName || "Unknown";
  }

  console.log("[website-action] Target personnel from Supabase:", data);

  if (!data) {
    return fallbackName || "Unknown";
  }

  const discordId = normaliseDiscordId(data.discord_id);

  if (discordId) {
    return `<@${discordId}>`;
  }

  return data.name || fallbackName || "Unknown";
}

function buildWebsiteActionEmbed(payload, personnelMention) {
  const action = payload.action;

  const processedBy = payload.processedBy || payload.processorName || "Unknown";
  const rankName = payload.rankName || payload.newRankName || "Unknown";
  const oldRankName = payload.oldRankName || "Unknown";
  const certName =
    payload.certName || payload.certificationName || "Unknown Certification";
  const slotLabel =
    payload.slotLabel || payload.target_slot_label || "Unknown Slot";
  const slotSection =
    payload.slotSection || payload.target_slot_section || "N/A";

  const configs = {
    POSITION_ASSIGNED: {
      title: "🟢 POSITION ASSIGNED",
      color: 0x00ff66,
      summary: "A member has been assigned to a billet.",
      fields: [
        { name: "Member", value: personnelMention, inline: false },
        { name: "Assigned Position", value: slotLabel, inline: false },
        { name: "Section", value: slotSection, inline: true },
        { name: "Processed By", value: processedBy, inline: true },
      ],
    },

    POSITION_UNASSIGNED: {
      title: "🟡 POSITION REMOVED",
      color: 0xffcc00,
      summary: "A member has been removed from a billet.",
      fields: [
        { name: "Member", value: personnelMention, inline: false },
        { name: "Removed Position", value: slotLabel, inline: false },
        { name: "Section", value: slotSection, inline: true },
        { name: "Processed By", value: processedBy, inline: true },
      ],
    },

    RANK_CHANGED: {
      title: "🔵 PROMOTION / RANK CHANGE",
      color: 0x3498db,
      summary: "A rank change has been recorded.",
      fields: [
        { name: "Member", value: personnelMention, inline: false },
        { name: "Previous Rank", value: oldRankName, inline: true },
        { name: "New Rank", value: rankName, inline: true },
        { name: "Processed By", value: processedBy, inline: false },
      ],
    },

    CERTIFICATION_ASSIGNED: {
      title: "🟣 CERTIFICATION AWARDED",
      color: 0x9b59b6,
      summary: "A certification has been awarded.",
      fields: [
        { name: "Member", value: personnelMention, inline: false },
        { name: "Certification", value: certName, inline: true },
        { name: "Awarded By", value: processedBy, inline: true },
      ],
    },

    CERTIFICATION_REVOKED: {
      title: "🔴 CERTIFICATION REVOKED",
      color: 0xe74c3c,
      summary: "A certification has been revoked.",
      fields: [
        { name: "Member", value: personnelMention, inline: false },
        { name: "Certification", value: certName, inline: true },
        { name: "Revoked By", value: processedBy, inline: true },
      ],
    },
  };

  const config = configs[action] || {
    title: "⚙️ WEBSITE ACTION",
    color: 0x95a5a6,
    summary: payload.details || "A website action was performed.",
    fields: [
      { name: "Member", value: personnelMention, inline: false },
      { name: "Processed By", value: processedBy, inline: true },
      { name: "Action", value: action || "Unknown", inline: true },
    ],
  };

  return new EmbedBuilder()
    .setColor(config.color)
    .setAuthor({
      name: "101st Doom Battalion PCS",
    })
    .setTitle(config.title)
    .setDescription(config.summary)
    .addFields(
      { name: "━━━━━━━━━━━━━━━━━━", value: "\u200b", inline: false },
      ...config.fields,
      { name: "━━━━━━━━━━━━━━━━━━", value: "\u200b", inline: false },
    )
    .setFooter({
      text: "Processed automatically via Personnel Command System",
    })
    .setTimestamp();
}

app.post("/website-action", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!websiteSecret) {
      return res.status(500).json({
        error: "WEBSITE_BOT_SECRET is missing from bot .env",
      });
    }

    if (authHeader !== `Bearer ${websiteSecret}`) {
      return res.status(401).json({
        error: "Unauthorized",
      });
    }

    const payload = req.body || {};

    console.log("[website-action] Payload received:", payload);

    const targetPersonnelId =
      payload.target_personnel_id ||
      payload.personnel_id ||
      payload.personnelId ||
      payload.targetPersonnelId ||
      null;

    console.log("[website-action] Target personnel ID:", targetPersonnelId);

    const personnelMention = await getPersonnelMentionFromSupabase(
      targetPersonnelId,
      payload.personnelName,
    );

    console.log("[website-action] Target personnel mention:", personnelMention);

    const channel = await client.channels.fetch(websiteAuditChannelId);

    if (!channel) {
      return res.status(404).json({
        error: "Discord channel not found",
      });
    }

    const embed = buildWebsiteActionEmbed(payload, personnelMention);

    await channel.send({
      embeds: [embed],
      allowedMentions: {
        parse: ["users"],
      },
    });

    return res.json({
      success: true,
      target_personnel_id: targetPersonnelId,
      mentioned: personnelMention,
    });
  } catch (error) {
    console.error("Website action broadcast failed:", error);

    return res.status(500).json({
      error: "Failed to broadcast website action",
    });
  }
});

const mainGuildCommands = [
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
          { name: "38th Assault Corps", value: "38th" },
        ),
    )
    .addStringOption((option) =>
      option
        .setName("name")
        .setDescription("Your requested Discord/unit name")
        .setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName("loa")
    .setDescription("Start or end Leave of Absence")
    .addStringOption((option) =>
      option
        .setName("action")
        .setDescription("Choose whether to start or end LOA")
        .setRequired(true)
        .addChoices(
          { name: "Start LOA", value: "start" },
          { name: "End LOA", value: "end" },
        ),
    )
    .addStringOption((option) =>
      option
        .setName("type")
        .setDescription("Select the LOA type")
        .setRequired(false)
        .addChoices(
          { name: "LOA", value: "LOA" },
          { name: "SLOA", value: "SLOA" },
          { name: "ELOA", value: "ELOA" },
          { name: "ULOA", value: "ULOA" },
        ),
    )
    .addStringOption((option) =>
      option
        .setName("expected_end")
        .setDescription("Expected LOA end date, e.g. 20/05/2026")
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("reason")
        .setDescription("Reason for LOA")
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("pings")
        .setDescription("Users or roles to ping")
        .setRequired(false),
    ),

  new SlashCommandBuilder()
    .setName("server")
    .setDescription("Control an Arma server")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("start")
        .setDescription("Start an Arma server")
        .addStringOption((option) =>
          option
            .setName("server")
            .setDescription("Select the Arma server to start")
            .setRequired(true)
            .addChoices(...remoteServerChoices),
        ),
    ),
].map((command) => command.toJSON());

const modteamCommands = [
  new SlashCommandBuilder()
    .setName("modteam-tag")
    .setDescription("Request a Modteam server tag")
    .addStringOption((option) =>
      option
        .setName("tag")
        .setDescription("Select the tag you need")
        .setRequired(true)
        .addChoices(
          { name: "101st", value: "101st" },
          { name: "501st", value: "501st" },
          { name: "91st", value: "91st" },
          { name: "327th", value: "327th" },
          { name: "38th", value: "38th" },
        ),
    ),
].map((command) => command.toJSON());

async function startRemoteServer(serverKey, requestedBy) {
  if (!remoteAgentBaseUrl) {
    throw new Error("REMOTE_AGENT_BASE_URL is missing from the bot .env");
  }

  if (!remoteAgentSecret) {
    throw new Error("REMOTE_AGENT_SECRET is missing from the bot .env");
  }

  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 60_000);

  try {
    const baseUrl = remoteAgentBaseUrl.replace(/\/+$/, "");

    const response = await fetch(`${baseUrl}/server/start`, {
      method: "POST",

      headers: {
        Authorization: `Bearer ${remoteAgentSecret}`,
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        server: serverKey,
        requestedBy,
      }),

      signal: controller.signal,
    });

    const responseText = await response.text();

    let result = {};

    try {
      result = responseText ? JSON.parse(responseText) : {};
    } catch {
      result = {
        error:
          responseText || "The remote Arma agent returned an invalid response",
      };
    }

    if (!response.ok) {
      throw new Error(
        result.error || `Remote agent returned HTTP ${response.status}`,
      );
    }

    return result;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(
        "The remote Arma server did not respond within 60 seconds",
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  app.listen(websiteActionPort, "0.0.0.0", () => {
    console.log(`Website action listener running on port ${websiteActionPort}`);
  });

  if (!clientId || !guildId) {
    console.error("Missing CLIENT_ID or GUILD_ID in .env");
    return;
  }

  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

  try {
    console.log("Registering main guild slash commands...");

    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: mainGuildCommands,
    });

    console.log("Main guild slash commands registered.");

    if (modteamGuildId) {
      console.log("Registering Modteam guild slash commands...");

      await rest.put(
        Routes.applicationGuildCommands(clientId, modteamGuildId),
        {
          body: modteamCommands,
        },
      );

      console.log("Modteam guild slash commands registered.");
    } else {
      console.warn(
        "MODTEAM_GUILD_ID missing in .env, skipping Modteam commands.",
      );
    }
  } catch (error) {
    console.error("Failed to register slash commands:", error);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    if (!interaction.guild) {
      await interaction.reply({
        content: "❌ This command can only be used inside a server.",
        ephemeral: true,
      });
      return;
    }

    if (interaction.commandName === "request-tags") {
      if (interaction.guildId !== guildId) {
        await interaction.reply({
          content: "❌ This command can only be used in the main server.",
          ephemeral: true,
        });
        return;
      }

      if (interaction.channelId !== requestTagsChannelId) {
        await interaction.reply({
          content: `❌ Please use \`/request-tags\` in <#${requestTagsChannelId}>.`,
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
        (role) => role.name === factionRoleName,
      );

      const extraRole = interaction.guild.roles.cache.find(
        (role) => role.name === extraRoleName,
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
          },
        )
        .setFooter({
          text: `Requested by ${interaction.user.tag}`,
        })
        .setTimestamp();

      await interaction.reply({
        embeds: [embed],
      });

      console.log(
        `[TAG REQUEST] Assigned ${factionRoleName} and ${extraRoleName} to ${interaction.user.tag}`,
      );

      return;
    }

    if (interaction.commandName === "loa") {
      if (interaction.guildId !== guildId) {
        await interaction.reply({
          content: "❌ This command can only be used in the main server.",
          ephemeral: true,
        });
        return;
      }

      if (interaction.channelId !== loaChannelId) {
        await interaction.reply({
          content: `❌ Please use \`/loa\` in <#${loaChannelId}>.`,
          ephemeral: true,
        });
        return;
      }

      const action = interaction.options.getString("action", true);
      const loaType = interaction.options.getString("type") || "LOA";
      const expectedEnd =
        interaction.options.getString("expected_end")?.trim() || "Not provided";
      const reason =
        interaction.options.getString("reason")?.trim() ||
        "No reason provided.";

      const pings = interaction.options.getString("pings")?.trim() || "";

      const pingContent = pings;

      await interaction.guild.roles.fetch();

      const loaRole = interaction.guild.roles.cache.find(
        (role) => role.name === "LOA",
      );

      if (!loaRole) {
        await interaction.reply({
          content: "❌ LOA role not found. Please contact staff.",
          ephemeral: true,
        });
        return;
      }

      const member = await interaction.guild.members.fetch(interaction.user.id);

      if (action === "end") {
        await member.roles.remove(loaRole);

        const embed = new EmbedBuilder()
          .setColor(0xff5555)
          .setTitle("✅ LOA Ended")
          .setDescription(
            `${interaction.user} has ended their Leave of Absence.`,
          )
          .addFields(
            {
              name: "Member",
              value: `${interaction.user}`,
              inline: true,
            },
            {
              name: "LOA Type",
              value: loaType,
              inline: true,
            },
            {
              name: "Expected End Date",
              value: expectedEnd,
              inline: true,
            },
            {
              name: "Pinged",
              value: pings || "None",
              inline: true,
            },
            {
              name: "Reason",
              value: reason,
              inline: false,
            },
          )
          .setFooter({
            text: `Requested by ${interaction.user.tag}`,
          })
          .setTimestamp();

        await interaction.reply({
          content: pingContent,
          embeds: [embed],
          allowedMentions: {
            parse: ["users", "roles"],
          },
        });

        console.log(
          `[LOA] Removed LOA role from ${interaction.user.tag} | Type: ${loaType} | Expected End: ${expectedEnd} | Pinged: ${
            pings || "None"
          } | Reason: ${reason}`,
        );
        return;
      }

      await member.roles.add(loaRole);

      const embed = new EmbedBuilder()
        .setColor(0x00ff66)
        .setTitle("✅ LOA Started")
        .setDescription(
          `${interaction.user} is now marked as on Leave of Absence.`,
        )
        .addFields(
          {
            name: "Member",
            value: `${interaction.user}`,
            inline: true,
          },
          {
            name: "LOA Type",
            value: loaType,
            inline: true,
          },
          {
            name: "Expected End Date",
            value: expectedEnd,
            inline: true,
          },
          {
            name: "Pinged",
            value: pings || "None",
            inline: true,
          },
          {
            name: "Reason",
            value: reason,
            inline: false,
          },
        )
        .setFooter({
          text: `Requested by ${interaction.user.tag}`,
        })
        .setTimestamp();

      await interaction.reply({
        content: pingContent,
        embeds: [embed],
        allowedMentions: {
          parse: ["users", "roles"],
        },
      });

      console.log(
        `[LOA] Added LOA role to ${interaction.user.tag} | Type: ${loaType} | Expected End: ${expectedEnd} | Pinged: ${
          pings || "None"
        } | Reason: ${reason}`,
      );
      return;
    }

    if (interaction.commandName === "server") {
  if (interaction.guildId !== guildId) {
    await interaction.reply({
      content: "❌ This command can only be used in the main server.",
      ephemeral: true,
    });

    return;
  }

  if (!allowedUsers.includes(interaction.user.id)) {
    console.warn(
      `[UNAUTHORISED SERVER ACCESS] ${interaction.user.tag} ` +
        `(${interaction.user.id}) attempted to use /server`,
    );

    try {
      const auditChannel = await client.channels.fetch(
        serverAuditChannelId,
      );

      if (auditChannel?.isTextBased()) {
        const unauthorizedEmbed = new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle("🚨 Unauthorized Server Control Attempt")
          .addFields(
            {
              name: "User",
              value: `${interaction.user}`,
              inline: true,
            },
            {
              name: "User ID",
              value: interaction.user.id,
              inline: true,
            },
            {
              name: "Discord Server",
              value: interaction.guild?.name || "Unknown",
              inline: false,
            },
            {
              name: "Channel",
              value: `<#${interaction.channelId}>`,
              inline: false,
            },
          )
          .setFooter({
            text: "Remote Arma server control",
          })
          .setTimestamp();

        await auditChannel.send({
          embeds: [unauthorizedEmbed],
        });
      }
    } catch (auditError) {
      console.error(
        "Failed to record unauthorized server-control attempt:",
        auditError,
      );
    }

    await interaction.reply({
      content: "❌ You are not allowed to control the Arma servers.",
      ephemeral: true,
    });

    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand !== "start") {
    await interaction.reply({
      content: "❌ Invalid server action.",
      ephemeral: true,
    });

    return;
  }

  const serverKey = interaction.options.getString(
    "server",
    true,
  );

  const selectedServer = remoteServers[serverKey];

  if (!selectedServer) {
    await interaction.reply({
      content: "❌ Invalid server selection.",
      ephemeral: true,
    });

    return;
  }

  await interaction.deferReply({
    ephemeral: true,
  });

  const startingEmbed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle(`🟠 Starting ${selectedServer.label}`)
    .setDescription(
      "The start request is being sent to the remote Arma server.",
    )
    .addFields(
      {
        name: "Server",
        value: selectedServer.label,
        inline: true,
      },
      {
        name: "Game Port",
        value: String(selectedServer.port),
        inline: true,
      },
      {
        name: "Requested By",
        value: `${interaction.user}`,
        inline: true,
      },
      {
        name: "Status",
        value: "Contacting remote server agent…",
        inline: false,
      },
    )
    .setFooter({
      text: "Waiting for the remote server agent",
    })
    .setTimestamp();

  await interaction.editReply({
    embeds: [startingEmbed],
  });

  try {
    const result = await startRemoteServer(
      serverKey,
      `${interaction.user.tag} (${interaction.user.id})`,
    );

    const successEmbed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle(
        `🟢 ${selectedServer.label} Start Command Successful`,
      )
      .setDescription(
        "The remote Arma machine successfully executed the server batch file.",
      )
      .addFields(
        {
          name: "Server",
          value: selectedServer.label,
          inline: true,
        },
        {
          name: "Game Port",
          value: String(selectedServer.port),
          inline: true,
        },
        {
          name: "Requested By",
          value: `${interaction.user}`,
          inline: true,
        },
        {
          name: "Remote Result",
          value:
            result.message ||
            "The server batch file executed successfully.",
          inline: false,
        },
      )
      .setFooter({
        text: "Use server status to confirm the server is online",
      })
      .setTimestamp();

    await interaction.editReply({
      embeds: [successEmbed],
    });

    console.log(
      `[REMOTE SERVER START] ${interaction.user.tag} started ` +
        `${selectedServer.label} on port ${selectedServer.port}`,
    );

    try {
      const auditChannel = await client.channels.fetch(
        serverAuditChannelId,
      );

      if (auditChannel?.isTextBased()) {
        const successAuditEmbed = new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle("🟢 Arma Server Start Command Completed")
          .addFields(
            {
              name: "Server",
              value: selectedServer.label,
              inline: true,
            },
            {
              name: "Game Port",
              value: String(selectedServer.port),
              inline: true,
            },
            {
              name: "Requested By",
              value: `${interaction.user}`,
              inline: true,
            },
            {
              name: "User ID",
              value: interaction.user.id,
              inline: true,
            },
            {
              name: "Channel",
              value: `<#${interaction.channelId}>`,
              inline: true,
            },
            {
              name: "Remote Result",
              value:
                result.message ||
                "The server batch file executed successfully.",
              inline: false,
            },
          )
          .setFooter({
            text: "Remote Arma server control",
          })
          .setTimestamp();

        await auditChannel.send({
          embeds: [successAuditEmbed],
        });
      }
    } catch (auditError) {
      console.error(
        "Failed to send successful server-start audit:",
        auditError,
      );
    }
  } catch (error) {
    console.error(
      `[REMOTE SERVER START ERROR] ${selectedServer.label}:`,
      error,
    );

    const errorMessage = String(
      error.message || error,
    ).slice(0, 900);

    const failedEmbed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle(`🔴 ${selectedServer.label} Failed to Start`)
      .setDescription(
        "The remote Arma machine could not execute the server start command.",
      )
      .addFields(
        {
          name: "Server",
          value: selectedServer.label,
          inline: true,
        },
        {
          name: "Game Port",
          value: String(selectedServer.port),
          inline: true,
        },
        {
          name: "Requested By",
          value: `${interaction.user}`,
          inline: true,
        },
        {
          name: "Error",
          value: `\`\`\`${errorMessage}\`\`\``,
          inline: false,
        },
      )
      .setFooter({
        text: "Check the remote-agent console and server launch log",
      })
      .setTimestamp();

    await interaction.editReply({
      embeds: [failedEmbed],
    });

    try {
      const auditChannel = await client.channels.fetch(
        serverAuditChannelId,
      );

      if (auditChannel?.isTextBased()) {
        const failureAuditEmbed = new EmbedBuilder()
          .setColor(0xed4245)
          .setTitle("🔴 Arma Server Start Failed")
          .addFields(
            {
              name: "Server",
              value: selectedServer.label,
              inline: true,
            },
            {
              name: "Game Port",
              value: String(selectedServer.port),
              inline: true,
            },
            {
              name: "Requested By",
              value: `${interaction.user}`,
              inline: true,
            },
            {
              name: "User ID",
              value: interaction.user.id,
              inline: true,
            },
            {
              name: "Error",
              value: errorMessage,
              inline: false,
            },
          )
          .setFooter({
            text: "Remote Arma server control",
          })
          .setTimestamp();

        await auditChannel.send({
          embeds: [failureAuditEmbed],
        });
      }
    } catch (auditError) {
      console.error(
        "Failed to send server-start failure audit:",
        auditError,
      );
    }
  }

  return;
}

    if (interaction.commandName === "modteam-tag") {
      if (!modteamGuildId || interaction.guildId !== modteamGuildId) {
        await interaction.reply({
          content: "❌ This command can only be used in the Modteam server.",
          ephemeral: true,
        });
        return;
      }

      if (interaction.channelId !== modteamTagChannelId) {
        await interaction.reply({
          content: `❌ Please use \`/modteam-tag\` in <#${modteamTagChannelId}>.`,
          ephemeral: true,
        });
        return;
      }

      const tag = interaction.options.getString("tag", true);
      const roleName = modteamRoles[tag];

      if (!roleName) {
        await interaction.reply({
          content: "❌ Invalid tag selected.",
          ephemeral: true,
        });
        return;
      }

      await interaction.guild.roles.fetch();

      const selectedRole = interaction.guild.roles.cache.find(
        (serverRole) => serverRole.name === roleName,
      );

      if (!selectedRole) {
        await interaction.reply({
          content: `❌ Role not found: **${roleName}**`,
          ephemeral: true,
        });
        return;
      }

      const member = await interaction.guild.members.fetch(interaction.user.id);

      const modteamRoleNames = Object.values(modteamRoles);

      const rolesToRemove = member.roles.cache.filter(
        (memberRole) =>
          modteamRoleNames.includes(memberRole.name) &&
          memberRole.id !== selectedRole.id,
      );

      if (rolesToRemove.size > 0) {
        await member.roles.remove(rolesToRemove);
      }

      if (!member.roles.cache.has(selectedRole.id)) {
        await member.roles.add(selectedRole);
      }

      let dmSent = true;

      if (tag === "101st") {
        await interaction.user.send(armourRequestMessage).catch(() => {
          dmSent = false;
        });
      }

      const embed = new EmbedBuilder()
        .setColor(0x00ff66)
        .setTitle("✅ Tag Updated")
        .setDescription(`You have been assigned the **${roleName}** role.`)
        .addFields({
          name: "Previous Tags",
          value:
            rolesToRemove.size > 0
              ? `Removed: ${rolesToRemove.map((role) => role.name).join(", ")}`
              : "No previous Modteam tags found.",
          inline: false,
        })
        .setFooter({
          text: `Requested by ${interaction.user.tag}`,
        })
        .setTimestamp();

      if (tag === "101st") {
        embed.addFields({
          name: "Armour Request Guidelines",
          value: dmSent
            ? "I have sent the armour request submission guidelines to your DMs."
            : `I could not DM you. Please use the armour request sheet here:\n${modteamSheetLink}`,
          inline: false,
        });
      }

      await interaction.reply({
        embeds: [embed],
        ephemeral: true,
      });

      console.log(
        `[MODTEAM TAG] Assigned ${roleName} to ${interaction.user.tag}. Removed: ${
          rolesToRemove.size > 0
            ? rolesToRemove.map((role) => role.name).join(", ")
            : "None"
        }`,
      );

      return;
    }
  } catch (error) {
    console.error("Slash command error:", error);

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: "❌ Something went wrong while running this command.",
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: "❌ Something went wrong while running this command.",
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

      const checkingMessage = await msg.channel.send(
        "🔄 Checking server status...",
      );

      exec(serverStatusBatch, async (error, stdout, stderr) => {
        try {
          if (error && !stdout?.trim()) {
            console.error(
              `Error executing Server Status command: ${
                stderr || error.message
              }`,
            );

            await checkingMessage.edit("❌ Failed to check server status.");

            return;
          }

          const resultLines = stdout
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter((line) => line.startsWith("RESULT|"));

          if (resultLines.length === 0) {
            console.error("No readable server results returned:", {
              stdout,
              stderr,
            });

            await checkingMessage.edit(
              "⚠️ No server status results were returned.",
            );

            return;
          }

          const servers = resultLines.map((line) => {
            const [, name, status, port] = line.split("|");

            return {
              name,
              status,
              port,
            };
          });

          const onlineCount = servers.filter(
            (server) => server.status === "ONLINE",
          ).length;

          const description = servers
            .map((server) => {
              const icon = server.status === "ONLINE" ? "🟢" : "🔴";

              return [
                `${icon} **${server.name}**`,
                `Status: **${server.status}**`,
                `Game Port: \`${server.port}\``,
              ].join("\n");
            })
            .join("\n\n");

          const embed = {
            color:
              onlineCount === servers.length
                ? 0x57f287
                : onlineCount === 0
                  ? 0xed4245
                  : 0xfee75c,
            title: "Arma 3 Server Status",
            description,
            fields: [
              {
                name: "Summary",
                value: `${onlineCount}/${servers.length} servers online`,
                inline: false,
              },
            ],
            footer: {
              text: "101st Doom Battalion",
            },
            timestamp: new Date().toISOString(),
          };

          await checkingMessage.edit({
            content: "",
            embeds: [embed],
          });
        } catch (callbackError) {
          console.error("Error handling Server Status output:", callbackError);

          await checkingMessage.edit(
            "❌ The status check completed, but the result could not be displayed.",
          );
        }
      });

      return;
    }
  } catch (error) {
    console.error("Message handler error:", error);

    try {
      await msg.react("❌");
    } catch {}
  }
});

client.on("guildMemberRemove", async (member) => {
  try {
    const adminOpenChannel =
      member.guild.channels.cache.get(adminOpenChannelId) ||
      (await member.guild.channels.fetch(adminOpenChannelId).catch(() => null));

    if (!adminOpenChannel?.isTextBased()) {
      console.warn(
        `[MEMBER LEFT] Administration channel not found in ${member.guild.name}`,
      );
      return;
    }

    const displayName =
      member.nickname ||
      member.user.globalName ||
      member.user.username ||
      `User ID ${member.id}`;

    await adminOpenChannel.send(
      `${displayName} has left the server.\nYou are the weakest link, goodbye`,
    );

    console.log(
      `[MEMBER LEFT] ${displayName} (${member.id}) left ${member.guild.name}`,
    );
  } catch (error) {
    console.error("Error sending leave message:", error);
  }
});

process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

client.login(process.env.TOKEN);
