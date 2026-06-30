const crypto = require("crypto");
const express = require("express");

const DEFAULT_PATH = "/api/steam-verification";
const MAX_BODY_BYTES = 16 * 1024;
const MAX_TIMESTAMP_AGE_SECONDS = 300;
const MAX_FUTURE_SECONDS = 30;
const REPLAY_WINDOW_MS = 5 * 60 * 1000;
const USER_RATE_WINDOW_MS = 10 * 60 * 1000;
const USER_RATE_LIMIT = 5;
const GLOBAL_RATE_WINDOW_MS = 60 * 1000;
const GLOBAL_RATE_LIMIT = 100;

const replayKeys = new Map();
const userRate = new Map();
const globalRate = [];

function jsonResponse(res, status, body) {
  return res
    .status(status)
    .set({
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    })
    .json(body);
}

function maskDiscordId(id) {
  const value = String(id || "");
  if (value.length <= 8) return "masked";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function isHexSignature(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function timingSafeStringEqual(left, right) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function cleanupReplayKeys(now = Date.now()) {
  for (const [key, expiresAt] of replayKeys.entries()) {
    if (expiresAt <= now) replayKeys.delete(key);
  }
}

function cleanupRateLimits(now = Date.now()) {
  while (globalRate.length > 0 && globalRate[0] <= now - GLOBAL_RATE_WINDOW_MS) {
    globalRate.shift();
  }

  for (const [discordUserId, timestamps] of userRate.entries()) {
    const fresh = timestamps.filter((time) => time > now - USER_RATE_WINDOW_MS);
    if (fresh.length === 0) userRate.delete(discordUserId);
    else userRate.set(discordUserId, fresh);
  }
}

function verifySteamRequestSignature({ headers, rawBody, secret, nowSeconds }) {
  const timestampHeader = headers["x-101st-timestamp"];
  const signature = headers["x-101st-signature"];

  if (!timestampHeader || !/^\d+$/.test(String(timestampHeader))) {
    return { ok: false, status: 400, error: "INVALID_TIMESTAMP" };
  }

  const timestamp = Number(timestampHeader);
  if (!Number.isSafeInteger(timestamp)) {
    return { ok: false, status: 400, error: "INVALID_TIMESTAMP" };
  }

  if (timestamp < nowSeconds - MAX_TIMESTAMP_AGE_SECONDS) {
    return { ok: false, status: 400, error: "STALE_REQUEST" };
  }

  if (timestamp > nowSeconds + MAX_FUTURE_SECONDS) {
    return { ok: false, status: 400, error: "STALE_REQUEST" };
  }

  if (!isHexSignature(signature)) {
    return { ok: false, status: 401, error: "INVALID_SIGNATURE" };
  }

  const hmacInput = Buffer.concat([
    Buffer.from(`${timestamp}.`, "utf8"),
    rawBody,
  ]);
  const expected = crypto
    .createHmac("sha256", secret)
    .update(hmacInput)
    .digest("hex");

  if (!timingSafeStringEqual(signature, expected)) {
    return { ok: false, status: 401, error: "INVALID_SIGNATURE" };
  }

  const replayKey = crypto
    .createHash("sha256")
    .update(`${timestamp}.${signature}`)
    .digest("hex");

  cleanupReplayKeys();

  if (replayKeys.has(replayKey)) {
    return { ok: false, status: 409, error: "REPLAYED_REQUEST" };
  }

  replayKeys.set(replayKey, Date.now() + REPLAY_WINDOW_MS);

  return { ok: true };
}

function validateSteamVerificationPayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  if (payload.type !== "steam_link_verification") return null;
  if (!/^\d{17,20}$/.test(String(payload.discordUserId || ""))) return null;
  if (!/^\d{6}$/.test(String(payload.code || ""))) return null;
  if (
    !Number.isInteger(payload.expiresInSeconds) ||
    payload.expiresInSeconds < 60 ||
    payload.expiresInSeconds > 1800
  ) {
    return null;
  }

  const personnel = payload.personnel;
  const steam = payload.steam;

  if (!personnel || typeof personnel !== "object") return null;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      String(personnel.id || ""),
    )
  ) {
    return null;
  }
  if (typeof personnel.name !== "string" || personnel.name.trim().length === 0) {
    return null;
  }
  if (personnel.name.length > 120) return null;

  if (!steam || typeof steam !== "object") return null;
  if (!/^\d{17}$/.test(String(steam.id || ""))) return null;
  if (
    steam.displayName !== null &&
    steam.displayName !== undefined &&
    (typeof steam.displayName !== "string" || steam.displayName.length > 120)
  ) {
    return null;
  }

  return {
    type: "steam_link_verification",
    discordUserId: String(payload.discordUserId),
    code: String(payload.code),
    expiresInSeconds: payload.expiresInSeconds,
    personnel: {
      id: String(personnel.id),
      name: personnel.name.trim(),
    },
    steam: {
      id: String(steam.id),
      displayName:
        typeof steam.displayName === "string" && steam.displayName.trim()
          ? steam.displayName.trim()
          : null,
    },
  };
}

function checkRateLimit(discordUserId, now = Date.now()) {
  cleanupRateLimits(now);

  if (globalRate.length >= GLOBAL_RATE_LIMIT) {
    return false;
  }

  const userTimestamps = userRate.get(discordUserId) || [];
  if (userTimestamps.length >= USER_RATE_LIMIT) {
    return false;
  }

  globalRate.push(now);
  userTimestamps.push(now);
  userRate.set(discordUserId, userTimestamps);
  return true;
}

function buildVerificationEmbed(payload, EmbedBuilder) {
  const minutes = Math.ceil(payload.expiresInSeconds / 60);
  const steamName = payload.steam.displayName || "Steam User";

  return new EmbedBuilder()
    .setColor(0x00ff66)
    .setTitle("101st Doom Battalion - Steam Account Verification")
    .setDescription(
      "A request was made to link a Steam account to your personnel record.",
    )
    .addFields(
      { name: "Personnel", value: payload.personnel.name, inline: false },
      { name: "Steam", value: steamName, inline: true },
      { name: "Steam ID", value: payload.steam.id, inline: true },
      { name: "Verification code", value: `\`${payload.code}\``, inline: false },
      {
        name: "Expires",
        value: `This code expires in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
        inline: false,
      },
      {
        name: "Security",
        value:
          "Only enter this code on the official 101st Doom Battalion website. If you did not request this link, ignore this message and notify staff.",
        inline: false,
      },
    )
    .setFooter({ text: "101st Doom Battalion Personnel Command System" })
    .setTimestamp();
}

async function deliverSteamVerificationDm({ client, EmbedBuilder, payload }) {
  if (!client.isReady || !client.isReady()) {
    return { ok: false, status: 503, error: "BOT_NOT_READY" };
  }

  let user;

  try {
    user = await client.users.fetch(payload.discordUserId, { force: true });
  } catch {
    return { ok: false, status: 404, error: "DISCORD_USER_NOT_FOUND" };
  }

  if (!user) {
    return { ok: false, status: 404, error: "DISCORD_USER_NOT_FOUND" };
  }

  try {
    await user.send({
      embeds: [buildVerificationEmbed(payload, EmbedBuilder)],
    });
  } catch {
    return { ok: false, status: 502, error: "DM_DELIVERY_FAILED" };
  }

  return { ok: true };
}

function registerSteamVerificationRoutes({ app, client, EmbedBuilder }) {
  const path = process.env.STEAM_VERIFICATION_PATH || DEFAULT_PATH;

  app.get("/health", (req, res) =>
    jsonResponse(res, 200, {
      ok: true,
      discordReady: Boolean(client.isReady && client.isReady()),
    }),
  );

  app.post(
    path,
    express.raw({
      type: "application/json",
      limit: MAX_BODY_BYTES,
    }),
    async (req, res) => {
      console.log("[steam-verification] Request received.");

      const secret = process.env.DISCORD_BOT_SHARED_SECRET;

      if (!secret) {
        console.error("[steam-verification] DISCORD_BOT_SHARED_SECRET is missing.");
        return jsonResponse(res, 500, {
          accepted: false,
          error: "INTERNAL_ERROR",
        });
      }

      if (!Buffer.isBuffer(req.body)) {
        return jsonResponse(res, 400, {
          accepted: false,
          error: "INVALID_PAYLOAD",
        });
      }

      const signatureResult = verifySteamRequestSignature({
        headers: req.headers,
        rawBody: req.body,
        secret,
        nowSeconds: Math.floor(Date.now() / 1000),
      });

      if (!signatureResult.ok) {
        console.warn(
          `[steam-verification] Signature rejected: ${signatureResult.error}`,
        );
        return jsonResponse(res, signatureResult.status, {
          accepted: false,
          error: signatureResult.error,
        });
      }

      console.log("[steam-verification] Signature accepted.");

      let parsed;

      try {
        parsed = JSON.parse(req.body.toString("utf8"));
      } catch {
        return jsonResponse(res, 400, {
          accepted: false,
          error: "INVALID_PAYLOAD",
        });
      }

      const payload = validateSteamVerificationPayload(parsed);

      if (!payload) {
        return jsonResponse(res, 400, {
          accepted: false,
          error: "INVALID_PAYLOAD",
        });
      }

      if (!checkRateLimit(payload.discordUserId)) {
        console.warn(
          `[steam-verification] Rate limited user ${maskDiscordId(payload.discordUserId)}.`,
        );
        return jsonResponse(res, 429, {
          accepted: false,
          error: "RATE_LIMITED",
        });
      }

      const delivery = await deliverSteamVerificationDm({
        client,
        EmbedBuilder,
        payload,
      });

      if (!delivery.ok) {
        console.warn(
          `[steam-verification] Delivery failed: ${delivery.error} personnel=${payload.personnel.id} user=${maskDiscordId(payload.discordUserId)}`,
        );
        return jsonResponse(res, delivery.status, {
          accepted: false,
          error: delivery.error,
        });
      }

      console.log(
        `[steam-verification] Delivery accepted personnel=${payload.personnel.id} user=${maskDiscordId(payload.discordUserId)}.`,
      );

      return jsonResponse(res, 200, { accepted: true });
    },
  );

  app.all(path, (req, res) =>
    jsonResponse(res, 405, {
      accepted: false,
      error: "METHOD_NOT_ALLOWED",
    }),
  );

  app.use((error, req, res, next) => {
    if (req.path === path && error?.type === "entity.too.large") {
      return jsonResponse(res, 413, {
        accepted: false,
        error: "PAYLOAD_TOO_LARGE",
      });
    }

    return next(error);
  });
}

module.exports = {
  registerSteamVerificationRoutes,
  verifySteamRequestSignature,
  validateSteamVerificationPayload,
  checkRateLimit,
  deliverSteamVerificationDm,
  replayKeys,
  userRate,
  globalRate,
};
