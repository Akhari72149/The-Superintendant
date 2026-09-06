"use strict";

const DISCORD_ID_PATTERN = /^\d{17,20}$/;
const USER_INIT_ROLES = Object.freeze([
  "446025365496922142",
  "848579852712804383",
  "848594325695758407",
  "848607945825845309",
  "833549617105993820",
  "446542700951633923",
  "848580245799436298",
  "848580118849781790",
  "763191706249986078",
  "933083212735987722",
]);
const NO_ROLES_TAG_ID = "492653693091577856";
const RETIRED_TAG_ID = "586776577707081739";

function requireDiscordId(value, field) {
  const id = String(value || "");
  if (!DISCORD_ID_PATTERN.test(id)) {
    throw new Error(`Invalid ${field}`);
  }
  return id;
}

function safeError(error) {
  return String(error?.message || "Discord role update failed")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 500);
}

function createDiscordOutboxWorker({
  client,
  endpoint,
  secret,
  guildId,
  intervalMs = 10000,
  workerId = `discord-bot-${process.pid}`,
  fetchImpl = fetch,
  logger = console,
}) {
  if (!client || !endpoint || !secret || !guildId) {
    throw new Error("Discord outbox worker configuration is incomplete");
  }

  let timer = null;
  let running = false;

  async function request(body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(`Outbox API returned HTTP ${response.status}`);
      }
      return result;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function applyEvent(event) {
    const payload = event?.payload;
    if (!payload || typeof payload !== "object") {
      throw new Error("Outbox payload is invalid");
    }

    const discordId = requireDiscordId(payload.discordId, "discordId");
    const guild = await client.guilds.fetch(guildId);
    const member = await guild.members.fetch(discordId);

    if (event.eventType === "CERT_ROLE_SYNC") {
      const roleId = requireDiscordId(payload.roleId, "roleId");
      if (payload.action === "assign") {
        if (!member.roles.cache.has(roleId)) await member.roles.add(roleId);
      } else if (payload.action === "revoke") {
        if (member.roles.cache.has(roleId)) await member.roles.remove(roleId);
      } else {
        throw new Error("Invalid certificate role action");
      }
      return;
    }

    if (event.eventType === "USER_ROLE_INIT") {
      if (member.roles.cache.has(NO_ROLES_TAG_ID)) {
        await member.roles.remove(NO_ROLES_TAG_ID);
      }
      const missing = USER_INIT_ROLES.filter((roleId) => !member.roles.cache.has(roleId));
      if (missing.length) await member.roles.add(missing);
      return;
    }

    if (event.eventType === "PERSONNEL_STATUS_SYNC") {
      const status = String(payload.status || "").toLowerCase();
      if (status !== "removed" && status !== "retired") {
        throw new Error("Invalid personnel status");
      }
      const targetRoleId = status === "retired" ? RETIRED_TAG_ID : NO_ROLES_TAG_ID;
      await member.roles.set([targetRoleId]);
      return;
    }

    throw new Error("Unsupported outbox event type");
  }

  async function processEvent(event) {
    try {
      await applyEvent(event);
      await request({
        action: "complete",
        worker: workerId,
        eventId: event.id,
      });
      logger.log("[discord-outbox] Completed", {
        id: event.id,
        eventType: event.eventType,
        attempt: event.attemptCount,
      });
    } catch (error) {
      const message = safeError(error);
      logger.error("[discord-outbox] Failed", {
        id: event?.id,
        eventType: event?.eventType,
        message,
      });
      if (event?.id) {
        await request({
          action: "fail",
          worker: workerId,
          eventId: event.id,
          error: message,
        }).catch((reportError) => {
          logger.error("[discord-outbox] Failed to report event failure", safeError(reportError));
        });
      }
    }
  }

  async function poll() {
    if (running) return;
    running = true;
    try {
      const result = await request({ action: "claim", worker: workerId, limit: 5 });
      for (const event of Array.isArray(result.events) ? result.events : []) {
        await processEvent(event);
      }
    } catch (error) {
      logger.error("[discord-outbox] Poll failed", safeError(error));
    } finally {
      running = false;
    }
  }

  return {
    start() {
      if (timer) return;
      void poll();
      timer = setInterval(poll, Math.max(5000, Number(intervalMs) || 10000));
      timer.unref?.();
      logger.log(`[discord-outbox] Worker started; polling every ${Math.max(5000, Number(intervalMs) || 10000)}ms`);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    poll,
  };
}

module.exports = {
  createDiscordOutboxWorker,
};

