"use strict";

function createAttendanceApiClient({ endpoint, secret, fetchImpl = fetch }) {
  if (!endpoint || !secret) throw new Error("Attendance API configuration is incomplete");

  async function request(action, payload = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action, ...payload }),
        signal: controller.signal,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `Attendance API returned HTTP ${response.status}`);
      return result;
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    bundle: (eventId) => request("bundle", { eventId }),
    claimEvents: () => request("claim-events"),
    eventSent: (eventId, messageId) => request("event-sent", { eventId, messageId }),
    eventFailed: (eventId, error) => request("event-failed", { eventId, error }),
    claimResend: (eventId) => request("claim-resend", { eventId }),
    claimReminders: () => request("claim-reminders"),
    reminderSent: (eventId) => request("reminder-sent", { eventId }),
    releaseReminder: (eventId) => request("release-reminder", { eventId }),
    claimCleanup: () => request("claim-cleanup"),
    rollWeekly: (eventId, eventStartsAt, scheduledSendAt, reminderScheduledAt) => request("roll-weekly", { eventId, eventStartsAt, scheduledSendAt, reminderScheduledAt }),
    close: (eventId) => request("close", { eventId }),
    releaseCleanup: (eventId) => request("release-cleanup", { eventId }),
    findMessage: (messageId) => request("find-message", { messageId }),
    option: (eventId, optionId) => request("option", { eventId, optionId }),
    personnel: (discordUserId) => request("personnel", { discordUserId }),
    upsertResponse: (payload) => request("upsert-response", payload),
    deleteResponse: (eventId, optionId, discordUserId) => request("delete-response", { eventId, optionId, discordUserId }),
  };
}

module.exports = { createAttendanceApiClient };
