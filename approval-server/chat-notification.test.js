"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { sendChatNotification } = require("./chat-notification");

function createHarness({
  preferences = {},
  devices = [{ id: "phone-1", token: "fcm-token" }],
  initialNotification = null,
  send = async () => "message-id",
} = {}) {
  let notification = initialNotification;
  const sentMessages = [];
  const deletedDevices = [];
  const accountRef = {
    get: async () => ({
      exists: true,
      data: () => ({ notificationPreferences: preferences }),
    }),
    collection(name) {
      if (name === "notifications") {
        return {
          doc() {
            return {
              get: async () => ({
                exists: notification !== null,
                data: () => notification,
              }),
              create: async (value) => {
                if (notification !== null) {
                  const error = new Error("Already exists.");
                  error.code = 6;
                  throw error;
                }
                notification = value;
              },
              update: async (value) => Object.assign(notification, value),
            };
          },
        };
      }
      return {
        get: async () => ({
          docs: devices.map((device) => ({
            ...device,
            data: () => ({ token: device.token }),
            ref: {
              delete: async () => deletedDevices.push(device.id),
            },
          })),
        }),
      };
    },
  };
  const db = {
    collection: () => ({ doc: () => accountRef }),
  };
  const messaging = {
    send: async (message) => {
      sentMessages.push(message);
      return send(message);
    },
  };

  return {
    db,
    messaging,
    notification: () => notification,
    sentMessages,
    deletedDevices,
  };
}

function send(harness, overrides = {}) {
  return sendChatNotification({
    db: harness.db,
    messaging: harness.messaging,
    fieldValue: { serverTimestamp: () => "server-time" },
    logger: { error: () => {} },
    borrowerUid: "borrower-1",
    notificationId: "chat-message-1",
    type: "admin_chat_reply",
    title: "New admin reply",
    message: "Please return the item.",
    ...overrides,
  });
}

test("sends the phone push immediately and marks the shared notification sent", async () => {
  const harness = createHarness();

  const result = await send(harness);

  assert.equal(result.pushStatus, "sent");
  assert.equal(harness.sentMessages.length, 1);
  assert.deepEqual(harness.sentMessages[0], {
    token: "fcm-token",
    notification: {
      title: "New admin reply",
      body: "Please return the item.",
    },
    data: {
      notificationId: "chat-message-1",
      type: "admin_chat_reply",
      loanId: "",
    },
    android: {
      priority: "high",
      notification: { channelId: "lendy_alerts" },
    },
  });
  assert.equal(harness.notification().pushStatus, "sent");
  assert.equal(harness.notification().pushSent, true);
  assert.equal(harness.notification().timestamp, "server-time");
});

test("supports immediate Fabii reply pushes", async () => {
  const harness = createHarness();

  const result = await send(harness, {
    notificationId: "assistant-reply-1",
    type: "assistant_reply",
    title: "Fabii replied",
    message: "Fabii has replied to your chat.",
  });

  assert.equal(result.pushStatus, "sent");
  assert.equal(harness.sentMessages[0].data.type, "assistant_reply");
  assert.equal(harness.notification().type, "assistant_reply");
});

test("keeps the notification pending for Apps Script retry when direct FCM fails", async () => {
  const harness = createHarness({
    send: async () => {
      const error = new Error("FCM is unavailable.");
      error.code = "messaging/internal-error";
      throw error;
    },
  });
  const result = await send(harness);
  assert.equal(result.pushStatus, "pending");
  assert.equal(harness.notification().pushStatus, "pending");
  assert.equal(harness.notification().deliverySource, "apps_script");
});

test("does not send a phone push when the user has disabled push notifications", async () => {
  const harness = createHarness({
    preferences: { pushNotificationsEnabled: false },
  });

  const result = await send(harness);

  assert.equal(result.pushStatus, "disabled");
  assert.equal(harness.sentMessages.length, 0);
  assert.equal(harness.notification().pushStatus, "disabled");
});

test("does not resend an already delivered chat notification", async () => {
  const harness = createHarness({
    initialNotification: { pushSent: true, pushStatus: "sent" },
  });

  const result = await send(harness);

  assert.equal(result.pushStatus, "sent");
  assert.equal(harness.sentMessages.length, 0);
});
