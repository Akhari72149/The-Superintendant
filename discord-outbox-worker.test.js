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
