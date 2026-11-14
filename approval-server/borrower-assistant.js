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

  if (/\b(deadline|due date|return date|my loans|my borrowings)\b/.test(normalized)) {
    return { intent: "my_loan_deadlines", category: "", itemQuery: "" };
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
    /\b(list|show|what|which|catalog|inventory|all items|items list)\b/.test(
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
  if (/\bmy\s+gender\b/.test(normalized)) {
    return "gender";
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

function buildBorrowerAssistantAnswer({
  intent,
  category = "",
  itemQuery = "",
  equipment = [],
  activeLoans = [],
  personalLoans = [],
  profileField = "",
  personalProfile = {},
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

  return "I can only answer questions using Lendy's equipment and loan data. Ask what items are in the inventory, which are available, or the current status of an item.";
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
};
