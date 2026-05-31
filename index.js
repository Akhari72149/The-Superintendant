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

const serverStatusBatch = `"C:\\discord-bot\\commands\\Check Server Status.bat"`;

const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;
const modteamGuildId = process.env.MODTEAM_GUILD_ID;

const websiteSecret = process.env.WEBSITE_BOT_SECRET;
const websiteActionPort = Number(process.env.WEBSITE_ACTION_PORT || 3020);
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
const batAuditChannelId = "1300274704241922058";

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

const allowedBatCommands = {
  backup:
    "C:\\Users\\Administrator\\Desktop\\Bat Command Shortcuts\\backup-auto.bat",
};

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
    .setName("runbat")
    .setDescription("Run an approved server batch command")
    .addStringOption((option) =>
      option
        .setName("command")
        .setDescription("Batch command to run")
        .setRequired(true)
        .addChoices({ name: "Backup Auto", value: "backup" }),
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
            pingUser ? pingUser.tag : "None"
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
          pingUser ? pingUser.tag : "None"
        } | Reason: ${reason}`,
      );
      return;
    }

    if (interaction.commandName === "runbat") {
      if (!allowedUsers.includes(interaction.user.id)) {
        console.warn(
          `[UNAUTHORISED BAT ACCESS] ${interaction.user.tag} (${interaction.user.id}) attempted to run /runbat`,
        );

        try {
          const auditChannel = await client.channels.fetch(batAuditChannelId);

          if (auditChannel) {
            const embed = new EmbedBuilder()
              .setColor(0xff0000)
              .setTitle("🚨 Unauthorized /runbat Attempt")
              .addFields(
                {
                  name: "User",
                  value: `${interaction.user.tag}`,
                  inline: true,
                },
                {
                  name: "User ID",
                  value: interaction.user.id,
                  inline: true,
                },
                {
                  name: "Server",
                  value: interaction.guild?.name || "Unknown",
                  inline: false,
                },
                {
                  name: "Channel",
                  value: `<#${interaction.channelId}>`,
                  inline: false,
                },
              )
              .setTimestamp();

            await auditChannel.send({
              embeds: [embed],
            });
          }
        } catch (logError) {
          console.error("Failed to send unauthorized BAT audit log:", logError);
        }

        await interaction.reply({
          content: "❌ You are not allowed to run this command.",
          ephemeral: true,
        });

        return;
      }

      const command = interaction.options.getString("command", true);
      const batPath = allowedBatCommands[command];

      if (!batPath) {
        await interaction.reply({
          content: "❌ Invalid batch command.",
          ephemeral: true,
        });
        return;
      }

      await interaction.reply({
        content: `⚙️ Running batch command: **${command}**`,
        ephemeral: true,
      });

      exec(
        `"${batPath}"`,
        { windowsHide: true },
        async (error, stdout, stderr) => {
          if (error) {
            console.error(`[BAT ERROR] ${command}`, error);

            await interaction.followUp({
              content: `❌ Batch command failed:\n\`\`\`${String(
                stderr || error.message,
              ).slice(0, 1800)}\`\`\``,
              ephemeral: true,
            });

            return;
          }

          console.log(`[BAT SUCCESS] ${command}`);
          if (stdout) console.log(stdout);
          if (stderr) console.error(stderr);

          await interaction.followUp({
            content: `✅ Batch command completed successfully: **${command}**`,
            ephemeral: true,
          });
        },
      );

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

      await msg.channel.send("Checking server status...");

      exec(serverStatusBatch, async (error, stdout, stderr) => {
        if (error) {
          console.error(
            `Error executing Server Status command: ${stderr || error.message}`,
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
