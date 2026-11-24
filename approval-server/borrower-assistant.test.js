"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildBorrowerAssistantResponse,
  borrowerAnswerLanguage,
  borrowerProfileField,
  fallbackBorrowerIntent,
  isBorrowerDomainQuestion,
} = require("./borrower-assistant");

const equipment = [
  { id: "eq1", name: "Canon R50", category: "Camera", tag: "CAM-001", location: "Room 1" },
  { id: "eq2", name: "Epson X49", category: "Projector", tag: "PRJ-001", location: "Room 2" },
  { id: "eq3", name: "Dell Latitude", category: "Laptop", tag: "LAP-001", location: "Room 3" },
  { id: "eq4", name: "Camera Two", category: "Camera", tag: "CAM-002", location: "Room 1", maintenance: true },
];
const personalLoans = [
  { id: "l1", name: "Canon R50", equipmentId: "eq1", status: "approved", checkedOutAt: "x", start: "2026-11-01", end: "2026-11-10" },
  { id: "l2", name: "Epson X49", equipmentId: "eq2", status: "approved", start: "2026-11-20", end: "2026-11-30" },
];
const intentOf = (q) => fallbackBorrowerIntent(q, equipment).intent;
const respond = (q, extra = {}) => {
  const classified = fallbackBorrowerIntent(q, equipment);
  return buildBorrowerAssistantResponse({
    ...classified,
    question: q,
    equipment,
    activeLoans: personalLoans,
    personalLoans,
    personalProfile: { name: "Juan" },
    language: borrowerAnswerLanguage(q),
    ...extra,
  });
};

test("greetings are recognized (English, Tagalog, Taglish)", () => {
  for (const q of [
    "hello", "Hi", "hey!", "Hello po", "hi lendy", "good morning", "Good afternoon po",
    "magandang umaga", "magandang hapon po", "kumusta", "kamusta ka na?", "musta po",
    "hello kumusta", "how are you", "hey there", "HELLO!!!", "what's up",
  ]) {
    assert.equal(intentOf(q), "greeting", q);
    assert.ok(isBorrowerDomainQuestion(q, equipment), q);
  }
});

test("a greeting followed by a real question keeps the real intent", () => {
  assert.equal(intentOf("hello, what items are available?"), "available_items");
  assert.equal(intentOf("hi po, ano ang loans ko"), "my_loans");
  assert.equal(intentOf("good morning, what is my email"), "my_profile");
});

test("thanks are recognized (English, Tagalog, Taglish)", () => {
  for (const q of [
    "thanks", "Thank you", "thank you so much!", "thanks a lot", "ty", "thx",
    "salamat", "salamat po", "maraming salamat", "Maraming salamat po!", "ok salamat",
    "sige salamat po", "thank you lendy", "salamat sa tulong",
  ]) {
    assert.equal(intentOf(q), "thanks", q);
  }
});

test("thanks followed by a real question keeps the real intent", () => {
  assert.equal(intentOf("thanks, what are my deadlines?"), "my_loan_deadlines");
});

test("farewells are recognized", () => {
  for (const q of ["bye", "goodbye", "paalam", "see you", "ingat po", "bye po"]) {
    assert.equal(intentOf(q), "farewell", q);
  }
});

test("help requests are recognized", () => {
  for (const q of ["help", "what can you do", "ano kaya mong gawin", "tulong", "how can you help me"]) {
    assert.equal(intentOf(q), "help", q);
  }
  // Not a bare help request
  assert.equal(intentOf("help me find a projector"), "suggest_item");
});

test("harmless non-Lendy words are not mistaken for greetings/thanks", () => {
  for (const q of ["hi5 is a game", "what is the capital of France", "ok", "na", "ka"]) {
    assert.equal(intentOf(q), "unknown", q);
  }
});

test("Filipino and Taglish greeting/thanks answer in Filipino; English in English", () => {
  assert.equal(borrowerAnswerLanguage("salamat"), "filipino");
  assert.equal(borrowerAnswerLanguage("kumusta"), "filipino");
  assert.equal(borrowerAnswerLanguage("magandang umaga"), "filipino");
  assert.equal(borrowerAnswerLanguage("hello po"), "filipino");
  assert.equal(borrowerAnswerLanguage("hello"), "english");
  assert.equal(borrowerAnswerLanguage("thank you"), "english");
});

test("greeting/thanks/farewell/help replies carry no item data and no invented facts", () => {
  for (const q of ["hello", "salamat po", "bye", "help", "kumusta"]) {
    const { answer, items } = respond(q);
    assert.ok(answer.trim().length > 0, q);
    assert.deepEqual(items, [], q);
    assert.doesNotMatch(answer, /Canon|Epson|Dell|CAM-001/, q);
  }
  assert.match(respond("hello").answer, /Lendy/);
  assert.match(respond("hello").answer, /^Hello/);
  assert.match(respond("salamat po").answer, /Walang anuman/);
  assert.match(respond("thank you").answer, /welcome/i);
  assert.match(respond("kumusta").answer, /^Kumusta/);
});

test("Filipino borrow verbs (humiram/manghiram/paghiram) are understood", () => {
  assert.equal(intentOf("gusto ko manghiram"), "suggest_item");
  assert.equal(intentOf("gusto kong humiram ng camera"), "suggest_item");
  assert.equal(intentOf("pwede ba akong humiram ng laptop?"), "suggest_item");
  assert.equal(intentOf("paano humiram ng gamit"), "how_to_borrow");
  assert.equal(intentOf("paano manghiram"), "how_to_borrow");
  assert.equal(intentOf("pano mag-request"), "how_to_borrow");
});

test("availability phrased as 'do you have', 'is there', 'can I borrow', 'meron ba'", () => {
  let r = fallbackBorrowerIntent("do you have a projector?", equipment);
  assert.equal(r.intent, "available_items");
  assert.equal(r.category, "Projector");
  r = fallbackBorrowerIntent("can I borrow a camera", equipment);
  assert.equal(r.intent, "available_items");
  assert.equal(r.category, "Camera");
  r = fallbackBorrowerIntent("meron bang laptop?", equipment);
  assert.equal(r.intent, "available_items");
  assert.equal(r.category, "Laptop");
  r = fallbackBorrowerIntent("may projector ba kayo", equipment);
  assert.equal(r.intent, "available_items");
  assert.equal(intentOf("is there any camera I can borrow"), "available_items");
});

test("availability answers stay grounded in inventory", () => {
  const { answer, items } = respond("can I borrow a camera");
  // Canon R50 is checked out and Camera Two is in maintenance, so no camera is available.
  assert.equal(items.length, 0);
  assert.match(answer, /no available items/i);
  const laptops = respond("meron bang laptop?");
  assert.deepEqual(laptops.items.map((i) => i.id), ["eq3"]);
});

test("brand answers use only saved brands and include matching item cards", () => {
  const savedBrand = respond("What brand is Canon R50?", {
    equipment: [{ ...equipment[0], brand: "Canon" }],
  });
  assert.equal(savedBrand.answer, "The brand is Canon.");
  assert.deepEqual(savedBrand.items.map((item) => item.id), ["eq1"]);

  const savedFilipinoBrand = respond("Anong brand ng Canon R50?", {
    equipment: [{ ...equipment[0], brand: "Canon" }],
  });
  assert.equal(savedFilipinoBrand.answer, "Ang brand ay Canon.");
  assert.deepEqual(savedFilipinoBrand.items.map((item) => item.id), ["eq1"]);

  const missingEnglishBrand = respond("What brand is Camera Two?", {
    equipment: [equipment[3]],
  });
  assert.equal(missingEnglishBrand.answer, "Brand Not specified.");
  assert.deepEqual(missingEnglishBrand.items.map((item) => item.id), ["eq4"]);

  for (const question of [
    "Anong brand ng camera?",
    "Anong brand ng Camera meron kayo?",
    "Ano ang brand ng Camera?",
  ]) {
    const missingFilipinoBrand = respond(question, {
      equipment: [equipment[3]],
    });
    assert.equal(missingFilipinoBrand.answer, "Walang naka-lagay na Brand.");
    assert.deepEqual(
      missingFilipinoBrand.items.map((item) => item.id),
      ["eq4"],
    );
  }
});

test("brand questions match arbitrary item-name keywords, not only cameras", () => {
  const keyboard = {
    id: "keyboard-1",
    name: "Mechanical Keyboard",
    category: "Accessories",
    tag: "KEY-001",
    location: "IT Room",
  };
  const question = "Ano ang brand ng Keyboard?";
  const classified = fallbackBorrowerIntent(question, [keyboard]);
  assert.deepEqual(classified, {
    intent: "item_details",
    category: "",
    itemQuery: "keyboard",
  });
  const missingBrand = buildBorrowerAssistantResponse({
    ...classified,
    question,
    equipment: [keyboard],
    language: borrowerAnswerLanguage(question),
  });
  assert.equal(missingBrand.answer, "Walang naka-lagay na Brand.");
  assert.deepEqual(missingBrand.items.map((item) => item.id), ["keyboard-1"]);

  const savedKeyboard = { ...keyboard, brand: "Logitech" };
  const savedBrand = buildBorrowerAssistantResponse({
    ...classified,
    question,
    equipment: [savedKeyboard],
    language: borrowerAnswerLanguage(question),
  });
  assert.equal(savedBrand.answer, "Ang brand ay Logitech.");
  assert.deepEqual(savedBrand.items.map((item) => item.id), ["keyboard-1"]);
});

test("deadline questions phrased 'when do I return', overdue, hanggang kailan", () => {
  for (const q of [
    "when do I return the camera",
    "when should i return my loan",
    "do I have any overdue items?",
    "is my loan past due",
    "lampas na ba sa due date ang hiniram ko",
    "hanggang kailan ko pwedeng hawakan ang camera",
  ]) {
    assert.equal(intentOf(q), "my_loan_deadlines", q);
  }
  // Not about the user's own loan
  assert.notEqual(intentOf("when will the projector be returned"), "my_loan_deadlines");
});

test("overdue loans are flagged using stored dates only", () => {
  const { answer } = respond("do I have overdue items?", { today: "2026-11-22" });
  assert.match(answer, /Canon R50 — due [^\n]*2026 \(overdue\)/);
  assert.doesNotMatch(answer, /Epson X49[^\n]*overdue/);
  const fil = respond("lampas na ba sa due date ang hiniram ko", { today: "2026-11-22" }).answer;
  assert.match(fil, /Canon R50 — ibalik sa [^\n]*2026 \(lampas na\)/);
});

test("plural deadline wording is understood", () => {
  assert.equal(intentOf("what are my deadlines"), "my_loan_deadlines");
  assert.equal(intentOf("ano ang return dates ko"), "my_loan_deadlines");
});

test("loan history phrasing", () => {
  for (const q of ["loan history", "show my history", "ano ang nahiram ko", "mga nirequest ko", "active requests ko"]) {
    assert.equal(intentOf(q), "my_loans", q);
  }
});

test("profile field phrasing without 'ano ang' / 'my'", () => {
  assert.equal(borrowerProfileField("what is my student id"), "idNumber");
  assert.equal(borrowerProfileField("student id ko"), "idNumber");
  assert.equal(borrowerProfileField("what year level am i"), "yearLevel");
  assert.equal(borrowerProfileField("what block am i in"), "block");
  assert.equal(borrowerProfileField("email ko po"), "email");
  assert.equal(borrowerProfileField("role ko"), "role");
  assert.equal(borrowerProfileField("course ko"), "college");
  assert.equal(borrowerProfileField("year ko"), "yearLevel");
  assert.equal(borrowerProfileField("block ko"), "block");
  assert.equal(borrowerProfileField("pangalan ko"), "name");
});

test("profile answers remain grounded: missing data is not invented", () => {
  const { answer } = respond("student id ko");
  assert.match(answer, /Walang naka-save/);
  assert.doesNotMatch(answer, /\d{6,}/);
});

test("regressions: existing intents unchanged", () => {
  assert.equal(intentOf("what items are available?"), "available_items");
  assert.equal(intentOf("how do I borrow an item"), "how_to_borrow");
  assert.equal(intentOf("show my loans"), "my_loans");
  assert.equal(intentOf("anong items ang under maintenance"), "maintenance_items");
  assert.equal(intentOf("is the Canon R50 available"), "item_status");
  assert.equal(intentOf("what is the weather today"), "unknown");
  assert.equal(intentOf("tell me a joke"), "unknown");
  assert.equal(borrowerProfileField("my gender"), "gender");
});