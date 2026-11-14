"use strict";

const activeLoanStatuses = new Set(["approved", "return_pending"]);

function fallbackBorrowerIntent(question, equipment) {
  const normalized = question.toLowerCase();
  const profileField = borrowerProfileField(normalized);
  if (profileField) {
    return { intent: "my_profile", profileField, category: "", itemQuery: "" };
  }
  const mentionedItem = equipment.find((item) =>
    [item.name, item.id, item.tag]
      .filter((value) => typeof value === "string" && value.trim())
      .some((value) => normalized.includes(value.toLowerCase())),
  );
  const mentionedCategory = [...new Set(
    equipment
      .map((item) => item.category)
      .filter((category) => typeof category === "string" && category.trim()),
  )].find((category) =>
    normalized.includes(category.toLowerCase()) ||
    normalized.includes(normalizeCategory(category)),
  ) || "";

  if (/\b(deadline|due date|return date|when .* due)\b/.test(normalized)) {
    return { intent: "my_loan_deadlines", category: "", itemQuery: "" };
  }
  if (
    /\b(?:my|mine|me|i)\b.{0,35}\b(?:loans?|requests?|borrowed|borrowing|checked out)\b|\bwhat (?:did|have) i borrow\b/.test(
      normalized,
    )
  ) {
    return { intent: "my_loans", category: "", itemQuery: "" };
  }
  const hasInventoryContext =
    Boolean(mentionedItem || mentionedCategory) ||
    /\b(equipment|items?|inventory|stock|borrow|request|recommend|suggest|tools?|devices?)\b/.test(
      normalized,
    ) ||
    /\b(what|which)\b.{0,30}\bavailable\b|\bwhat can i borrow\b/.test(
      normalized,
    );
  if (!hasInventoryContext) {
    return { intent: "unknown", category: "", itemQuery: "" };
  }
  if (/\b(how.*borrow|borrow.*item|how.*request)\b/.test(normalized)) {
    return { intent: "how_to_borrow", category: "", itemQuery: "" };
  }
  if (/\b(status|condition|where is|is .* available)\b/.test(normalized)) {
    return {
      intent: "item_status",
      category: mentionedCategory,
      itemQuery: mentionedItem?.name || "",
    };
  }
  if (/\b(available|in stock|what can i borrow)\b/.test(normalized)) {
    return {
      intent: "available_items",
      category: mentionedCategory,
      itemQuery: mentionedItem?.name || "",
    };
  }
  if (
    mentionedItem ||
    (mentionedCategory &&
      /\b(?:tell me about|describe|explain|details?|information|features?|specs?|specifications?|what (?:is|are)|which)\b/.test(
        normalized,
      ))
  ) {
    return {
      intent: "item_question",
      category: mentionedCategory,
      itemQuery: mentionedItem?.name || "",
    };
  }
  if (
    /\b(?:list|show|catalog|inventory|all items|items list)\b|\b(?:what|which)\s+(?:items?|equipment|tools?|devices?)\b/.test(
      normalized,
    )
  ) {
    return {
      intent: "inventory_list",
      category: mentionedCategory,
      itemQuery: mentionedItem?.name || "",
    };
  }
  if (
    /\b(suggest|recommend|what should i borrow|item for me|i need|looking for|want to borrow)\b/.test(
      normalized,
    )
  ) {
    return {
      intent: "suggest_item",
      category: mentionedCategory,
      itemQuery: mentionedItem?.name || "",
    };
  }
  return { intent: "unknown", category: "", itemQuery: "" };
}

function borrowerProfileField(question) {
  const normalized = question.toLowerCase();
  if (/\bmy\s+(?:full\s+)?name\b|\bwhat\s+is\s+my\s+name\b/.test(normalized)) {
    return "name";
  }
  if (/\bmy\s+(?:email|email address)\b|\bwhat email (?:do i use|is on my account)\b/.test(normalized)) {
    return "email";
  }
  if (/\bmy\s+role\b|\bam i (?:a )?(?:student|faculty)\b/.test(normalized)) {
    return "role";
  }
  if (/\bmy\s+(?:id|identification|student)\s+number\b/.test(normalized)) {
    return "idNumber";
  }
  if (
    /\bmy\s+(?:college|course|program|major)\b|\bwhat (?:course|program|major|college) am i (?:taking|in|studying)\b/.test(
      normalized,
    )
  ) {
    return "college";
  }
  if (/\bmy\s+year(?:\s+level)?\b/.test(normalized)) {
    return "yearLevel";
  }
  if (/\bmy\s+(?:block|section)\b/.test(normalized)) {
    return "block";
  }
  const asksAboutGender =
    /\bmy\s+gender\b|\bwhat(?:'s| is)?\s+gender\s+(?:am i|i am|i'm)\b|\bwhat is my gender\b/.test(
      normalized,
    );
  const asksAboutOrientation =
    /\b(?:gay|lesbian|bisexual|straight|queer|asexual|pansexual|sexual orientation|sexuality)\b/.test(
      normalized,
    );
  if (asksAboutGender && asksAboutOrientation) {
    return "gender_orientation";
  }
  if (asksAboutGender) {
    return "gender";
  }
  if (
    asksAboutOrientation &&
    /\b(?:am i|i am|i'm|my)\b.{0,30}\b(?:gay|lesbian|bisexual|straight|queer|asexual|pansexual|sexual orientation|sexuality)\b/.test(
      normalized,
    )
  ) {
    return "orientation";
  }
  if (
    /\bwho am i\b|\bmy profile\b|\bmy account details\b|\bmy information\b|\bwhat do you know about me\b|\btell me about myself\b/.test(
      normalized,
    )
  ) {
    return "summary";
  }
  return "";
}

function normalizeCategory(category) {
  const normalized = category.trim().toLowerCase();
  return normalized.endsWith("s") ? normalized.slice(0, -1) : normalized;
}

function findInventoryCategory(candidate, equipment) {
  if (typeof candidate !== "string" || !candidate.trim()) return "";
  const normalized = normalizeCategory(candidate);
  return [...new Set(
    equipment
      .map((item) => item.category)
      .filter((category) => typeof category === "string" && category.trim()),
  )].find((category) => normalizeCategory(category) === normalized) || "";
}

function isBorrowerDomainQuestion(question, equipment) {
  return fallbackBorrowerIntent(question, equipment).intent !== "unknown";
}

function categoryMatches(item, category) {
  if (!category) return true;
  return `${item.category || ""} ${item.name || ""}`
    .toLowerCase()
    .includes(category.toLowerCase());
}

function availableItems(equipment, activeLoans, category, itemQuery = "") {
  const borrowedIds = new Set(
    activeLoans
      .filter((loan) => activeLoanStatuses.has(loan.status))
      .map((loan) => loan.equipmentId)
      .filter((id) => typeof id === "string"),
  );
  const normalizedQuery = itemQuery.trim().toLowerCase();
  return equipment
    .filter(
      (item) =>
        !item.maintenance &&
        !borrowedIds.has(item.id) &&
        categoryMatches(item, category) &&
        (!normalizedQuery ||
          `${item.name || ""} ${item.category || ""} ${item.id || ""} ${item.tag || ""}`
            .toLowerCase()
            .includes(normalizedQuery)),
    )
    .sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || "")),
    );
}

function itemStatus(item, activeLoans) {
  if (item.maintenance === true) return "In Maintenance";
  const loans = activeLoans.filter((loan) => loan.equipmentId === item.id);
  if (loans.some((loan) => loan.status === "return_pending")) {
    return "Return Pending";
  }
  if (loans.some((loan) => loan.status === "approved")) return "Borrowed";
  return "Available";
}

function loanStatusLabel(loan) {
  if (loan.status === "approved" && loan.checkedOutAt) return "Borrowed";
  switch (loan.status) {
    case "pending":
      return "Pending approval";
    case "approved":
      return "Approved";
    case "return_pending":
      return "Return awaiting verification";
    case "returned":
      return "Returned";
    case "rejected":
      return "Rejected";
    case "cancelled":
      return "Cancelled";
    default:
      return "Unknown status";
  }
}

function matchingItems(equipment, category, itemQuery) {
  const normalizedQuery = (itemQuery || "").trim().toLowerCase();
  return equipment.filter((item) => {
    const categoryMatches = !category ||
      `${item.category || ""} ${item.name || ""}`
        .toLowerCase()
        .includes(category.toLowerCase());
    const queryMatches = !normalizedQuery ||
      `${item.name || ""} ${item.category || ""} ${item.id || ""} ${item.tag || ""}`
        .toLowerCase()
        .includes(normalizedQuery);
    return categoryMatches && queryMatches;
  });
}

function formatDueDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return "no due date saved";
  }
  const date = new Date(`${value}T00:00:00+08:00`);
  if (Number.isNaN(date.getTime())) return "no due date saved";
  return new Intl.DateTimeFormat("en-PH", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Manila",
  }).format(date);
}

function buildBorrowerProfileAnswer(profileField, profile = {}) {
  if (profileField === "orientation") {
    return "Your Lendy profile does not store sexual orientation, so I can't determine whether you are gay.";
  }
  if (profileField === "gender_orientation") {
    const gender = typeof profile.gender === "string" && profile.gender.trim()
      ? `Your Lendy profile lists your gender as ${profile.gender.trim()}. `
      : "Your Lendy profile does not list a gender. ";
    return `${gender}Gender is different from sexual orientation, and your profile does not store sexual orientation, so I can't determine whether you are gay.`;
  }

  const fields = {
    name: ["name", "name"],
    email: ["email", "email address"],
    role: ["role", "role"],
    idNumber: ["idNumber", "ID number"],
    college: ["college", "college or course"],
    yearLevel: ["yearLevel", "year level"],
    block: ["block", "block"],
    gender: ["gender", "gender"],
  };
  if (profileField === "summary") {
    const details = [
      typeof profile.name === "string" && profile.name.trim()
        ? `Name: ${profile.name.trim()}`
        : "",
      typeof profile.role === "string" && profile.role.trim()
        ? `Role: ${profile.role.trim()}`
        : "",
      typeof (profile.college || profile.course) === "string" &&
          (profile.college || profile.course).trim()
        ? `College/course: ${(profile.college || profile.course).trim()}`
        : "",
      typeof profile.yearLevel === "string" && profile.yearLevel.trim()
        ? `Year level: ${profile.yearLevel.trim()}`
        : "",
      typeof profile.block === "string" && profile.block.trim()
        ? `Block: ${profile.block.trim()}`
        : "",
    ].filter(Boolean);
    return details.length
      ? `Here is the profile information on your account:\n${details.join("\n")}`
      : "Your Lendy profile does not have those details saved yet.";
  }

  const field = fields[profileField];
  if (!field) {
    return "I can answer questions about the profile information on your own Lendy account.";
  }
  const [key, label] = field;
  const value = profile[key] || (key === "college" ? profile.course : "");
  if (typeof value !== "string" || !value.trim()) {
    return `Your ${label} is not listed in your Lendy profile.`;
  }
  const displayValue = key === "role"
    ? value.charAt(0).toUpperCase() + value.slice(1)
    : value.trim();
  return `Your ${label} on your Lendy profile is ${displayValue}.`;
}

function buildItemQuestionAnswer({
  category = "",
  itemQuery = "",
  equipment = [],
  activeLoans = [],
}) {
  const matches = matchingItems(equipment, category, itemQuery).slice(0, 5);
  if (matches.length === 0) {
    return itemQuery
      ? `I couldn't find an item matching "${itemQuery}" in the Lendy inventory.`
      : "I couldn't find a matching item in the Lendy inventory.";
  }
  const details = matches.map((item) => {
    const facts = [
      item.category,
      item.tag ? `Code: ${item.tag}` : "",
      item.location ? `Location: ${item.location}` : "",
      `Status: ${itemStatus(item, activeLoans)}`,
      item.brand,
      item.model,
      item.condition,
      item.description,
      item.specifications || item.specs,
      Array.isArray(item.features) ? item.features.join(", ") : item.features,
    ].filter((value) => typeof value === "string" && value.trim());
    return `${item.name || "Unnamed item"} — ${facts.join("; ")}`;
  });
  return `Here is the information recorded in Lendy:\n${details.join("\n")}\nI can only confirm details saved in the inventory.`;
}

function buildBorrowerAssistantAnswer({
  intent,
  category = "",
  itemQuery = "",
  equipment = [],
  activeLoans = [],
  personalLoans = [],
  profileField = "",
  personalProfile = {},
  answer = "",
}) {
  if (intent === "my_profile") {
    return buildBorrowerProfileAnswer(profileField, personalProfile);
  }

  if (intent === "how_to_borrow") {
    return "Open Browse, choose an available item, and tap Request. Select your borrow and return dates, then submit the request. You can track its approval in Loans. After approval, check out the item and report its return when you are done.";
  }

  if (intent === "my_loan_deadlines") {
    const loans = personalLoans
      .filter((loan) => activeLoanStatuses.has(loan.status))
      .sort((a, b) => String(a.end || "").localeCompare(String(b.end || "")));
    if (loans.length === 0) {
      return "You have no active loans with a return deadline right now.";
    }
    return `Your active loan deadlines:\n${loans
      .map(
        (loan) =>
          `${loan.name || "Unnamed item"} — due ${formatDueDate(loan.end)}`,
      )
      .join("\n")}`;
  }

  if (intent === "my_loans") {
    const loans = [...personalLoans]
      .sort((a, b) => String(b.start || "").localeCompare(String(a.start || "")))
      .slice(0, 20);
    if (loans.length === 0) {
      return "I couldn't find any loan or request records for your account.";
    }
    return `Your Lendy loan/request records:\n${loans
      .map((loan) => {
        const dueDate = loan.end ? ` — return date ${formatDueDate(loan.end)}` : "";
        return `${loan.name || "Unnamed item"} — ${loanStatusLabel(loan)}${dueDate}`;
      })
      .join("\n")}${personalLoans.length > loans.length ? "\nShowing the 20 most recent records." : ""}`;
  }

  if (intent === "item_question") {
    return answer.trim() || buildItemQuestionAnswer({
      category,
      itemQuery,
      equipment,
      activeLoans,
    });
  }

  if (intent === "inventory_list" || intent === "item_status") {
    const matches = matchingItems(equipment, category, itemQuery);
    if (matches.length === 0) {
      return itemQuery
        ? `I couldn't find an inventory item matching "${itemQuery}". Check the item name or code and try again.`
        : "There are no items in the equipment inventory right now.";
    }
    if (intent === "item_status" && matches.length === 1) {
      return `${matches[0].name || "This item"} is currently ${itemStatus(matches[0], activeLoans)}.`;
    }
    const shown = Math.min(matches.length, 20);
    return `Here are ${shown} inventory item(s) and their current status.${matches.length > shown ? " Showing the first 20 matches." : ""}`;
  }

  if (intent === "available_items" || intent === "suggest_item") {
    const matches = availableItems(equipment, activeLoans, category, itemQuery);
    if (intent === "available_items") {
      const description = category
        ? ` matching "${category}"`
        : itemQuery
          ? ` matching "${itemQuery}"`
          : "";
      if (matches.length === 0) {
        return `There are no available items${description} right now.`;
      }
      return `${matches.length} item(s) available${description}. Choose one below to request it.`;
    }

    if (matches.length === 0) {
      return category
        ? `There are no available items matching "${category}" right now. Try asking what items are available.`
        : "There are no available items to suggest right now.";
    }
    return "Here are some available matches. Tap Request on an item to choose your dates.";
  }

  return "I can help with Lendy's equipment, your profile, and your own loan/request records. I can only confirm information saved in Lendy, so I won't guess when a detail isn't available.";
}

function buildBorrowerAssistantResponse(input) {
  const answer = buildBorrowerAssistantAnswer(input);
  const availableItemResults =
    input.intent === "available_items" || input.intent === "suggest_item"
      ? availableItems(
          input.equipment,
          input.activeLoans,
          input.category,
          input.itemQuery,
        )
          .slice(0, input.intent === "suggest_item" ? 5 : 20)
      : [];
  const itemResults =
    input.intent === "inventory_list" || input.intent === "item_status"
      ? matchingItems(input.equipment, input.category, input.itemQuery)
          .slice(0, 20)
      : input.intent === "item_question" && Array.isArray(input.itemIds)
        ? input.equipment.filter((item) => input.itemIds.includes(item.id))
            .slice(0, 10)
      : input.intent === "item_question"
        ? matchingItems(input.equipment, input.category, input.itemQuery).slice(0, 5)
      : availableItemResults;
  const items = itemResults.map((item) => ({
    id: item.id,
    name: item.name || "Unnamed item",
    category: item.category || "",
    location: item.location || "",
    tag: item.tag || "",
    status: itemStatus(item, input.activeLoans),
  }));
  return { answer, items };
}

module.exports = {
  buildBorrowerAssistantResponse,
  borrowerProfileField,
  findInventoryCategory,
  fallbackBorrowerIntent,
  isBorrowerDomainQuestion,
  itemStatus,
};
