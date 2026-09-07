"use strict";

const assert = require("node:assert/strict");
const { createCipheriv, createHash, randomBytes } = require("node:crypto");
const test = require("node:test");
const { openAccountCredentials } = require("./discord-outbox-worker");

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
