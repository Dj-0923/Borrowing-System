"use strict";

const CHAT_NOTIFICATION_TYPES = new Set([
  "admin_chat_reply",
  "assistant_reply",
]);
const LOAN_NOTIFICATION_PREFERENCES = {
  approved: "requestUpdatesEnabled",
  rejected: "requestUpdatesEnabled",
  returned: "returnRemindersEnabled",
  return_rejected: "returnRemindersEnabled",
};

async function sendBorrowerNotification({
  db,
  messaging,
  fieldValue,
  borrowerUid,
  notificationId,
  type,
  title,
  message,
  loanId = "",
  preferenceKey,
  logger = console,
}) {
  const accountRef = db.collection("accounts").doc(borrowerUid);
  const accountSnapshot = await accountRef.get();
  if (!accountSnapshot.exists) {
    return { pushStatus: "missing-account" };
  }

  const preferences = accountSnapshot.data().notificationPreferences || {};
  if (preferenceKey !== "pushNotificationsEnabled" &&
      preferenceKey && preferences[preferenceKey] === false) {
    return { pushStatus: "disabled" };
  }
  const pushEnabled = preferences.pushNotificationsEnabled !== false;
  const notificationRef = accountRef
    .collection("notifications")
    .doc(notificationId);
  let notificationSnapshot = await notificationRef.get();

  if (!notificationSnapshot.exists) {
    try {
      await notificationRef.create({
        id: notificationId,
        loanId,
        type,
        preferenceKey,
        title,
        message: String(message || "").slice(0, 300),
        isRead: false,
        pushSent: false,
        pushStatus: pushEnabled ? "pending" : "disabled",
        deliverySource: "apps_script",
        timestamp: fieldValue.serverTimestamp(),
      });
    } catch (error) {
      if (error.code !== 6 && error.code !== "already-exists") throw error;
    }
    notificationSnapshot = await notificationRef.get();
  } else if (!pushEnabled && notificationSnapshot.data().pushStatus === "pending") {
    await notificationRef.update({ pushStatus: "disabled" });
    return { pushStatus: "disabled" };
  }

  const storedNotification = notificationSnapshot.data() || {};
  if (!pushEnabled || storedNotification.pushStatus === "disabled") {
    return { pushStatus: "disabled" };
  }
  if (storedNotification.pushSent === true ||
      storedNotification.pushStatus === "sent") {
    return { pushStatus: "sent" };
  }

  const devicesSnapshot = await accountRef.collection("devices").get();
  const outcomes = await Promise.all(devicesSnapshot.docs.map(async (device) => {
    const token = device.data().token;
    if (typeof token !== "string" || !token) return false;

    try {
      await messaging.send({
        token,
        notification: {
          title,
          body: String(message || "").slice(0, 300),
        },
        data: {
          notificationId,
          type,
          title: String(title || ""),
          message: String(message || "").slice(0, 300),
          loanId: String(loanId || ""),
        },
        android: {
          priority: "high",
          notification: { channelId: "lendy_alerts" },
        },
      });
      return true;
    } catch (error) {
      logger.error("Immediate phone push failed.", {
        notificationId,
        borrowerUid,
        deviceId: device.id,
        code: error.code || "unknown",
      });
      if (
        error.code === "messaging/registration-token-not-registered" ||
        error.code === "messaging/invalid-registration-token"
      ) {
        try {
          await device.ref.delete();
        } catch (deleteError) {
          logger.error("Could not remove an invalid FCM device token.", {
            borrowerUid,
            deviceId: device.id,
            code: deleteError.code || "unknown",
          });
        }
      }
      return false;
    }
  }));

  if (outcomes.some(Boolean)) {
    await notificationRef.update({
      pushSent: true,
      pushStatus: "sent",
    });
    return { pushStatus: "sent" };
  }

  return { pushStatus: "pending" };
}

async function sendChatNotification(options) {
  if (!CHAT_NOTIFICATION_TYPES.has(options.type)) {
    throw new TypeError("Unsupported chat notification type.");
  }
  return sendBorrowerNotification({
    ...options,
    loanId: "",
    preferenceKey: "pushNotificationsEnabled",
  });
}

async function sendLoanNotification(options) {
  const preferenceKey = LOAN_NOTIFICATION_PREFERENCES[options.type];
  if (!preferenceKey) {
    throw new TypeError("Unsupported loan notification type.");
  }
  return sendBorrowerNotification({ ...options, preferenceKey });
}

module.exports = {
  sendBorrowerNotification,
  sendChatNotification,
  sendLoanNotification,
};
