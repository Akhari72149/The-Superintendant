"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createAttendanceApiClient } = require("./attendance-api-client");

test("attendance API client sends authenticated action payloads", async () => {
  let captured;
  const client = createAttendanceApiClient({
    endpoint: "https://example.test/api/internal/discord-attendance",
    secret: "a".repeat(32),
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return new Response(JSON.stringify({ events: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  const result = await client.claimEvents();
  assert.deepEqual(result, { events: [] });
  assert.equal(captured.url, "https://example.test/api/internal/discord-attendance");
  assert.equal(captured.options.headers.Authorization, `Bearer ${"a".repeat(32)}`);
  assert.deepEqual(JSON.parse(captured.options.body), { action: "claim-events" });
});

test("attendance API client surfaces server errors", async () => {
  const client = createAttendanceApiClient({
    endpoint: "https://example.test/api/internal/discord-attendance",
    secret: "b".repeat(32),
    fetchImpl: async () => new Response(JSON.stringify({ error: "CONFLICT" }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    }),
  });

  await assert.rejects(() => client.close("00000000-0000-4000-8000-000000000000"), /CONFLICT/);
});

test("attendance API client claims an explicit resend", async () => {
  let payload;
  const eventId = "00000000-0000-4000-8000-000000000000";
  const client = createAttendanceApiClient({
    endpoint: "https://example.test/api/internal/discord-attendance",
    secret: "c".repeat(32),
    fetchImpl: async (_url, options) => {
      payload = JSON.parse(options.body);
      return new Response(JSON.stringify({ claimed: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  assert.deepEqual(await client.claimResend(eventId), { claimed: true });
  assert.deepEqual(payload, { action: "claim-resend", eventId });
});
