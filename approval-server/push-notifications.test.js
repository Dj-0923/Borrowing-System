const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(
  path.join(__dirname, "push-notifications.gs"),
  "utf8",
);

function createContext(now = new Date("2026-11-15T16:00:00.000Z")) {
  const properties = new Map();
  properties.getProperty = (key) => properties.get(key) || null;
  properties.setProperty = (key, value) => properties.set(key, String(value));
  const context = {
    Date: class extends Date {
      constructor(...args) {
        super(...(args.length ? args : [now]));
      }

      static now() {
        return now.getTime();
      }
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => properties.get(key) || null,
        setProperty: (key, value) => properties.set(key, String(value)),
      }),
    },
    Utilities: {
      formatDate(date, timeZone) {
        const parts = new Intl.DateTimeFormat("en-CA", {
          timeZone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).formatToParts(date);
        const values = Object.fromEntries(
          parts.map((part) => [part.type, part.value]),
        );
        return `${values.year}-${values.month}-${values.day}`;
      },
    },
    console: { error() {} },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { context, properties };
}

function firestoreDocument(id, fields) {
  return {
    name: `projects/test/databases/(default)/documents/loans/${id}`,
    fields: Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [key, encodeValue(value)]),
    ),
  };
}

function encodeValue(value) {
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "number") return { integerValue: String(value) };
  if (typeof value === "boolean") return { booleanValue: value };
  return { nullValue: null };
}

test("deadline scan sends tomorrow, due-today, and overdue reminders once per Manila day", () => {
  const { context, properties } = createContext();
  properties.set("LENDY_REMINDER_DATE", "2026-11-15");
  const notifications = [];
  context.lendyRunQuery_ = () => [
    firestoreDocument("tomorrow", {
      borrowerUid: "borrower-1",
      name: "Laptop",
      end: "2026-11-17",
    }),
    firestoreDocument("today", {
      borrowerUid: "borrower-2",
      name: "Camera",
      end: "2026-11-16",
    }),
    firestoreDocument("overdue", {
      borrowerUid: "borrower-3",
      name: "Tablet",
      end: "2026-11-15",
    }),
  ];
  context.lendyNotifyBorrower_ = (_projectId, notification) => {
    notifications.push(notification);
  };

  context.lendyProcessDueReminders_("test", properties);
  context.lendyProcessDueReminders_("test", properties);

  assert.deepEqual(
    notifications.map(({ type, notificationId }) => [type, notificationId]),
    [
      ["due_reminder", "tomorrow_due_tomorrow_2026-11-17"],
      ["due_today", "today_due_today_2026-11-16"],
      ["overdue", "overdue_overdue_2026-11-16"],
    ],
  );
  assert.equal(properties.get("LENDY_REMINDER_DATE"), "2026-11-16");
});

test("daily reminders cover hour-based loans and group items into one notification", () => {
  const { context, properties } = createContext();
  properties.set("LENDY_REMINDER_DATE", "2026-11-15");
  const notifications = [];
  context.lendyRunQuery_ = () => [
    firestoreDocument("group-1", {
      borrowerUid: "borrower-1",
      requestGroupId: "request-1",
      name: "Epson Projector",
      durationType: "hours",
      end: "2026-11-16",
    }),
    firestoreDocument("group-2", {
      borrowerUid: "borrower-1",
      requestGroupId: "request-1",
      name: "HDMI Cable",
      durationType: "hours",
      end: "2026-11-16",
    }),
    firestoreDocument("group-3", {
      borrowerUid: "borrower-1",
      requestGroupId: "request-1",
      name: "Tripod",
      durationType: "hours",
      end: "2026-11-16",
    }),
    firestoreDocument("group-4", {
      borrowerUid: "borrower-1",
      requestGroupId: "request-1",
      name: "Microphone",
      durationType: "hours",
      end: "2026-11-16",
    }),
    firestoreDocument("day-loan", {
      borrowerUid: "borrower-3",
      name: "Tablet",
      durationType: "days",
      end: "2026-11-16",
    }),
    firestoreDocument("hour-overdue", {
      borrowerUid: "borrower-2",
      name: "Camera",
      durationType: "hours",
      end: "2026-11-15",
      endAt: "2026-11-15T10:00:00",
    }),
  ];
  context.lendyNotifyBorrower_ = (_projectId, notification) => {
    notifications.push(notification);
  };

  context.lendyProcessDueReminders_("test", properties);
  context.lendyProcessDueReminders_("test", properties);

  assert.deepEqual(
    notifications.map(({ type, notificationId, message }) => ({
      type,
      notificationId,
      message,
    })),
    [
      {
        type: "due_today",
        notificationId: "group_request-1_due_today_2026-11-16",
        message:
          "Epson Projector and 3 more items are due today. Please return them on time.",
      },
      {
        type: "due_today",
        notificationId: "day-loan_due_today_2026-11-16",
        message: "Tablet is due today. Please return it on time.",
      },
      {
        type: "overdue",
        notificationId: "hour-overdue_overdue_2026-11-16",
        message:
          "Camera was due 2026-11-15 and is overdue. Please return it as soon as possible.",
      },
    ],
  );
  assert.equal(properties.get("LENDY_REMINDER_DATE"), "2026-11-16");
});

test("loan scan distinguishes request decisions from rejected return reports", () => {
  const { context, properties } = createContext();
  properties.set("LENDY_LOAN_CURSOR_MS", "100");
  const notifications = [];
  context.lendyRunQuery_ = () => [
    firestoreDocument("approved", {
      borrowerUid: "borrower-1",
      name: "Laptop",
      status: "approved",
      updatedAt: 150,
    }),
    firestoreDocument("return-rejected", {
      borrowerUid: "borrower-2",
      name: "Camera",
      status: "approved",
      returnVerificationStatus: "rejected",
      returnVerifiedAt: 160,
      updatedAt: 160,
    }),
    firestoreDocument("rejected", {
      borrowerUid: "borrower-3",
      name: "Tablet",
      status: "rejected",
      updatedAt: 170,
    }),
    firestoreDocument("returned", {
      borrowerUid: "borrower-4",
      name: "Projector",
      status: "returned",
      updatedAt: 180,
    }),
  ];
  context.lendyNotifyBorrower_ = (_projectId, notification) => {
    notifications.push(notification);
  };

  context.lendyProcessLoanUpdates_("test", properties);

  assert.deepEqual(
    notifications.map(({ type }) => type),
    ["approved", "return_rejected", "rejected", "returned"],
  );
  assert.equal(
    notifications[0].message,
    "Laptop has been approved. Do not take borrowed items home. Borrowers are responsible for repair or replacement costs for lost or damaged items.",
  );
  assert.equal(
    notifications[1].notificationId,
    "return-rejected_return_rejected_160",
  );
});

test("pending notification retries recover the matching preference category", () => {
  const { context } = createContext();
  const delivered = [];
  context.lendyRunQuery_ = () => [{
    name: "projects/test/databases/(default)/documents/accounts/borrower-1/notifications/returned",
    fields: {
      id: { stringValue: "returned" },
      type: { stringValue: "returned" },
      title: { stringValue: "Item return confirmed" },
      message: { stringValue: "Laptop has been marked as returned." },
      loanId: { stringValue: "loan-1" },
      pushStatus: { stringValue: "pending" },
      deliverySource: { stringValue: "apps_script" },
    },
  }];
  context.lendyDeliverNotification_ = (_projectId, _path, notification) => {
    delivered.push(notification);
  };

  context.lendyRetryPendingNotifications_("test");

  assert.equal(delivered.length, 1);
  assert.equal(delivered[0].preferenceKey, "returnRemindersEnabled");
});

test("delivery disables a queued notification when its category is off", () => {
  const { context } = createContext();
  const updates = [];
  context.lendyGetDocument_ = () => ({
    notificationPreferences: { returnRemindersEnabled: false },
  });
  context.lendyPatchFields_ = (_projectId, _path, fields) => {
    updates.push(fields);
  };
  context.lendyListDocuments_ = () => {
    throw new Error("Disabled notifications should not query device tokens.");
  };

  context.lendyDeliverNotification_(
    "test",
    "accounts/borrower-1/notifications/returned",
    { borrowerUid: "borrower-1", type: "returned" },
    { pushStatus: "pending" },
  );

  assert.equal(updates.length, 1);
  assert.equal(updates[0].pushStatus.stringValue, "disabled");
});

test("disabled preferences stop return and request alerts before they are created", () => {
  const { context } = createContext();
  const requests = [];
  context.lendyGetDocument_ = () => ({
    notificationPreferences: {
      requestUpdatesEnabled: false,
      returnRemindersEnabled: false,
    },
  });
  context.lendyRequest_ = (...args) => {
    requests.push(args);
    return { status: 200 };
  };

  for (const [type, preferenceKey] of [
    ["due_reminder", "returnRemindersEnabled"],
    ["due_today", "returnRemindersEnabled"],
    ["overdue", "returnRemindersEnabled"],
    ["returned", "returnRemindersEnabled"],
    ["return_rejected", "returnRemindersEnabled"],
    ["approved", "requestUpdatesEnabled"],
    ["rejected", "requestUpdatesEnabled"],
  ]) {
    context.lendyNotifyBorrower_("test", {
      borrowerUid: "borrower-1",
      notificationId: `${type}-notification`,
      title: "Test notification",
      message: "Test message",
      type,
      loanId: "loan-1",
      preferenceKey,
    });
  }

  assert.equal(requests.length, 0);
});

test("Firestore errors include the API-provided reason", () => {
  const { context } = createContext();

  assert.throws(
    () => context.lendyEnsureSuccess_(
      { status: 403, body: { error: { message: "Permission denied." } } },
      "query Firestore",
    ),
    /HTTP 403 - Permission denied\./,
  );
});
