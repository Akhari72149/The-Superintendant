const assert = require("assert");
const crypto = require("crypto");
const {
  verifySteamRequestSignature,
  validateSteamVerificationPayload,
  deliverSteamVerificationDm,
  replayKeys,
  userRate,
  globalRate,
} = require("./steam-verification");

const secret = "unit-test-shared-secret";

function sign(timestamp, rawBody) {
  return crypto
    .createHmac("sha256", secret)
    .update(Buffer.concat([Buffer.from(`${timestamp}.`, "utf8"), rawBody]))
    .digest("hex");
}

function validPayload() {
  return {
    type: "steam_link_verification",
    discordUserId: "123456789012345678",
    code: "123456",
    expiresInSeconds: 600,
    personnel: {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Test Trooper",
    },
    steam: {
      id: "76561198000000000",
      displayName: "Steam Tester",
    },
  };
}

function resetState() {
  replayKeys.clear();
  userRate.clear();
  globalRate.length = 0;
}

async function run() {
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(JSON.stringify(validPayload()), "utf8");
  const signature = sign(now, body);

  resetState();
  assert.strictEqual(
    verifySteamRequestSignature({
      headers: {
        "x-101st-timestamp": String(now),
        "x-101st-signature": signature,
      },
      rawBody: body,
      secret,
      nowSeconds: now,
    }).ok,
    true,
    "valid HMAC should be accepted",
  );

  resetState();
  assert.strictEqual(
    verifySteamRequestSignature({
      headers: {
        "x-101st-timestamp": String(now),
        "x-101st-signature": "0".repeat(64),
      },
      rawBody: body,
      secret,
      nowSeconds: now,
    }).error,
    "INVALID_SIGNATURE",
    "invalid HMAC should be rejected",
  );

  resetState();
  assert.strictEqual(
    verifySteamRequestSignature({
      headers: {
        "x-101st-timestamp": String(now),
        "x-101st-signature": signature,
      },
      rawBody: Buffer.from(`${body.toString("utf8")} `, "utf8"),
      secret,
      nowSeconds: now,
    }).error,
    "INVALID_SIGNATURE",
    "modified raw body should be rejected",
  );

  resetState();
  assert.strictEqual(
    verifySteamRequestSignature({
      headers: {
        "x-101st-timestamp": String(now - 301),
        "x-101st-signature": sign(now - 301, body),
      },
      rawBody: body,
      secret,
      nowSeconds: now,
    }).error,
    "STALE_REQUEST",
    "stale timestamp should be rejected",
  );

  resetState();
  assert.strictEqual(
    verifySteamRequestSignature({
      headers: {
        "x-101st-timestamp": String(now + 31),
        "x-101st-signature": sign(now + 31, body),
      },
      rawBody: body,
      secret,
      nowSeconds: now,
    }).error,
    "STALE_REQUEST",
    "future timestamp should be rejected",
  );

  resetState();
  assert.strictEqual(
    verifySteamRequestSignature({
      headers: {
        "x-101st-timestamp": String(now),
        "x-101st-signature": signature,
      },
      rawBody: body,
      secret,
      nowSeconds: now,
    }).ok,
    true,
  );
  assert.strictEqual(
    verifySteamRequestSignature({
      headers: {
        "x-101st-timestamp": String(now),
        "x-101st-signature": signature,
      },
      rawBody: body,
      secret,
      nowSeconds: now,
    }).error,
    "REPLAYED_REQUEST",
    "duplicate signed request should be rejected",
  );

  assert.strictEqual(
    validateSteamVerificationPayload({
      ...validPayload(),
      code: "abc123",
    }),
    null,
    "invalid payload should be rejected",
  );
  assert.strictEqual(
    validateSteamVerificationPayload(validPayload()).code,
    "123456",
    "valid payload should be normalized",
  );

  const sentMessages = [];
  const successClient = {
    isReady: () => true,
    users: {
      fetch: async () => ({
        send: async (message) => {
          sentMessages.push(message);
        },
      }),
    },
  };
  class FakeEmbedBuilder {
    setColor() { return this; }
    setTitle() { return this; }
    setDescription() { return this; }
    addFields() { return this; }
    setFooter() { return this; }
    setTimestamp() { return this; }
  }

  assert.deepStrictEqual(
    await deliverSteamVerificationDm({
      client: successClient,
      EmbedBuilder: FakeEmbedBuilder,
      payload: validateSteamVerificationPayload(validPayload()),
    }),
    { ok: true },
    "DM success should be accepted",
  );
  assert.strictEqual(sentMessages.length, 1);

  const failureClient = {
    isReady: () => true,
    users: {
      fetch: async () => ({
        send: async () => {
          throw new Error("blocked");
        },
      }),
    },
  };
  assert.strictEqual(
    (
      await deliverSteamVerificationDm({
        client: failureClient,
        EmbedBuilder: FakeEmbedBuilder,
        payload: validateSteamVerificationPayload(validPayload()),
      })
    ).error,
    "DM_DELIVERY_FAILED",
    "DM failure should return a safe error",
  );

  const source = require("fs").readFileSync(
    require("path").join(__dirname, "steam-verification.js"),
    "utf8",
  );
  assert.strictEqual(
    /console\.(log|warn|error)\([^)]*payload\.code/s.test(source),
    false,
    "verification code should not be logged",
  );

  console.log("Steam verification self-tests passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
