"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildBorrowerAssistantResponse,
  borrowerProfileField,
  findInventoryCategory,
  fallbackBorrowerIntent,
  isBorrowerDomainQuestion,
} = require("./borrower-assistant");

const equipment = [
  {
    id: "camera-1",
    name: "Sony Camera",
    category: "Cameras",
    location: "AV Room",
  },
  {
    id: "camera-2",
    name: "Canon Camera",
    category: "Cameras",
    location: "Storage",
  },
  {
    id: "projector-1",
    name: "Projector",
    category: "Projectors",
  },
  {
    id: "tablet-1",
    name: "Tablet",
    category: "Tablets",
    maintenance: true,
  },
];

test("available items excludes checked-out, returned-for-verification, and maintenance items", () => {
  const { answer, items } = buildBorrowerAssistantResponse({
    intent: "available_items",
    equipment,
    activeLoans: [
      { equipmentId: "camera-1", status: "approved" },
      { equipmentId: "projector-1", status: "return_pending" },
      { equipmentId: "camera-2", status: "returned" },
    ],
  });

  assert.match(answer, /1 item\(s\) available/);
  assert.match(answer, /Choose one below/);
  assert.deepEqual(items.map((item) => item.id), ["camera-2"]);
  assert.equal(items[0].name, "Canon Camera");
  assert.equal(items[0].status, "Available");
});

test("suggestions honor the requested category and only use available equipment", () => {
  const { answer, items } = buildBorrowerAssistantResponse({
    intent: "suggest_item",
    category: "camera",
    equipment,
    activeLoans: [{ equipmentId: "camera-1", status: "approved" }],
  });

  assert.match(answer, /Tap Request/);
  assert.deepEqual(items.map((item) => item.id), ["camera-2"]);
  assert.equal(items[0].name, "Canon Camera");
  assert.equal(items[0].status, "Available");
});

test("inventory results report backend-derived statuses and exclude unavailable requests", () => {
  const { answer, items } = buildBorrowerAssistantResponse({
    intent: "inventory_list",
    equipment,
    activeLoans: [
      { equipmentId: "camera-1", status: "approved" },
      { equipmentId: "projector-1", status: "return_pending" },
    ],
  });

  assert.match(answer, /current status/);
  assert.deepEqual(
    items.map((item) => [item.name, item.status]),
    [
      ["Sony Camera", "Borrowed"],
      ["Canon Camera", "Available"],
      ["Projector", "Return Pending"],
      ["Tablet", "In Maintenance"],
    ],
  );
});

test("item status answers are filtered to the item named by the borrower", () => {
  const { answer, items } = buildBorrowerAssistantResponse({
    intent: "item_status",
    itemQuery: "Canon Camera",
    equipment,
    activeLoans: [{ equipmentId: "camera-1", status: "approved" }],
  });

  assert.equal(answer, "Canon Camera is currently Available.");
  assert.deepEqual(items.map((item) => [item.name, item.status]), [
    ["Canon Camera", "Available"],
  ]);
});

test("fallback classification extracts an inventory-backed item category", () => {
  const result = fallbackBorrowerIntent(
    "I need a camera for recording",
    equipment,
  );
  assert.deepEqual(result, {
    intent: "suggest_item",
    category: "Cameras",
    itemQuery: "",
  });
});

test("category matching accepts singular Gemini labels but returns the backend category", () => {
  assert.equal(findInventoryCategory("Camera", equipment), "Cameras");
  assert.equal(findInventoryCategory("unknown item", equipment), "");
});

test("fallback classification refuses general questions rather than inventing answers", () => {
  assert.equal(
    fallbackBorrowerIntent("Who won the game?", equipment).intent,
    "unknown",
  );
  assert.equal(
    fallbackBorrowerIntent("What is my name?", equipment).intent,
    "my_profile",
  );
  assert.equal(
    fallbackBorrowerIntent("I am available tomorrow", equipment).intent,
    "unknown",
  );
  assert.equal(isBorrowerDomainQuestion("What is my name?", equipment), true);
  assert.equal(isBorrowerDomainQuestion("What tool can I borrow?", equipment), true);
});

test("profile questions resolve only to supported fields on the signed-in user's profile", () => {
  const profile = {
    name: "Jamie Rivera",
    email: "jamie@example.test",
    role: "student",
    idNumber: "STU-12345",
    college: "BSIT",
    yearLevel: "3rd year",
    block: "1",
    gender: "Female",
  };
  const questions = [
    ["What is my name?", "name", "Jamie Rivera"],
    ["What is my email address?", "email", "jamie@example.test"],
    ["Am I a student or faculty?", "role", "Student"],
    ["What is my student number?", "idNumber", "STU-12345"],
    ["What course am I taking?", "college", "BSIT"],
    ["What is my year level?", "yearLevel", "3rd year"],
    ["What is my block?", "block", "1"],
    ["What is my gender?", "gender", "Female"],
  ];

  for (const [question, field, value] of questions) {
    const classification = fallbackBorrowerIntent(question, equipment);
    assert.equal(classification.intent, "my_profile");
    assert.equal(borrowerProfileField(question.toLowerCase()), field);
    const { answer, items } = buildBorrowerAssistantResponse({
      intent: classification.intent,
      profileField: classification.profileField,
      personalProfile: profile,
    });
    assert.match(answer, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.deepEqual(items, []);
  }
});

test("profile summaries omit contact, ID, and gender fields unless specifically requested", () => {
  const { answer } = buildBorrowerAssistantResponse({
    intent: "my_profile",
    profileField: borrowerProfileField("tell me about myself"),
    personalProfile: {
      name: "Jamie Rivera",
      email: "jamie@example.test",
      role: "student",
      idNumber: "STU-12345",
      college: "BSIT",
      yearLevel: "3rd year",
      block: "1",
      gender: "Female",
    },
  });

  assert.match(answer, /Jamie Rivera/);
  assert.match(answer, /BSIT/);
  assert.doesNotMatch(answer, /jamie@example\.test|STU-12345|Female/);
});

test("loan deadlines use only the supplied personal loans that are still active", () => {
  const { answer, items } = buildBorrowerAssistantResponse({
    intent: "my_loan_deadlines",
    personalLoans: [
      { name: "Projector", end: "2026-11-18", status: "approved" },
      { name: "Camera", end: "2026-11-12", status: "return_pending" },
      { name: "Old Camera", end: "2026-10-12", status: "returned" },
    ],
  });

  assert.match(answer, /Camera — due November 12, 2026/);
  assert.match(answer, /Projector — due November 18, 2026/);
  assert.doesNotMatch(answer, /Old Camera/);
  assert.deepEqual(items, []);
});

test("unrelated questions are restricted to inventory-backed answers", () => {
  const response = buildBorrowerAssistantResponse({
    intent: "unknown",
  });

  assert.match(response.answer, /only answer questions using Lendy's equipment and loan data/i);
  assert.deepEqual(response.items, []);
});

test("borrowing instructions do not require private loan data", () => {
  const { answer, items } = buildBorrowerAssistantResponse({
    intent: "how_to_borrow",
  });
  assert.match(answer, /tap Request/i);
  assert.match(answer, /return dates/i);
  assert.deepEqual(items, []);
});
