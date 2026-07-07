require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder,
  MessageFlags,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");

const { exec } = require("child_process");
const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const { registerSteamVerificationRoutes } = require("./steam-verification");

const app = express();

const serverStatusBatch =
  '"C:\\Apps\\The-Superintendant\\commands\\Check Server Status.bat"';

const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;
const modteamGuildId = process.env.MODTEAM_GUILD_ID;

const websiteSecret = process.env.WEBSITE_BOT_SECRET;
const websiteActionPort = Number(
  process.env.WEBSITE_ACTION_PORT ||
    process.env.STEAM_VERIFICATION_PORT ||
    3020,
);
const websiteActionHost =
  process.env.WEBSITE_ACTION_HOST ||
  process.env.STEAM_VERIFICATION_HOST ||
  "0.0.0.0";
const steamVerificationPath =
  process.env.STEAM_VERIFICATION_PATH || "/api/steam-verification";
const remoteAgentBaseUrl = process.env.REMOTE_AGENT_BASE_URL;
const remoteAgentSecret = process.env.REMOTE_AGENT_SECRET;
let websiteActionServer = null;

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
const serverAuditChannelId = "1142843038725591082";
const adminOpenChannelId = "719715342884143204";

const serverControlChannelId = "1300274704241922058";

const serverControlRoleIds = new Set([
  "472444743222296586",
  "1340561384437448828",
]);

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


const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.User,
  ],
});

registerSteamVerificationRoutes({ app, client, EmbedBuilder });
app.use(express.json());

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
    throw new Error(
      "REMOTE_AGENT_BASE_URL is missing from the bot .env",
    );
  }

  if (!remoteAgentSecret) {
    throw new Error(
      "REMOTE_AGENT_SECRET is missing from the bot .env",
    );
  }

  const controller = new AbortController();

  /*
   * The remote agent waits for up to 90 seconds for the
   * correct Arma console window. Give it additional time
   * for the batch launch and network response.
   */
  const timeout = setTimeout(() => {
    controller.abort();
  }, 120_000);

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
          responseText ||
          "The remote Arma agent returned an invalid response",
      };
    }

    if (!response.ok) {
      throw new Error(
        result.error ||
          `Remote agent returned HTTP ${response.status}`,
      );
    }

    return result;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(
        "The remote Arma server did not respond within 120 seconds",
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

const attendancePollIntervalMs = Number(
  process.env.ATTENDANCE_POLL_INTERVAL_MS || 30000,
);
let attendancePollTimer = null;
let attendancePollRunning = false;

const attendanceAssignableRoleIds = new Set([
  "1165712538047090688",
  "1165712595412602910",
  "1165712638764916737",
  "1165712700186296492",
]);

function addDays(dateValue, days) {
  const date = new Date(dateValue);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function getNextWeeklyIso(dateValue) {
  let date = new Date(dateValue);
  const now = Date.now();

  while (Number.isFinite(date.getTime()) && date.getTime() <= now) {
    date = new Date(addDays(date, 7));
  }

  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function getAttendanceEmojiKey(value) {
  const raw = String(value || "").trim();
  const customMatch = raw.match(/^<a?:\w+:(\d+)>$/);
  return customMatch ? customMatch[1] : raw;
}

function getReactionEmojiKey(reaction) {
  return reaction.emoji.id || reaction.emoji.name;
}

function optionMatchesReaction(option, reaction) {
  return getAttendanceEmojiKey(option.emoji) === getReactionEmojiKey(reaction);
}

function getAttendanceButtonEmoji(value) {
  const emoji = String(value || "").trim();
  const customMatch = emoji.match(/^<a?:([^:>]+):(\d+)>$/);

  if (customMatch) {
    return {
      name: customMatch[1],
      id: customMatch[2],
      animated: emoji.startsWith("<a:"),
    };
  }

  return emoji || undefined;
}

function buildAttendanceComponents(options) {
  const rows = [];
  const limitedOptions = (options || []).slice(0, 25);

  for (let index = 0; index < limitedOptions.length; index += 5) {
    const row = new ActionRowBuilder();

    for (const option of limitedOptions.slice(index, index + 5)) {
      const button = new ButtonBuilder()
        .setCustomId(`attendance:${option.event_id}:${option.id}`)
        .setStyle(ButtonStyle.Secondary);
      const emoji = getAttendanceButtonEmoji(option.emoji);

      if (emoji) {
        button.setEmoji(emoji);
      } else {
        button.setLabel(option.label || "Select");
      }

      row.addComponents(button);
    }

    rows.push(row);
  }

  return rows;
}

function formatDiscordTimestamp(isoValue, style = "F") {
  const seconds = Math.floor(new Date(isoValue).getTime() / 1000);
  return Number.isFinite(seconds) ? `<t:${seconds}:${style}>` : "Unknown";
}

function formatDuration(minutes) {
  const total = Number(minutes || 0);
  if (!Number.isFinite(total) || total <= 0) return "Unknown";
  if (total % 60 === 0) return `${total / 60} hour${total === 60 ? "" : "s"}`;
  return `${total} minutes`;
}

function sanitizeAttendanceName(value) {
  return String(value || "")
    .replace(/\*/g, "\\*")
    .replace(/_/g, "\\_")
    .slice(0, 90);
}

function cleanRoleId(value) {
  const roleId = String(value || "").trim().replace(/[<@&>]/g, "");
  return /^\d{16,22}$/.test(roleId) ? roleId : "";
}

function cleanAttendanceAssignableRoleId(value) {
  const roleId = cleanRoleId(value);
  return attendanceAssignableRoleIds.has(roleId) ? roleId : "";
}

function buildRolePingContent(roleId, trailingMessage = "") {
  const cleanId = cleanRoleId(roleId);
  const message = String(trailingMessage || "").trim();

  if (cleanId && message) return `<@&${cleanId}> ${message}`;
  if (cleanId) return `<@&${cleanId}>`;
  return message;
}

function buildAllowedRoleMentions(...roleIds) {
  const roles = roleIds.map(cleanRoleId).filter(Boolean);
  return roles.length ? { roles } : { parse: [] };
}

async function getAttendanceEventBundle(eventId) {
  const { data: event, error: eventError } = await supabase
    .from("discord_attendance_events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError || !event) {
    throw eventError || new Error("Attendance event not found");
  }

  const [
    { data: options, error: optionsError },
    { data: responses, error: responsesError },
  ] = await Promise.all([
    supabase
      .from("discord_attendance_options")
      .select("*")
      .eq("event_id", eventId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("discord_attendance_responses")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true }),
  ]);

  if (optionsError) throw optionsError;
  if (responsesError) throw responsesError;

  return {
    event,
    options: options || [],
    responses: responses || [],
  };
}

function buildAttendanceEmbed(event, options, responses) {
  const embed = new EmbedBuilder()
    .setTitle(`📅 ${event.title}`)
    .setColor(0x00ff66)
    .addFields(
      {
        name: "Time",
        value: `${formatDiscordTimestamp(
          event.event_starts_at,
          "F",
        )} (${formatDiscordTimestamp(event.event_starts_at, "R")})`,
        inline: false,
      },
      {
        name: "Duration",
        value: formatDuration(event.duration_minutes),
        inline: false,
      },
    );

  if (event.description) {
    embed.setDescription(event.description);
  }

  if (event.repeat_enabled || event.repeat_type === "weekly") {
    embed.addFields({
      name: "Repeat",
      value: `Every week (${event.repeat_timezone || "Europe/London"})`,
      inline: false,
    });
  }

  const responsesByOption = new Map();
  for (const option of options) {
    responsesByOption.set(option.id, []);
  }

  for (const response of responses) {
    const list = responsesByOption.get(response.option_id);
    if (list) list.push(response);
  }

  for (const option of options) {
    const optionResponses = responsesByOption.get(option.id) || [];
    const value = optionResponses.length
      ? optionResponses
          .map((response) => `<@${response.discord_user_id}>`)
          .join("\n")
          .slice(0, 1024)
      : "-";

    embed.addFields({
      name: `${option.emoji} ${option.label} (${optionResponses.length})`,
      value,
      inline: true,
    });
  }

  embed.setFooter({
    text:
      event.footer_text ||
      `Created by ${event.created_by_name || "101st Command"}`,
  });

  return embed;
}

async function renderAttendanceMessage(eventId) {
  if (!supabase) return;

  const { event, options, responses } = await getAttendanceEventBundle(eventId);
  if (!event.discord_message_id) return;

  const channel = await client.channels.fetch(event.channel_id).catch(() => null);
  if (!channel?.isTextBased()) return;

  const message = await channel.messages
    .fetch(event.discord_message_id)
    .catch(() => null);
  if (!message) return;

  await message.edit({
    embeds: [buildAttendanceEmbed(event, options, responses)],
    components: buildAttendanceComponents(options),
  });
}

async function sendAttendanceEvent(eventId) {
  const { event, options, responses } = await getAttendanceEventBundle(eventId);

  const channel = await client.channels.fetch(event.channel_id).catch(() => null);
  if (!channel?.isTextBased()) {
    throw new Error(`Attendance channel not found: ${event.channel_id}`);
  }

  const message = await channel.send({
    content: buildRolePingContent(event.ping_role_id),
    allowedMentions: buildAllowedRoleMentions(event.ping_role_id),
    embeds: [buildAttendanceEmbed(event, options, responses)],
    components: buildAttendanceComponents(options),
  });

  await supabase
    .from("discord_attendance_events")
    .update({
      discord_message_id: message.id,
      last_sent_at: new Date().toISOString(),
      status: "sent",
      failure_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", event.id);
}

async function processDueAttendanceReminders() {
  if (!supabase) return;

  const { data: dueReminders, error } = await supabase
    .from("discord_attendance_events")
    .select("*")
    .eq("status", "sent")
    .eq("reminder_enabled", true)
    .is("reminder_sent_at", null)
    .lte("reminder_scheduled_at", new Date().toISOString())
    .limit(10);

  if (error) {
    console.error("[attendance] Reminder poll failed:", error);
    return;
  }

  for (const event of dueReminders || []) {
    try {
      const channel = await client.channels.fetch(event.channel_id).catch(() => null);
      if (!channel?.isTextBased()) {
        throw new Error(`Reminder channel not found: ${event.channel_id}`);
      }

      const jumpLink =
        event.discord_message_id && guildId
          ? `https://discord.com/channels/${guildId}/${event.channel_id}/${event.discord_message_id}`
          : "";
      const reminderText = [event.reminder_message, jumpLink].filter(Boolean).join("\n");

      await channel.send({
        content: buildRolePingContent(event.reminder_role_id, reminderText),
        allowedMentions: buildAllowedRoleMentions(event.reminder_role_id),
      });

      await supabase
        .from("discord_attendance_events")
        .update({
          reminder_sent_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", event.id);
    } catch (error) {
      console.error("[attendance] Failed to send reminder:", event.id, error);
    }
  }
}

async function processDueAttendanceEvents() {
  if (!supabase || attendancePollRunning) return;

  attendancePollRunning = true;

  try {
    const { data: dueEvents, error } = await supabase
      .from("discord_attendance_events")
      .select("id")
      .eq("status", "scheduled")
      .lte("scheduled_send_at", new Date().toISOString())
      .order("scheduled_send_at", { ascending: true })
      .limit(10);

    if (error) throw error;

    for (const event of dueEvents || []) {
      try {
        await sendAttendanceEvent(event.id);
        console.log("[attendance] Sent attendance event:", event.id);
      } catch (error) {
        console.error("[attendance] Failed to send event:", event.id, error);
        await supabase
          .from("discord_attendance_events")
          .update({
            status: "failed",
            failure_reason: error.message || "Failed to send attendance event",
            updated_at: new Date().toISOString(),
          })
          .eq("id", event.id);
      }
    }

    await processDueAttendanceReminders();
    await cleanupEndedAttendanceEventRoles();
  } catch (error) {
    console.error("[attendance] Poll failed:", error);
  } finally {
    attendancePollRunning = false;
  }
}

async function findAttendanceEventByMessage(messageId) {
  const { data, error } = await supabase
    .from("discord_attendance_events")
    .select("id,status")
    .eq("discord_message_id", messageId)
    .in("status", ["sent"])
    .maybeSingle();

  if (error) {
    console.error("[attendance] Failed to find event by message:", error);
    return null;
  }

  return data;
}

async function getAttendanceOptionForReaction(eventId, reaction) {
  const { data: options, error } = await supabase
    .from("discord_attendance_options")
    .select("*")
    .eq("event_id", eventId)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[attendance] Failed to fetch options:", error);
    return null;
  }

  return (
    (options || []).find((option) => optionMatchesReaction(option, reaction)) ||
    null
  );
}

async function getAttendanceOptionById(eventId, optionId) {
  const { data: option, error } = await supabase
    .from("discord_attendance_options")
    .select("*")
    .eq("event_id", eventId)
    .eq("id", optionId)
    .maybeSingle();

  if (error) {
    console.error("[attendance] Failed to fetch option by id:", error);
    return null;
  }

  return option || null;
}

async function removeOtherAttendanceReactions(reaction, user, selectedOption) {
  const message = reaction.message;

  for (const existingReaction of message.reactions.cache.values()) {
    if (existingReaction === reaction) continue;
    if (optionMatchesReaction(selectedOption, existingReaction)) continue;

    await existingReaction.users.remove(user.id).catch(() => null);
  }
}

async function removeAttendanceRolesFromMember(member, exceptRoleId = "") {
  if (!member) return;

  const rolesToRemove = member.roles.cache.filter(
    (role) =>
      attendanceAssignableRoleIds.has(role.id) &&
      (!exceptRoleId || role.id !== exceptRoleId),
  );

  if (rolesToRemove.size > 0) {
    await member.roles.remove(rolesToRemove).catch((error) => {
      console.error("[attendance] Failed to remove old attendance roles:", error);
    });
  }
}

async function applyAttendanceOptionRole(reaction, user, option) {
  const roleId = cleanAttendanceAssignableRoleId(option.assign_role_id);
  const guild = reaction.message.guild;

  if (!guild) return;

  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) return;

  await removeAttendanceRolesFromMember(member, roleId);

  if (roleId && !member.roles.cache.has(roleId)) {
    await member.roles.add(roleId).catch((error) => {
      console.error("[attendance] Failed to add attendance role:", roleId, error);
    });
  }
}

async function applyAttendanceOptionRoleForInteraction(interaction, option) {
  const roleId = cleanAttendanceAssignableRoleId(option.assign_role_id);
  const guild = interaction.guild;

  if (!guild) return;

  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) return;

  await removeAttendanceRolesFromMember(member, roleId);

  if (roleId && !member.roles.cache.has(roleId)) {
    await member.roles.add(roleId).catch((error) => {
      console.error("[attendance] Failed to add attendance role:", roleId, error);
    });
  }
}

async function upsertAttendanceResponse(eventId, option, reaction, user) {
  const member = reaction.message.guild
    ? await reaction.message.guild.members.fetch(user.id).catch(() => null)
    : null;

  const displayName = sanitizeAttendanceName(
    member?.displayName || user.username || user.id,
  );
  const normalisedId = normaliseDiscordId(user.id);
  let personnelId = null;

  if (normalisedId) {
    const { data: person } = await supabase
      .from("personnel")
      .select("id")
      .eq("discord_id", normalisedId)
      .maybeSingle();

    personnelId = person?.id || null;
  }

  await supabase
    .from("discord_attendance_responses")
    .upsert(
      {
        event_id: eventId,
        option_id: option.id,
        discord_user_id: user.id,
        discord_display_name: displayName,
        personnel_id: personnelId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "event_id,discord_user_id" },
    );
}

async function upsertAttendanceInteractionResponse(eventId, option, interaction) {
  const member = interaction.guild
    ? await interaction.guild.members.fetch(interaction.user.id).catch(() => null)
    : null;

  const displayName = sanitizeAttendanceName(
    member?.displayName || interaction.user.username || interaction.user.id,
  );
  const normalisedId = normaliseDiscordId(interaction.user.id);
  let personnelId = null;

  if (normalisedId) {
    const { data: person } = await supabase
      .from("personnel")
      .select("id")
      .eq("discord_id", normalisedId)
      .maybeSingle();

    personnelId = person?.id || null;
  }

  await supabase
    .from("discord_attendance_responses")
    .upsert(
      {
        event_id: eventId,
        option_id: option.id,
        discord_user_id: interaction.user.id,
        discord_display_name: displayName,
        personnel_id: personnelId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "event_id,discord_user_id" },
    );
}

async function cleanupEndedAttendanceEventRoles() {
  if (!supabase) return;

  const { data: events, error } = await supabase
    .from("discord_attendance_events")
    .select("id,channel_id,event_starts_at,duration_minutes,scheduled_send_at,repeat_scheduled_send_at,repeat_enabled,repeat_type,reminder_enabled,reminder_scheduled_at")
    .eq("status", "sent")
    .is("roles_removed_at", null)
    .limit(20);

  if (error) {
    console.error("[attendance] Role cleanup poll failed:", error);
    return;
  }

  const now = Date.now();

  for (const event of events || []) {
    const endsAt =
      new Date(event.event_starts_at).getTime() +
      Number(event.duration_minutes || 0) * 60 * 1000;

    if (!Number.isFinite(endsAt) || endsAt > now) continue;

    try {
      const { data: responses, error: responseError } = await supabase
        .from("discord_attendance_responses")
        .select("discord_user_id")
        .eq("event_id", event.id);

      if (responseError) throw responseError;

      const channel = await client.channels.fetch(event.channel_id).catch(() => null);
      const guild = channel?.guild || (guildId ? await client.guilds.fetch(guildId).catch(() => null) : null);

      if (guild) {
        const uniqueUserIds = [...new Set((responses || []).map((row) => row.discord_user_id))];

        for (const userId of uniqueUserIds) {
          const member = await guild.members.fetch(userId).catch(() => null);
          await removeAttendanceRolesFromMember(member);
        }
      }

      if (event.repeat_enabled && event.repeat_type === "weekly") {
        const nextEventStartsAt = getNextWeeklyIso(event.event_starts_at);
        const nextScheduledSendAt = getNextWeeklyIso(
          event.repeat_scheduled_send_at || event.scheduled_send_at,
        );
        const nextReminderScheduledAt =
          event.reminder_enabled && event.reminder_scheduled_at
            ? getNextWeeklyIso(event.reminder_scheduled_at)
            : null;

        if (!nextEventStartsAt || !nextScheduledSendAt) {
          throw new Error("Could not calculate next weekly attendance dates");
        }

        await supabase
          .from("discord_attendance_responses")
          .delete()
          .eq("event_id", event.id);

        await supabase
          .from("discord_attendance_events")
          .update({
            event_starts_at: nextEventStartsAt,
            scheduled_send_at: nextScheduledSendAt,
            repeat_scheduled_send_at: nextScheduledSendAt,
            reminder_scheduled_at: nextReminderScheduledAt,
            reminder_sent_at: null,
            roles_removed_at: null,
            discord_message_id: null,
            status: "scheduled",
            failure_reason: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", event.id);

        console.log("[attendance] Rolled weekly event forward:", event.id);
        continue;
      }

      await supabase
        .from("discord_attendance_events")
        .update({
          roles_removed_at: new Date().toISOString(),
          status: "closed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", event.id);

      console.log("[attendance] Removed attendance roles for ended event:", event.id);
    } catch (error) {
      console.error("[attendance] Failed to cleanup event roles:", event.id, error);
    }
  }
}

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  websiteActionServer = app.listen(websiteActionPort, websiteActionHost, () => {
    console.log(
      `Website action listener running on ${websiteActionHost}:${websiteActionPort}`,
    );
    console.log(
      `Steam verification endpoint running on ${websiteActionHost}:${websiteActionPort}${steamVerificationPath}`,
    );
  });

  if (supabase) {
    await processDueAttendanceEvents();
    attendancePollTimer = setInterval(
      processDueAttendanceEvents,
      attendancePollIntervalMs,
    );
    console.log(
      `[attendance] Scheduler running every ${attendancePollIntervalMs}ms`,
    );
  } else {
    console.warn(
      "[attendance] Supabase client missing; attendance scheduler disabled.",
    );
  }

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
  try {
    if (interaction.isButton() && interaction.customId.startsWith("attendance:")) {
      if (!supabase) {
        await interaction.reply({
          content: "Attendance tracking is not available right now.",
          ephemeral: true,
        });
        return;
      }

      await interaction.deferUpdate();

      const [, eventId, optionId] = interaction.customId.split(":");
      const event = await findAttendanceEventByMessage(interaction.message.id);

      if (!event || event.id !== eventId) {
        await interaction.followUp({
          content: "This attendance message is no longer active.",
          ephemeral: true,
        });
        return;
      }

      const option = await getAttendanceOptionById(eventId, optionId);

      if (!option) {
        await interaction.followUp({
          content: "That attendance option is no longer available.",
          ephemeral: true,
        });
        return;
      }

      await upsertAttendanceInteractionResponse(eventId, option, interaction);
      await applyAttendanceOptionRoleForInteraction(interaction, option);
      await renderAttendanceMessage(eventId);
      return;
    }

    if (!interaction.isChatInputCommand()) return;

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
      content:
        "❌ This command can only be used in the main server.",
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  /*
   * Restrict the command to the server-control channel.
   */
  if (interaction.channelId !== serverControlChannelId) {
    await interaction.reply({
      content:
        `❌ Please use \`/server\` in ` +
        `<#${serverControlChannelId}>.`,
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  /*
   * Fetch the current member so their current roles are checked.
   */
  const member = await interaction.guild.members.fetch(
    interaction.user.id,
  );

  const hasRequiredRole = member.roles.cache.some((role) =>
    serverControlRoleIds.has(role.id),
  );

  if (!hasRequiredRole) {
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
              name: "Channel",
              value: `<#${interaction.channelId}>`,
              inline: true,
            },
            {
              name: "Required Roles",
              value:
                `<@&472444743222296586> or ` +
                `<@&1340561384437448828>`,
              inline: false,
            },
          )
          .setFooter({
            text: "Remote Arma server control",
          })
          .setTimestamp();

        await auditChannel.send({
          embeds: [unauthorizedEmbed],
          allowedMentions: {
            parse: [],
          },
        });
      }
    } catch (auditError) {
      console.error(
        "Failed to record unauthorized server-control attempt:",
        auditError,
      );
    }

    await interaction.reply({
      content:
        "❌ You do not have a role permitted to control the Arma servers.",
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand !== "start") {
    await interaction.reply({
      content: "❌ Invalid server action.",
      flags: MessageFlags.Ephemeral,
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
      flags: MessageFlags.Ephemeral,
    });

    return;
  }

  await interaction.deferReply({
    flags: MessageFlags.Ephemeral,
  });

  const startingEmbed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle(`🟠 Starting ${selectedServer.label}`)
    .setDescription(
      "The batch file is being executed and the bot is waiting for the matching Arma console window.",
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
        name: "Expected Console",
        value:
          `\`Arma 3 Console version * x64 : port ` +
          `${selectedServer.port}\``,
        inline: false,
      },
      {
        name: "Status",
        value: "Waiting for the Arma console…",
        inline: false,
      },
    )
    .setFooter({
      text: "This can take up to 90 seconds",
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

    const detectedTitle =
      result.windowTitle ||
      `Arma console detected on port ${selectedServer.port}`;

    const successEmbed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle(
        `🟢 ${selectedServer.label} Started Successfully`,
      )
      .setDescription(
        "The remote agent detected the matching Arma server console window.",
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
          name: "Detected Console",
          value: `\`${detectedTitle}\``,
          inline: false,
        },
        {
          name: "Status",
          value: "Running",
          inline: false,
        },
      )
      .setFooter({
        text: "The matching Arma console window was confirmed",
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
          .setTitle("🟢 Arma Server Started")
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
              name: "Detected Console",
              value: detectedTitle,
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
        "The matching Arma console window could not be confirmed.",
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
        text: "Check the Arma server and remote-agent console",
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

client.on("messageReactionAdd", async (reaction, user) => {
  try {
    if (!supabase || user.bot) return;

    if (reaction.partial) {
      reaction = await reaction.fetch();
    }

    if (reaction.message.partial) {
      await reaction.message.fetch();
    }

    const event = await findAttendanceEventByMessage(reaction.message.id);
    if (!event) return;

    const option = await getAttendanceOptionForReaction(event.id, reaction);
    if (!option) return;

    await upsertAttendanceResponse(event.id, option, reaction, user);
    await renderAttendanceMessage(event.id);
    await applyAttendanceOptionRole(reaction, user, option);
    await removeOtherAttendanceReactions(reaction, user, option);
    await renderAttendanceMessage(event.id);
  } catch (error) {
    console.error("[attendance] Reaction add failed:", error);
  }
});

client.on("messageReactionRemove", async (reaction, user) => {
  try {
    if (!supabase || user.bot) return;

    if (reaction.partial) {
      reaction = await reaction.fetch();
    }

    if (reaction.message.partial) {
      await reaction.message.fetch();
    }

    const event = await findAttendanceEventByMessage(reaction.message.id);
    if (!event) return;

    const option = await getAttendanceOptionForReaction(event.id, reaction);
    if (!option) return;

    const roleId = cleanAttendanceAssignableRoleId(option.assign_role_id);
    if (roleId && reaction.message.guild) {
      const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
      if (member?.roles.cache.has(roleId)) {
        await member.roles.remove(roleId).catch((error) => {
          console.error("[attendance] Failed to remove reaction role:", roleId, error);
        });
      }
    }

    await supabase
      .from("discord_attendance_responses")
      .delete()
      .eq("event_id", event.id)
      .eq("option_id", option.id)
      .eq("discord_user_id", user.id);

    await renderAttendanceMessage(event.id);
  } catch (error) {
    console.error("[attendance] Reaction remove failed:", error);
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

function shutdown(signal) {
  console.log(`[shutdown] Received ${signal}. Closing HTTP listener and Discord client.`);

  if (websiteActionServer) {
    websiteActionServer.close(() => {
      client.destroy();
      process.exit(0);
    });
    return;
  }

  client.destroy();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", console.error);
process.on("uncaughtException", console.error);

client.login(process.env.TOKEN);
