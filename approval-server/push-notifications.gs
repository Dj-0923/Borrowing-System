function installLendyNotificationPoller() {
  lendyProjectId_();
  var properties = PropertiesService.getScriptProperties();
  var now = new Date();

  if (!properties.getProperty("LENDY_LOAN_CURSOR_MS")) {
    properties.setProperty("LENDY_LOAN_CURSOR_MS", String(now.getTime()));
  }
  if (!properties.getProperty("LENDY_CHAT_CURSOR")) {
    properties.setProperty("LENDY_CHAT_CURSOR", now.toISOString());
  }
  if (!properties.getProperty("LENDY_REMINDER_DATE")) {
    properties.setProperty("LENDY_REMINDER_DATE", lendyDateInManila_(now));
  }

  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === "runLendyNotificationPoller") {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger("runLendyNotificationPoller")
    .timeBased()
    .everyMinutes(5)
    .create();
}

function authorizeLendyNotificationAccess() {
  var projectId = lendyProjectId_();
  lendyRunQuery_(projectId, {
    from: [{ collectionId: "loans" }],
    limit: 1,
  });
}

function runLendyNotificationPoller() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;

  try {
    var projectId = lendyProjectId_();
    var properties = PropertiesService.getScriptProperties();
    lendyRetryPendingNotifications_(projectId);
    lendyProcessLoanUpdates_(projectId, properties);
    lendyProcessAdminChatReplies_(projectId, properties);
    lendyProcessAccountPushQueue_(projectId);
    lendyProcessDueReminders_(projectId, properties);
  } finally {
    lock.releaseLock();
  }
}

function stopLendyNotificationPoller() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === "runLendyNotificationPoller") {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function lendyProcessLoanUpdates_(projectId, properties) {
  var cursor = Number(properties.getProperty("LENDY_LOAN_CURSOR_MS"));
  if (!Number.isFinite(cursor) || cursor <= 0) {
    throw new Error("Run installLendyNotificationPoller before polling.");
  }
  var scanStartedAt = Date.now();
  var documents = lendyRunQuery_(projectId, {
    from: [{ collectionId: "loans" }],
    where: {
      fieldFilter: {
        field: { fieldPath: "updatedAt" },
        op: "GREATER_THAN_OR_EQUAL",
        value: { integerValue: String(cursor) },
      },
    },
    orderBy: [{ field: { fieldPath: "updatedAt" }, direction: "ASCENDING" }],
  });

  documents.forEach(function (document) {
    var loan = lendyDocumentData_(document);
    var loanId = lendyDocumentId_(document);
    if (!loanId || !loan.borrowerUid) return;

    if (loan.status === "approved" && loan.returnVerificationStatus === "rejected") {
      var rejectionEvent = loan.returnVerifiedAt || loan.updatedAt;
      lendyNotifyBorrower_(projectId, {
        borrowerUid: loan.borrowerUid,
        notificationId: loanId + "_return_rejected_" + String(rejectionEvent),
        title: "Return needs attention",
        message: loan.returnRejectionReason
          ? lendyItemTitle_(loan) + " return was not approved: " + loan.returnRejectionReason
          : lendyItemTitle_(loan) + " return was not approved. Please review and resubmit.",
        type: "return_rejected",
        loanId: loanId,
        preferenceKey: "returnRemindersEnabled",
      });
      return;
    }

    if (loan.status === "approved" || loan.status === "rejected") {
      var approved = loan.status === "approved";
      lendyNotifyBorrower_(projectId, {
        borrowerUid: loan.borrowerUid,
        notificationId: loanId + "_" + loan.status,
        title: approved ? "Request approved" : "Request rejected",
        message: approved
          ? lendyItemTitle_(loan) + " has been approved."
          : lendyItemTitle_(loan) + " was not approved.",
        type: loan.status,
        loanId: loanId,
        preferenceKey: "requestUpdatesEnabled",
      });
    } else if (loan.status === "returned") {
      lendyNotifyBorrower_(projectId, {
        borrowerUid: loan.borrowerUid,
        notificationId: loanId + "_returned",
        title: "Item return confirmed",
        message: lendyItemTitle_(loan) + " has been marked as returned. Thank you.",
        type: "returned",
        loanId: loanId,
        preferenceKey: "returnRemindersEnabled",
      });
    }
  });

  properties.setProperty("LENDY_LOAN_CURSOR_MS", String(scanStartedAt));
}

function lendyProcessAdminChatReplies_(projectId, properties) {
  var cursor = properties.getProperty("LENDY_CHAT_CURSOR");
  if (!cursor) throw new Error("Run installLendyNotificationPoller before polling.");

  var scanStartedAt = new Date().toISOString();
  var documents = lendyRunQuery_(projectId, {
    from: [{ collectionId: "messages", allDescendants: true }],
    where: {
      fieldFilter: {
        field: { fieldPath: "createdAt" },
        op: "GREATER_THAN_OR_EQUAL",
        value: { timestampValue: cursor },
      },
    },
    orderBy: [{ field: { fieldPath: "createdAt" }, direction: "ASCENDING" }],
  });

  documents.forEach(function (document) {
    var message = lendyDocumentData_(document);
    if (message.senderRole !== "admin") return;

    var path = lendyDocumentPath_(document);
    if (path.length !== 4 || path[0] !== "chats" || path[2] !== "messages") return;
    lendyNotifyBorrower_(projectId, {
      borrowerUid: path[1],
      notificationId: "chat_" + path[3],
      title: "New admin reply",
      message: String(message.text || "An admin replied to your chat.").slice(0, 300),
      type: "admin_chat_reply",
      loanId: "",
      preferenceKey: "pushNotificationsEnabled",
    });
  });

  properties.setProperty("LENDY_CHAT_CURSOR", scanStartedAt);
}

function lendyProcessDueReminders_(projectId, properties) {
  var today = lendyDateInManila_(new Date());
  if (properties.getProperty("LENDY_REMINDER_DATE") === today) return;

  var tomorrow = lendyNextDate_(today);
  var loans = lendyRunQuery_(projectId, {
    from: [{ collectionId: "loans" }],
    where: {
      fieldFilter: {
        field: { fieldPath: "status" },
        op: "EQUAL",
        value: { stringValue: "approved" },
      },
    },
  });

  loans.forEach(function (document) {
    var loan = lendyDocumentData_(document);
    var loanId = lendyDocumentId_(document);
    if (!loanId || !loan.borrowerUid || typeof loan.end !== "string") return;

    if (loan.end === tomorrow) {
      lendyNotifyBorrower_(projectId, {
        borrowerUid: loan.borrowerUid,
        notificationId: loanId + "_due_tomorrow_" + tomorrow,
        title: "Return due tomorrow",
        message: lendyItemTitle_(loan) + " is due tomorrow. Please return it on time.",
        type: "due_reminder",
        loanId: loanId,
        preferenceKey: "returnRemindersEnabled",
      });
    } else if (loan.end === today) {
      lendyNotifyBorrower_(projectId, {
        borrowerUid: loan.borrowerUid,
        notificationId: loanId + "_due_today_" + today,
        title: "Return due today",
        message: lendyItemTitle_(loan) + " is due today. Please return it on time.",
        type: "due_today",
        loanId: loanId,
        preferenceKey: "returnRemindersEnabled",
      });
    } else if (loan.end < today) {
      lendyNotifyBorrower_(projectId, {
        borrowerUid: loan.borrowerUid,
        notificationId: loanId + "_overdue_" + today,
        title: "Item overdue",
        message: lendyItemTitle_(loan) + " was due " + loan.end +
          " and is overdue. Please return it as soon as possible.",
        type: "overdue",
        loanId: loanId,
        preferenceKey: "returnRemindersEnabled",
      });
    }
  });

  properties.setProperty("LENDY_REMINDER_DATE", today);
}

function lendyNotifyBorrower_(projectId, notification) {
  if (typeof notification.borrowerUid !== "string" || !notification.borrowerUid) return;

  var accountPath = "accounts/" + notification.borrowerUid;
  var account = lendyGetDocument_(projectId, accountPath);
  if (!account) return;

  var preferences = account.notificationPreferences || {};
  var preferenceKey = notification.preferenceKey ||
    lendyPreferenceKeyForType_(notification.type);
  if (preferenceKey && preferences[preferenceKey] === false) {
    return;
  }

  var notificationPath = accountPath + "/notifications/" + notification.notificationId;
  var existing = lendyGetDocument_(projectId, notificationPath);
  if (!existing) {
    var now = new Date().toISOString();
    var fields = {
      id: { stringValue: notification.notificationId },
      loanId: { stringValue: notification.loanId || "" },
      type: { stringValue: notification.type },
      preferenceKey: { stringValue: preferenceKey || "" },
      title: { stringValue: notification.title },
      message: { stringValue: notification.message.slice(0, 300) },
      isRead: { booleanValue: false },
      pushSent: { booleanValue: false },
      pushStatus: { stringValue: "pending" },
      deliverySource: { stringValue: "apps_script" },
      timestamp: { timestampValue: now },
    };
    var created = lendyRequest_(
      projectId,
      "PATCH",
      "documents/" + notificationPath + "?currentDocument.exists=false",
      { fields: fields },
    );
    if (created.status === 409) {
      existing = lendyGetDocument_(projectId, notificationPath);
    } else {
      lendyEnsureSuccess_(created, "create notification");
      existing = lendyDocumentData_(created.body);
    }
  }

  if (!existing || existing.pushSent === true || existing.pushStatus === "sent" ||
      existing.pushStatus === "disabled") {
    return;
  }
  if (preferences.pushNotificationsEnabled === false) {
    lendyPatchFields_(projectId, notificationPath, {
      pushStatus: { stringValue: "disabled" },
    });
    return;
  }
  lendyDeliverNotification_(projectId, notificationPath, notification, existing);
}

function lendyRetryPendingNotifications_(projectId) {
  var documents = lendyRunQuery_(projectId, {
    from: [{ collectionId: "notifications", allDescendants: true }],
    where: {
      fieldFilter: {
        field: { fieldPath: "pushStatus" },
        op: "EQUAL",
        value: { stringValue: "pending" },
      },
    },
  });

  documents.forEach(function (document) {
    var notification = lendyDocumentData_(document);
    if (notification.deliverySource !== "apps_script") return;
    var path = lendyDocumentPath_(document);
    if (path.length !== 4 || path[0] !== "accounts" || path[2] !== "notifications") return;

    lendyDeliverNotification_(projectId, path.join("/"), {
      borrowerUid: path[1],
      notificationId: notification.id || path[3],
      title: notification.title,
      message: notification.message,
      type: notification.type,
      loanId: notification.loanId || "",
      preferenceKey: notification.preferenceKey ||
        lendyPreferenceKeyForType_(notification.type),
    }, notification);
  });
}

function lendyProcessAccountPushQueue_(projectId) {
  var documents = lendyRunQuery_(projectId, {
    from: [{ collectionId: "pushNotificationQueue" }],
    where: {
      fieldFilter: {
        field: { fieldPath: "status" },
        op: "EQUAL",
        value: { stringValue: "pending" },
      },
    },
  });

  documents.forEach(function (document) {
    var event = lendyDocumentData_(document);
    var eventPath = lendyDocumentPath_(document).join("/");
    if (!eventPath || !event.targetToken) return;
    var result = lendySendFcmToToken_(projectId, event.targetToken, {
      notificationId: event.notificationId,
      type: event.type,
      loanId: event.loanId || "",
      title: event.title,
      message: event.message,
    });
    if (result.sent || result.invalidToken) {
      lendyPatchFields_(projectId, eventPath, {
        status: { stringValue: result.sent ? "sent" : "invalid" },
        targetToken: { nullValue: null },
        processedAt: { timestampValue: new Date().toISOString() },
      });
    }
  });
}

function lendyDeliverNotification_(projectId, notificationPath, notification, storedNotification) {
  var account = lendyGetDocument_(projectId, "accounts/" + notification.borrowerUid);
  if (!account) return;
  var preferences = account.notificationPreferences || {};
  var preferenceKey = notification.preferenceKey ||
    storedNotification.preferenceKey ||
    lendyPreferenceKeyForType_(notification.type);
  if ((preferenceKey && preferences[preferenceKey] === false) ||
      preferences.pushNotificationsEnabled === false) {
    lendyPatchFields_(projectId, notificationPath, {
      pushStatus: { stringValue: "disabled" },
    });
    return;
  }

  var devices = lendyListDocuments_(
    projectId,
    "accounts/" + notification.borrowerUid + "/devices",
  );
  if (devices.length === 0) return;

  var sent = false;
  devices.forEach(function (deviceDocument) {
    var device = lendyDocumentData_(deviceDocument);
    if (typeof device.token !== "string" || !device.token) return;

    var result = lendySendFcmToToken_(projectId, device.token, notification);
    if (result.sent) {
      sent = true;
    } else if (result.invalidToken) {
      var deviceId = lendyDocumentId_(deviceDocument);
      if (deviceId) lendyDeleteDocument_(projectId, "accounts/" +
        notification.borrowerUid + "/devices/" + deviceId);
    }
  });

  if (sent) {
    lendyPatchFields_(projectId, notificationPath, {
      pushSent: { booleanValue: true },
      pushStatus: { stringValue: "sent" },
    });
  } else if (storedNotification.pushStatus !== "pending") {
    lendyPatchFields_(projectId, notificationPath, {
      pushStatus: { stringValue: "pending" },
    });
  }
}

function lendyPreferenceKeyForType_(type) {
  if (type === "approved" || type === "rejected") return "requestUpdatesEnabled";
  if (type === "return_rejected" || type === "returned" ||
      type === "due_reminder" || type === "due_today" || type === "overdue") {
    return "returnRemindersEnabled";
  }
  if (type === "admin_chat_reply" || type === "assistant_reply") {
    return "pushNotificationsEnabled";
  }
  return "";
}

function lendySendFcmToToken_(projectId, token, notification) {
  var response = UrlFetchApp.fetch(
    "https://fcm.googleapis.com/v1/projects/" + encodeURIComponent(projectId) +
      "/messages:send",
    {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
      payload: JSON.stringify({
        message: {
          token: token,
          notification: {
            title: notification.title,
            body: notification.message,
          },
          data: {
            notificationId: String(notification.notificationId),
            type: String(notification.type),
            loanId: String(notification.loanId || ""),
          },
          android: {
            priority: "HIGH",
            notification: { channel_id: "lendy_alerts" },
          },
        },
      }),
      muteHttpExceptions: true,
    },
  );

  var code = response.getResponseCode();
  if (code >= 200 && code < 300) return { sent: true, invalidToken: false };

  var responseText = response.getContentText();
  var invalidToken = code === 404 && /UNREGISTERED|registration-token-not-registered/i.test(responseText);
  console.error("FCM send failed with HTTP " + code + ".");
  return { sent: false, invalidToken: invalidToken };
}

function lendyListDocuments_(projectId, collectionPath) {
  var results = [];
  var pageToken = "";
  do {
    var query = "?pageSize=1000" +
      (pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : "");
    var response = lendyRequest_(
      projectId,
      "GET",
      "documents/" + collectionPath + query,
    );
    lendyEnsureSuccess_(response, "list documents");
    results = results.concat(response.body.documents || []);
    pageToken = response.body.nextPageToken || "";
  } while (pageToken);
  return results;
}

function lendyGetDocument_(projectId, documentPath) {
  var response = lendyRequest_(projectId, "GET", "documents/" + documentPath);
  if (response.status === 404) return null;
  lendyEnsureSuccess_(response, "get document");
  return lendyDocumentData_(response.body);
}

function lendyDeleteDocument_(projectId, documentPath) {
  var response = lendyRequest_(projectId, "DELETE", "documents/" + documentPath);
  if (response.status !== 404) lendyEnsureSuccess_(response, "delete invalid device token");
}

function lendyPatchFields_(projectId, documentPath, fields) {
  var query = Object.keys(fields).map(function (field) {
    return "updateMask.fieldPaths=" + encodeURIComponent(field);
  }).join("&");
  var response = lendyRequest_(
    projectId,
    "PATCH",
    "documents/" + documentPath + "?" + query,
    { fields: fields },
  );
  lendyEnsureSuccess_(response, "update notification status");
}

function lendyRunQuery_(projectId, structuredQuery) {
  var response = lendyRequest_(
    projectId,
    "POST",
    "documents:runQuery",
    { structuredQuery: structuredQuery },
  );
  lendyEnsureSuccess_(response, "query Firestore");
  return (response.body || []).map(function (entry) {
    return entry.document;
  }).filter(Boolean);
}

function lendyRequest_(projectId, method, path, body) {
  var options = {
    method: method,
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  };
  if (body !== undefined) {
    options.contentType = "application/json";
    options.payload = JSON.stringify(body);
  }
  var url = "https://firestore.googleapis.com/v1/projects/" +
    encodeURIComponent(projectId) + "/databases/(default)/" + path;
  var response = UrlFetchApp.fetch(url, options);
  var text = response.getContentText();
  var parsed = text ? JSON.parse(text) : {};
  return { status: response.getResponseCode(), body: parsed };
}

function lendyEnsureSuccess_(response, operation) {
  if (response.status < 200 || response.status >= 300) {
    var error = response.body && response.body.error;
    var details = error
      ? error.message || JSON.stringify(error)
      : JSON.stringify(response.body || {});
    throw new Error("Could not " + operation + ": HTTP " +
      response.status + (details && details !== "{}" ? " - " + details : ""));
  }
}

function lendyDocumentData_(document) {
  var result = {};
  var fields = document && document.fields ? document.fields : {};
  Object.keys(fields).forEach(function (key) {
    result[key] = lendyDecodeValue_(fields[key]);
  });
  return result;
}

function lendyDecodeValue_(value) {
  if (Object.prototype.hasOwnProperty.call(value, "stringValue")) return value.stringValue;
  if (Object.prototype.hasOwnProperty.call(value, "integerValue")) return Number(value.integerValue);
  if (Object.prototype.hasOwnProperty.call(value, "doubleValue")) return Number(value.doubleValue);
  if (Object.prototype.hasOwnProperty.call(value, "booleanValue")) return value.booleanValue;
  if (Object.prototype.hasOwnProperty.call(value, "timestampValue")) return value.timestampValue;
  if (Object.prototype.hasOwnProperty.call(value, "nullValue")) return null;
  if (value.mapValue) return lendyDocumentData_({ fields: value.mapValue.fields });
  if (value.arrayValue) {
    return (value.arrayValue.values || []).map(lendyDecodeValue_);
  }
  return null;
}

function lendyDocumentPath_(document) {
  var marker = "/documents/";
  var index = document.name.indexOf(marker);
  return index < 0 ? [] : document.name.slice(index + marker.length).split("/");
}

function lendyDocumentId_(document) {
  var path = lendyDocumentPath_(document);
  return path.length ? path[path.length - 1] : "";
}

function lendyProjectId_() {
  var projectId = PropertiesService.getScriptProperties()
    .getProperty("FIREBASE_PROJECT_ID");
  if (!projectId || !/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) {
    throw new Error("Set FIREBASE_PROJECT_ID in Apps Script project properties.");
  }
  return projectId;
}

function lendyItemTitle_(loan) {
  return loan.name || "Your requested item";
}

function lendyDateInManila_(date) {
  return Utilities.formatDate(date, "Asia/Manila", "yyyy-MM-dd");
}

function lendyNextDate_(dateString) {
  var parts = dateString.split("-").map(Number);
  return Utilities.formatDate(
    new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + 1)),
    "UTC",
    "yyyy-MM-dd",
  );
}
