"use strict";

const assert = require("node:assert/strict");
const { createCipheriv, createHash, randomBytes } = require("node:crypto");
const test = require("node:test");
const { openAccountCredentials, reconcileMemberRoles } = require("./discord-outbox-worker");

function seal(value, secret) {
  const iv = randomBytes(12);
  const key = createHash("sha256").update(secret).digest();
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return {
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
  };
}

test("opens website-sealed account credentials", () => {
  const secret = "shared-secret-value-that-is-longer-than-32-characters";
  const expected = {
    username: "Six-Ten",
    temporaryPassword: "temporary-password-value",
    loginUrl: "https://101stdoombattalion.com/login",
  };
  assert.deepEqual(openAccountCredentials(seal(expected, secret), secret), expected);
});

test("rejects account credentials opened with the wrong secret", () => {
  const sealed = seal({
    username: "Advisor",
    temporaryPassword: "temporary-password-value",
    loginUrl: "https://101stdoombattalion.com/login",
  }, "correct-secret-value-that-is-longer-than-32-characters");
  assert.throws(
    () => openAccountCredentials(sealed, "incorrect-secret-value-that-is-longer-than-32-characters"),
  );
});

test("role reconciliation preserves shared roles and applies only required changes", async () => {
  const removed = [];
  const added = [];
  const member = {
    roles: {
      cache: new Map([
        ["11111111111111111", {}],
        ["22222222222222222", {}],
      ]),
      remove: async (roleIds) => removed.push(...roleIds),
      add: async (roleIds) => added.push(...roleIds),
    },
  };

  await reconcileMemberRoles(
    member,
    ["22222222222222222", "33333333333333333"],
    ["11111111111111111", "22222222222222222"],
  );

  assert.deepEqual(removed, ["11111111111111111"]);
  assert.deepEqual(added, ["33333333333333333"]);
});

test("user initialization assigns only the supplied current rank", async () => {
  const requests = [];
  const added = [];
  const removed = [];
  const recruitRoleId = "446025365496922142";
  const currentRankRoleId = "555555555555555555";
  const member = {
    roles: {
      cache: new Map([[recruitRoleId, {}]]),
      add: async (roleIds) => added.push(...(Array.isArray(roleIds) ? roleIds : [roleIds])),
      remove: async (roleIds) => removed.push(...(Array.isArray(roleIds) ? roleIds : [roleIds])),
      set: async () => {},
    },
  };
  const worker = require("./discord-outbox-worker").createDiscordOutboxWorker({
    client: { guilds: { fetch: async () => ({ members: { fetch: async () => member } }) } },
    endpoint: "https://example.test/api/internal/discord-outbox",
    secret: "shared-secret-value-that-is-longer-than-32-characters",
    guildId: "333333333333333333",
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      requests.push(body);
      return {
        ok: true,
        json: async () => body.action === "claim" ? { events: [{
          id: "11111111-1111-4111-8111-111111111111",
          eventType: "USER_ROLE_INIT",
          payload: {
            discordId: "444444444444444444",
            rankRoleId: currentRankRoleId,
            rankRoleIds: [recruitRoleId, currentRankRoleId],
            reconcileRank: true,
          },
          attemptCount: 1,
        }] } : { completed: true },
      };
    },
    logger: { log() {}, error() {} },
  });

  await worker.poll();

  assert.deepEqual(removed, [recruitRoleId]);
  assert.ok(added.includes(currentRankRoleId));
  assert.ok(!added.includes(recruitRoleId));
  assert.equal(requests[1].action, "complete");
});

test("worker resumes polling after a transient website failure", async () => {
  const requests = [];
  const errors = [];
  let claimAttempts = 0;
  const worker = require("./discord-outbox-worker").createDiscordOutboxWorker({
    client: {
      guilds: {
        fetch: async () => ({
          members: {
            fetch: async () => ({
              roles: {
                cache: new Map(),
                add: async () => {},
                remove: async () => {},
                set: async () => {},
              },
            }),
          },
        }),
      },
    },
    endpoint: "https://example.test/api/internal/discord-outbox",
    secret: "shared-secret-value-that-is-longer-than-32-characters",
    guildId: "333333333333333333",
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      requests.push(body);
      if (body.action === "claim" && claimAttempts++ === 0) {
        throw new Error("temporary website failure");
      }
      return {
        ok: true,
        json: async () => body.action === "claim" ? { events: [{
          id: "11111111-1111-4111-8111-111111111111",
          eventType: "RANK_ROLE_SYNC",
          payload: {
            discordId: "444444444444444444",
            oldRoleId: null,
            newRoleId: "555555555555555555",
          },
          attemptCount: 1,
        }] } : { completed: true },
      };
    },
    logger: { log() {}, error: (...args) => errors.push(args) },
  });

  await worker.poll();
  await worker.poll();

  assert.equal(errors.length, 1);
  assert.equal(requests.filter((request) => request.action === "claim").length, 2);
  assert.equal(requests.at(-1).action, "complete");
});

test("Discord import returns the member's current role IDs to the website", async () => {
  const requests = [];
  const worker = require("./discord-outbox-worker").createDiscordOutboxWorker({
    client: {
      guilds: {
        fetch: async () => ({
          members: {
            fetch: async () => ({
              roles: {
                cache: new Map([
                  ["11111111111111111", {}],
                  ["22222222222222222", {}],
                ]),
              },
            }),
          },
        }),
      },
    },
    endpoint: "https://example.test/api/internal/discord-outbox",
    secret: "shared-secret-value-that-is-longer-than-32-characters",
    guildId: "33333333333333333",
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      requests.push(body);
      const response = body.action === "claim"
        ? { events: [{
          id: "11111111-1111-4111-8111-111111111111",
          eventType: "USER_FULL_IMPORT",
          payload: { discordId: "44444444444444444" },
          attemptCount: 1,
        }] }
        : { completed: true };
      return { ok: true, json: async () => response };
    },
    logger: { log() {}, error() {} },
  });

  await worker.poll();

  assert.deepEqual(requests[1], {
    action: "complete",
    worker: `discord-bot-${process.pid}`,
    eventId: "11111111-1111-4111-8111-111111111111",
    result: {
      discordRoleIds: ["11111111111111111", "22222222222222222"],
    },
  });
});

test("missing members complete personnel status cleanup as a no-op", async () => {
  const requests = [];
  const unknownMember = Object.assign(new Error("Unknown Member"), { code: 10007 });
  const worker = require("./discord-outbox-worker").createDiscordOutboxWorker({
    client: {
      guilds: {
        fetch: async () => ({ members: { fetch: async () => { throw unknownMember; } } }),
      },
    },
    endpoint: "https://example.test/api/internal/discord-outbox",
    secret: "shared-secret-value-that-is-longer-than-32-characters",
    guildId: "33333333333333333",
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      requests.push(body);
      return {
        ok: true,
        json: async () => body.action === "claim" ? { events: [{
          id: "11111111-1111-4111-8111-111111111111",
          eventType: "PERSONNEL_STATUS_SYNC",
          payload: { discordId: "44444444444444444", status: "removed" },
          attemptCount: 1,
        }] } : { completed: true },
      };
    },
    logger: { log() {}, error() {} },
  });

  await worker.poll();

  assert.equal(requests[1].action, "complete");
  assert.deepEqual(requests[1].result, { skipped: "unknown-member" });
});

test("missing members remain failures for rank role sync", async () => {
  const requests = [];
  const unknownMember = Object.assign(new Error("Unknown Member"), { code: 10007 });
  const worker = require("./discord-outbox-worker").createDiscordOutboxWorker({
    client: {
      guilds: {
        fetch: async () => ({ members: { fetch: async () => { throw unknownMember; } } }),
      },
    },
    endpoint: "https://example.test/api/internal/discord-outbox",
    secret: "shared-secret-value-that-is-longer-than-32-characters",
    guildId: "33333333333333333",
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      requests.push(body);
      return {
        ok: true,
        json: async () => body.action === "claim" ? { events: [{
          id: "11111111-1111-4111-8111-111111111111",
          eventType: "RANK_ROLE_SYNC",
          payload: { discordId: "44444444444444444", newRoleId: "55555555555555555" },
          attemptCount: 1,
        }] } : { failed: true },
      };
    },
    logger: { log() {}, error() {} },
  });

  await worker.poll();

  assert.equal(requests[1].action, "fail");
  assert.equal(requests[1].error, "Unknown Member");
});

test("promotion readiness pings leadership in the promotion log", async () => {
  const requests = [];
  const messages = [];
  const worker = require("./discord-outbox-worker").createDiscordOutboxWorker({
    client: {
      channels: { fetch: async () => ({ send: async (message) => messages.push(message) }) },
    },
    endpoint: "https://example.test/api/internal/discord-outbox",
    secret: "shared-secret-value-that-is-longer-than-32-characters",
    guildId: "33333333333333333",
    promotionLogChannelId: "66666666666666666",
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      requests.push(body);
      return {
        ok: true,
        json: async () => body.action === "claim" ? { events: [{
          id: "11111111-1111-4111-8111-111111111111",
          eventType: "PROMOTION_READY",
          payload: {
            discordId: "44444444444444444",
            personnelName: "Example",
            oldRankName: "CT",
            rankName: "PTC",
            tigDays: 120,
            attendancePercentage: 72.7,
            companyApprovalRequired: true,
            leadershipDiscordIds: ["77777777777777777", "88888888888888888"],
            leadershipRoleIds: ["813525376906821642"],
          },
          attemptCount: 1,
        }] } : { completed: true },
      };
    },
    logger: { log() {}, error() {} },
  });

  await worker.poll();

  assert.equal(messages[0].content, "<@77777777777777777> <@88888888888888888> <@&813525376906821642>");
  assert.deepEqual(messages[0].allowedMentions, {
    users: ["77777777777777777", "88888888888888888"],
    roles: ["813525376906821642"],
  });
  assert.match(messages[0].embeds[0].description, /ready to be promoted from \*\*CT\*\* to \*\*PTC\*\*/);
  assert.deepEqual(
    messages[0].embeds[0].fields.find((field) => field.name === "TIG"),
    { name: "TIG", value: "120 days", inline: true },
  );
  assert.deepEqual(messages[0].embeds[0].fields.slice(-2), [
    { name: "MainOp Attendance", value: "72.7%", inline: true },
    {
      name: "Company Approval Required",
      value: "Company approval is required before this promotion can be completed.",
      inline: false,
    },
  ]);
  assert.equal(requests[1].action, "complete");
});
