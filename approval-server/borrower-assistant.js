"use strict";

const activeLoanStatuses = new Set(["approved", "return_pending"]);

function borrowerAnswerLanguage(question) {
  return /\b(?:ano|anong|paano|pano|sino|alin|saan|kailan|kelan|ko|ako|akin|mo|mga|pwede|puwede|pwedeng|puwedeng|hiram|hiramin|hihiram|ibalik|kailangan|gusto|hanap|meron|mayroon|yung|dapat|hindi|ba|pangalan|kasarian|edad|po|opo|salamat|maraming|kumusta|kamusta|musta|magandang|humiram|manghiram|paghiram|nahiram|naibalik|tulong|ilan|nasaan|lampas|lagpas)\b/i.test(
    question,
  )
    ? "filipino"
    : "english";
}

const GREETING_PHRASES = [
  "good (?:morning|afternoon|evening|day|noon)",
  "magandang (?:umaga|tanghali|hapon|gabi|araw)",
  "how are (?:you|u)(?: doing)?",
  "how's it going",
  "what's up",
  "whats up",
  "hello",
  "hiya",
  "howdy",
  "hola",
  "greetings",
  "hey",
  "hi",
  "yo",
  "uy",
  "oy",
  "sup",
  "kumusta",
  "kamusta",
  "musta",
];
const THANKS_PHRASES = [
  "maraming salamat",
  "many thanks",
  "much appreciated",
  "appreciate it",
  "thank you",
  "thank u",
  "thankyou",
  "thanks",
  "thx",
  "tnx",
  "ty",
  "salamat",
  "cheers",
];
const FAREWELL_PHRASES = [
  "good ?bye",
  "bye(?: bye)?",
  "see (?:you|ya)(?: later)?",
  "take care",
  "paalam",
  "ingat",
];
const CONVERSATION_FILLERS = [
  "so much",
  "very much",
  "a lot",
  "sa tulong mo",
  "sa tulong",
  "for the help",
  "for your help",
  "for helping",
  "po",
  "opo",
  "ho",
  "lendy",
  "assistant",
  "bot",
  "there",
  "everyone",
  "all",
  "na",
  "ka",
  "kayo",
  "naman",
  "ba",
  "ngayon",
  "today",
  "much",
  "marami",
  "sobra",
  "talaga",
  "ha",
  "ah",
  "again",
  "din",
  "rin",
  "ok",
  "okay",
  "sige",
  "great",
  "got it",
  "kuya",
  "ate",
  "sir",
  "ma'am",
  "maam",
];
const HELP_REQUEST =
  /^(?:please |pls )?(?:help(?: me)?|tulong|tulungan mo ako|what can you (?:do|help (?:me )?with)|how can you help(?: me)?|how do you work|ano(?: ang)?(?: kaya)?(?: mong gawin|(?: ang)? magagawa mo)|paano mo ako matutulungan)(?: po)?$/;

function normalizeConversationText(question) {
  return String(question || "")
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^\p{L}\p{N}'\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripPhrases(text, phrases) {
  let value = ` ${text} `;
  let changed = true;
  while (changed) {
    changed = false;
    for (const phrase of phrases) {
      const next = value.replace(new RegExp(` (?:${phrase})(?= )`, "g"), "");
      if (next !== value) {
        value = next;
        changed = true;
      }
    }
  }
  return value.trim();
}

function conversationalIntent(question) {
  const text = normalizeConversationText(question);
  if (!text || text.length > 60) return "";
  if (HELP_REQUEST.test(text)) return "help";
  const groups = [
    ["thanks", THANKS_PHRASES],
    ["farewell", FAREWELL_PHRASES],
    ["greeting", GREETING_PHRASES],
  ];
  const matched = groups.filter(
    ([, phrases]) => stripPhrases(text, phrases) !== text,
  );
  if (matched.length === 0) return "";
  const everything = groups.flatMap(([, phrases]) => phrases)
    .concat(CONVERSATION_FILLERS);
  return stripPhrases(text, everything) === "" ? matched[0][0] : "";
}

function manilaToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function itemDetailField(question) {
  const normalized = String(question || "").toLowerCase();
  if (/\b(?:brand|brands|manufacturer|tatak|marka|gawa ng)\b/.test(normalized)) {
    return "brand";
  }
  if (/\bmodel(?: number| name)?\b/.test(normalized)) return "model";
  if (
    /\b(?:condition|kondisyon|kalagayan|gumagana|sira|damaged|maayos)\b/.test(
      normalized,
    )
  ) {
    return "condition";
  }
  if (
    /\b(?:specs?|specifications?|features?|resolution|megapixels?|lumens|battery)\b/.test(
      normalized,
    )
  ) {
    return "specs";
  }
  return "";
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function brandCandidates(equipment) {
  const brands = new Map();
  for (const item of equipment) {
    const brand = typeof item.brand === "string" ? item.brand.trim() : "";
    if (brand) {
      brands.set(brand.toLowerCase(), brand);
    }
  }
  return [...brands.values()];
}

function mentionedBrandOf(normalizedQuestion, equipment) {
  return brandCandidates(equipment)
    .filter((brand) =>
      new RegExp(`\\b${escapeRegExp(brand.toLowerCase())}\\b`).test(
        normalizedQuestion,
      ),
    )
    .sort((a, b) => b.length - a.length)[0] || "";
}

function itemSearchMatch(item, query) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (!normalizedQuery) return true;
  const haystack = [
    item.name,
    item.category,
    item.id,
    item.tag,
    item.brand,
    item.model,
  ]
    .filter((value) => typeof value === "string" || typeof value === "number")
    .join(" ")
    .toLowerCase();
  if (haystack.includes(normalizedQuery)) return true;
  const tokens = normalizedQuery.split(/\s+/).filter((token) => token.length >= 2);
  return (
    tokens.length > 0 &&
    tokens.every(
      (token) =>
        haystack.includes(token) ||
        (token.length > 3 && token.endsWith("s") && haystack.includes(token.slice(0, -1))),
    )
  );
}

function brandItemQuery(question) {
  const ignoredWords = new Set([
    "a", "an", "and", "any", "are", "about", "available", "ba", "brand",
    "brands", "can", "do", "does", "equipment", "for", "gawa", "have",
    "has", "in", "inventory", "is", "it", "item", "items", "kayo", "ko",
    "ma", "marka", "may", "meron", "mo", "mga", "manufacturer", "naman",
    "na", "ng", "ninyo", "namin", "of", "our", "please", "sa", "stock",
    "tatak", "the", "this", "that", "to", "what", "which", "with", "you",
    "your", "yung", "ano", "ang", "anong", "akin", "ako",
  ]);
  return normalizeConversationText(question)
    .split(" ")
    .filter((word) => word && !ignoredWords.has(word))
    .join(" ");
}

function fallbackBorrowerIntent(question, equipment) {
  const conversational = conversationalIntent(question);
  if (conversational) {
    return { intent: conversational, category: "", itemQuery: "" };
  }
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
  const mentionedBrand = mentionedBrandOf(normalized, equipment);
  const mentionedCategory = [...new Set(
    equipment
      .map((item) => item.category)
      .filter((category) => typeof category === "string" && category.trim()),
  )].find((category) =>
    normalized.includes(category.toLowerCase()) ||
    normalized.includes(normalizeCategory(category)),
  ) || "";
  const detailField = itemDetailField(normalized);
  const detailQuery = detailField === "brand" ? brandItemQuery(normalized) : "";
  const queryValue =
    mentionedItem?.name ||
    mentionedBrand ||
    (mentionedCategory ? "" : detailQuery);

  if (
    /\b(deadlines?|due dates?|return dates?|when .* due)\b|\b(?:kailan|kelan)\b.{0,40}\b(?:due|deadline|ibalik\w*|ibabalik|return)\b|\boverdue\b|\bpast due\b|\blampas\b|\blagpas\b|\bhanggang kailan\b|\bwhen\b.{0,20}\b(?:do|should|must|can|will|am) i\b.{0,25}\b(?:return|give back|bring back)\b/.test(
      normalized,
    )
  ) {
    return { intent: "my_loan_deadlines", category: "", itemQuery: "" };
  }
  if (
    /\b(?:my|mine|me|i)\b.{0,35}\b(?:loans?|requests?|borrowed|borrowing|checked out)\b|\bwhat (?:did|have) i borrow\b|\b(?:mga )?(?:loan|request) ko\b|\b(?:ano|anong) (?:mga )?(?:loan|request)s? ko\b|\bhiniram ko\b|\bnahiram ko\b|\bnirequest ko\b|\b(?:loans?|requests?) ko\b|\b(?:loan|borrow|request) history\b|\bmy history\b|\bhistory ko\b|\b(?:active|current|pending|approved|returned) (?:loans?|requests?)\b/.test(
      normalized,
    )
  ) {
    return { intent: "my_loans", category: "", itemQuery: "" };
  }
  const asksAboutMaintenance =
    /\b(?:maintenance|under repair|being repaired|for repair)\b/.test(
      normalized,
    );
  if (asksAboutMaintenance) {
    return mentionedItem
      ? {
          intent: "item_status",
          category: mentionedCategory,
          itemQuery: mentionedItem.name,
        }
      : {
          intent: "maintenance_items",
          category: mentionedCategory,
          itemQuery: "",
        };
  }
  if (
    detailField &&
    (mentionedItem ||
      mentionedCategory ||
      mentionedBrand ||
      detailQuery ||
      /\b(?:equipment|items?|inventory|tools?|devices?|gamit|kagamitan)\b/.test(
        normalized,
      ))
  ) {
    return {
      intent: "item_details",
      category: mentionedCategory,
      itemQuery: queryValue,
    };
  }
  const hasInventoryContext =
    Boolean(mentionedItem || mentionedCategory || mentionedBrand) ||
    /\b(equipment|items?|inventory|stock|borrow|request|recommend|suggest|tools?|devices?|hiram|hiramin|hihiram|humiram|manghiram|manghihiram|paghiram|hiraman|gamit|kagamitan)\b/.test(
      normalized,
    ) ||
    /\b(what|which)\b.{0,30}\bavailable\b|\bwhat can i borrow\b|\b(?:ano|anong|alin)\b.{0,40}\b(?:available|pwedeng hiramin|puwedeng hiramin|hiramin)\b/.test(
      normalized,
    );
  if (!hasInventoryContext) {
    return { intent: "unknown", category: "", itemQuery: "" };
  }
  if (
    /\b(how.*borrow|borrow.*item|how.*request|(?:paano|pano).*(?:hiram|humiram|manghiram|paghiram|borrow|request)|mag-?borrow|mag-?request)\b/.test(
      normalized,
    )
  ) {
    return { intent: "how_to_borrow", category: "", itemQuery: "" };
  }
  if (/\b(status|condition|is .* available)\b/.test(normalized)) {
    return {
      intent: "item_status",
      category: mentionedCategory,
      itemQuery: queryValue,
    };
  }
  if (
    /\b(available|in stock|what can i borrow|may .* available|ano .* available)\b|\b(?:pwede|puwede)\b.{0,25}\bhiramin\b|\b(?:can|may|could) i (?:borrow|request|get)\b|\b(?:do you have|is there|are there)\b|\b(?:meron|mayroon)\s+(?:ba|bang)\b|\bmay\b.{0,30}\bba\b/.test(
      normalized,
    )
  ) {
    return {
      intent: "available_items",
      category: mentionedCategory,
      itemQuery: queryValue,
    };
  }
  if (
    /\b(suggest|recommend|what should i borrow|item for me|i need|looking for|want to borrow|kailangan ko|hanap ko|gusto kong hiramin|gusto ko manghiram|pwede ko bang hiramin|puwede ko bang hiramin|help me (?:find|choose|pick|get)|find me|ipahanap|hanapan mo ako|humanap)\b|\b(?:gusto|nais|balak|plano)\b.{0,20}\b(?:humiram|manghiram|hiramin)\b|\b(?:pwede|puwede)\b.{0,25}\b(?:humiram|manghiram)\b/.test(
      normalized,
    )
  ) {
    return {
      intent: "suggest_item",
      category: mentionedCategory,
      itemQuery: queryValue,
    };
  }
  if (mentionedBrand && !mentionedItem) {
    return {
      intent: "item_details",
      category: mentionedCategory,
      itemQuery: mentionedBrand,
    };
  }
  if (
    mentionedItem ||
    (mentionedCategory &&
      /\b(?:tell me about|describe|explain|details?|information|features?|specs?|specifications?|what (?:is|are)|which|where|saan|nasaan)\b/.test(
        normalized,
      ))
  ) {
    return {
      intent: "item_question",
      category: mentionedCategory,
      itemQuery: queryValue,
    };
  }
  if (
    /\b(?:list|show|catalog|inventory|all items|items list)\b|\b(?:what|which)\s+(?:items?|equipment|tools?|devices?)\b|\b(?:ano|anong|alin|ipakita)\b.{0,40}\b(?:mga )?(?:item|gamit|kagamitan|camera|projector|laptop|tablet)s?\b/.test(
      normalized,
    )
  ) {
    return {
      intent: "inventory_list",
      category: mentionedCategory,
      itemQuery: queryValue,
    };
  }
  return { intent: "unknown", category: "", itemQuery: "" };
}

function borrowerProfileField(question) {
  const normalized = question.toLowerCase();
  if (
    /\bmy\s+(?:full\s+)?name\b|\bwhat\s+is\s+my\s+name\b|\b(?:ano|anong)\s+(?:ang\s+)?pangalan\s+ko\b|\bpangalan ko\b/.test(
      normalized,
    )
  ) {
    return "name";
  }
  if (
    /\bmy\s+(?:email|email address)\b|\bwhat email (?:do i use|is on my account)\b|\b(?:ano|anong)\s+(?:ang\s+)?email ko\b|\bemail ko\b/.test(
      normalized,
    )
  ) {
    return "email";
  }
  if (
    /\bmy\s+role\b|\bam i (?:a )?(?:student|faculty)\b|\b(?:ano|anong)\s+(?:ang\s+)?role ko\b|\bstudent ba ako\b|\bfaculty ba ako\b|\brole ko\b/.test(
      normalized,
    )
  ) {
    return "role";
  }
  if (
    /\bmy\s+(?:id|identification|student)\s+number\b|\b(?:ano|anong)\s+(?:ang\s+)?(?:id|student) number ko\b|\bmy\s+(?:student\s+)?id\b|\b(?:student\s+)?(?:id|id number|student number) ko\b/.test(
      normalized,
    )
  ) {
    return "idNumber";
  }
  if (
    /\bmy\s+(?:college|course|program|major)\b|\bwhat (?:course|program|major|college) am i (?:taking|in|studying)\b|\b(?:ano|anong)\s+(?:ang\s+)?(?:college|course|program|major) ko\b|\b(?:college|course|program|major) ko\b/.test(
      normalized,
    )
  ) {
    return "college";
  }
  if (/\bmy\s+year(?:\s+level)?\b|\b(?:ano|anong)\s+(?:ang\s+)?year(?: level)? ko\b|\bwhat year(?: level)? am i\b|\byear(?: level)? ko\b/.test(normalized)) {
    return "yearLevel";
  }
  if (/\bmy\s+(?:block|section)\b|\b(?:ano|anong)\s+(?:ang\s+)?(?:block|section) ko\b|\bwhat (?:block|section) am i\b|\b(?:block|section) ko\b/.test(normalized)) {
    return "block";
  }
  const asksAboutGender =
    /\bmy\s+gender\b|\bwhat(?:'s| is)?\s+gender\s+(?:am i|i am|i'm)\b|\bwhat is my gender\b|\b(?:ano|anong)\s+(?:ang\s+)?(?:gender|kasarian) ko\b/.test(
      normalized,
    );
  const asksAboutOrientation =
    /\b(?:gay|lesbian|bisexual|straight|queer|asexual|pansexual|sexual orientation|sexuality|bakla|tomboy)\b/.test(
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
    /\b(?:am i|i am|i'm|my|ako)\b.{0,30}\b(?:gay|lesbian|bisexual|straight|queer|asexual|pansexual|sexual orientation|sexuality|bakla|tomboy)\b|\b(?:gay|lesbian|bisexual|straight|queer|asexual|pansexual|bakla|tomboy)\b.{0,20}\bako\b/.test(
      normalized,
    )
  ) {
    return "orientation";
  }
  if (
    /\b(?:account|profile)\s+status\b|\bstatus\s+(?:ng|of)\s+(?:my|account ko)\b|\bactive ba (?:ang )?account ko\b|\bis my account active\b|\baccount ko ba ay active\b/.test(
      normalized,
    )
  ) {
    return "accountStatus";
  }
  if (
    /\bhow old am i\b|\bmy age\b|\bdate of birth\b|\bmy birthday\b|\bmy phone(?: number)?\b|\bmy address\b|\bmy height\b|\bedad ko\b|\b(?:ano|anong) (?:ang )?(?:edad|birthday|phone number|address) ko\b|\bilang taon na ako\b/.test(
      normalized,
    )
  ) {
    return "notStored";
  }
  if (
    /\b(?:my|account)\s+password\b|\bpassword ko\b|\b(?:ano|anong)\s+(?:ang\s+)?password ko\b/.test(
      normalized,
    )
  ) {
    return "credentials";
  }
  if (
    /\b(?:my|account)\s+(?:profile )?(?:photo|picture|image|avatar)\b|\b(?:profile )?(?:photo|picture|image|avatar) ko\b|\bdo i have (?:a )?(?:profile )?(?:photo|picture|image|avatar)\b|\blarawan ko\b/.test(
      normalized,
    )
  ) {
    return "profilePhoto";
  }
  if (
    /\bwho am i\b|\bmy profile\b|\bmy account details\b|\bmy (?:personal )?(?:information|info|data|details)\b|\bwhat do you know about me\b|\beverything you know about me\b|\bwhat (?:information|info|data|details) (?:do you have|is saved|do you store) about me\b|\b(?:what|tell me|show me|list) .{0,30}(?:information|info|details|data).{0,30}(?:about me|my account|my profile)\b|\btell me about myself\b|\blist all my (?:account )?(?:details|information|info)\b|\bsino ako\b|\b(?:ano|anong)\b.{0,50}\b(?:info|information|details|data)\b.{0,50}\b(?:ko|akin|account ko|profile ko)\b|\b(?:lahat ng )?(?:info|information|details|data) ng profile ko\b|\bprofile ko\b|\banong alam mo tungkol sa akin\b|\binformation about my account\b/.test(
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
        (!normalizedQuery || itemSearchMatch(item, normalizedQuery)),
    )
    .sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || "")),
    );
}

function itemStatus(item, activeLoans = []) {
  if (item.maintenance === true) return "In Maintenance";
  const loans = activeLoans.filter((loan) => loan.equipmentId === item.id);
  if (loans.some((loan) => loan.status === "return_pending")) {
    return "Return Pending";
  }
  if (loans.some((loan) => loan.status === "approved" && loan.checkedOutAt)) {
    return "Borrowed";
  }
  if (loans.some((loan) => loan.status === "approved")) return "Reserved";
  return "Available";
}

function loanStatusLabel(loan, language = "english") {
  const filipino = language === "filipino";
  if (loan.status === "approved" && loan.checkedOutAt) {
    return filipino ? "Nahiram" : "Borrowed";
  }
  switch (loan.status) {
    case "pending":
      return filipino ? "Pending ng approval" : "Pending approval";
    case "approved":
      return filipino ? "Naaprubahan" : "Approved";
    case "return_pending":
      return filipino ? "Naghihintay ng return verification" : "Return awaiting verification";
    case "returned":
      return filipino ? "Naibalik" : "Returned";
    case "rejected":
      return filipino ? "Tinanggihan" : "Rejected";
    case "cancelled":
      return filipino ? "Kinansela" : "Cancelled";
    default:
      return filipino ? "Hindi alam ang status" : "Unknown status";
  }
}

function matchingItems(equipment, category, itemQuery) {
  const normalizedQuery = (itemQuery || "").trim().toLowerCase();
  return equipment.filter((item) => {
    const categoryMatches = !category ||
      `${item.category || ""} ${item.name || ""}`
        .toLowerCase()
        .includes(category.toLowerCase());
    const queryMatches = !normalizedQuery || itemSearchMatch(item, normalizedQuery);
    return categoryMatches && queryMatches;
  });
}

function isOverdue(end, today) {
  return typeof end === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(end) &&
    typeof today === "string" &&
    end < today;
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

function buildBorrowerProfileAnswer(
  profileField,
  profile = {},
  language = "english",
) {
  const filipino = language === "filipino";
  if (profileField === "notStored") {
    return filipino
      ? "Walang naka-save na impormasyong iyon sa Lendy profile mo."
      : "That information is not saved in your Lendy profile.";
  }
  if (profileField === "credentials") {
    return filipino
      ? "Hindi ko makikita o maibibigay ang password mo. Para mapalitan ito, gamitin ang Forgot Password o ang password settings sa account mo."
      : "I can't view or provide your password. Use Forgot Password or your account's password settings to change it.";
  }
  if (profileField === "profilePhoto") {
    const hasPhoto = typeof profile.profileImage === "string" &&
      profile.profileImage.startsWith("data:image/");
    return filipino
      ? hasPhoto
        ? "May naka-save na profile photo sa account mo, pero hindi ko ito nasusuri o nailalarawan sa chat."
        : "Walang naka-save na profile photo sa account mo."
      : hasPhoto
        ? "Your account has a saved profile photo, but I can't inspect or describe it in this chat."
        : "There is no profile photo saved on your account.";
  }
  if (profileField === "orientation") {
    return filipino
      ? "Walang naka-save na sexual orientation sa Lendy profile mo, kaya hindi ko masasabi kung gay ka o hindi."
      : "Your Lendy profile does not store sexual orientation, so I can't determine whether you are gay.";
  }
  if (profileField === "gender_orientation") {
    const gender = typeof profile.gender === "string" && profile.gender.trim()
      ? filipino
        ? `Ayon sa Lendy profile mo, ${profile.gender.trim()} ang gender mo. `
        : `Your Lendy profile lists your gender as ${profile.gender.trim()}. `
      : filipino
        ? "Walang nakasave na gender sa Lendy profile mo. "
        : "Your Lendy profile does not list a gender. ";
    return filipino
      ? `${gender}Magkaiba ang gender at sexual orientation. Hindi naka-save sa profile mo ang sexual orientation kaya hindi ko masasabi kung bakla ka o hindi.`
      : `${gender}Gender is different from sexual orientation, and your profile does not store sexual orientation, so I can't determine whether you are gay.`;
  }

  const fields = {
    name: ["name", filipino ? "pangalan" : "name"],
    email: ["email", filipino ? "email" : "email address"],
    role: ["role", "role"],
    idNumber: ["idNumber", "ID number"],
    college: ["college", filipino ? "course/college" : "college or course"],
    yearLevel: ["yearLevel", "year level"],
    block: ["block", "block"],
    gender: ["gender", "gender"],
    accountStatus: ["status", filipino ? "account status" : "account status"],
  };
  if (profileField === "summary") {
    const labels = filipino
      ? {
          name: "Pangalan",
          email: "Email",
          idNumber: "Student ID",
          role: "Role",
          gender: "Gender",
          college: "College/course",
          yearLevel: "Year level",
          block: "Block",
          status: "Account status",
        }
      : {
          name: "Name",
          email: "Email",
          idNumber: "Student ID",
          role: "Role",
          gender: "Gender",
          college: "College/course",
          yearLevel: "Year level",
          block: "Block",
          status: "Account status",
        };
    const details = [
      typeof profile.name === "string" && profile.name.trim()
        ? `${labels.name}: ${profile.name.trim()}`
        : "",
      typeof profile.email === "string" && profile.email.trim()
        ? `${labels.email}: ${profile.email.trim()}`
        : "",
      typeof profile.idNumber === "string" && profile.idNumber.trim()
        ? `${labels.idNumber}: ${profile.idNumber.trim()}`
        : "",
      typeof profile.role === "string" && profile.role.trim()
        ? `${labels.role}: ${profile.role.trim()}`
        : "",
      typeof profile.gender === "string" && profile.gender.trim()
        ? `${labels.gender}: ${profile.gender.trim()}`
        : "",
      typeof (profile.college || profile.course) === "string" &&
          (profile.college || profile.course).trim()
        ? `${labels.college}: ${(profile.college || profile.course).trim()}`
        : "",
      typeof profile.yearLevel === "string" && profile.yearLevel.trim()
        ? `${labels.yearLevel}: ${profile.yearLevel.trim()}`
        : "",
      typeof profile.block === "string" && profile.block.trim()
        ? `${labels.block}: ${profile.block.trim()}`
        : "",
      typeof profile.status === "string" && profile.status.trim()
        ? `${labels.status}: ${profile.status.trim()}`
        : "",
      typeof profile.profileImage === "string" &&
          profile.profileImage.startsWith("data:image/")
        ? filipino
          ? "Profile photo: May naka-save na larawan"
          : "Profile photo: Saved"
        : "",
    ].filter(Boolean);
    return details.length
      ? filipino
        ? `Ito ang impormasyong naka-save sa Lendy profile mo:\n${details.join("\n")}`
        : `Here is the profile information on your account:\n${details.join("\n")}`
      : filipino
        ? "Wala pang naka-save na impormasyon sa Lendy profile mo."
        : "Your Lendy profile does not have those details saved yet.";
  }

  const field = fields[profileField];
  if (!field) {
    return "I can answer questions about the profile information on your own Lendy account.";
  }
  const [key, label] = field;
  const value = profile[key] || (key === "college" ? profile.course : "");
  if (typeof value !== "string" || !value.trim()) {
    return filipino
      ? `Walang naka-save na ${label} sa Lendy profile mo.`
      : `Your ${label} is not listed in your Lendy profile.`;
  }
  const displayValue = key === "role"
    ? value.charAt(0).toUpperCase() + value.slice(1)
    : value.trim();
  return filipino
    ? `Ang ${label} mo na naka-save sa Lendy profile mo ay ${displayValue}.`
    : `Your ${label} on your Lendy profile is ${displayValue}.`;
}

function buildItemQuestionAnswer({
  category = "",
  itemQuery = "",
  equipment = [],
  activeLoans = [],
  language = "english",
}) {
  const filipino = language === "filipino";
  const matches = matchingItems(equipment, category, itemQuery).slice(0, 5);
  if (matches.length === 0) {
    return itemQuery
      ? filipino
        ? `Walang item na tumutugma sa "${itemQuery}" sa Lendy inventory.`
        : `I couldn't find an item matching "${itemQuery}" in the Lendy inventory.`
      : filipino
        ? "Walang nahanap na tumutugmang item sa Lendy inventory."
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
  return filipino
    ? `Ito ang impormasyong naka-save sa Lendy:\n${details.join("\n")}\nAng makukumpirma ko lang ay ang impormasyong naka-save sa inventory.`
    : `Here is the information recorded in Lendy:\n${details.join("\n")}\nI can only confirm details saved in the inventory.`;
}

function itemDetailValue(item, field) {
  const raw = field === "brand"
    ? item.brand
    : field === "model"
      ? item.model
      : field === "condition"
        ? item.condition
        : field === "specs"
          ? item.specifications || item.specs || item.features
          : item.description;
  const text = Array.isArray(raw)
    ? raw.join(", ")
    : typeof raw === "number"
      ? String(raw)
      : typeof raw === "string"
        ? raw.trim()
        : "";
  return text.slice(0, 160);
}

function buildItemDetailsAnswer({
  question = "",
  category = "",
  itemQuery = "",
  equipment = [],
  activeLoans = [],
  language = "english",
}) {
  const filipino = language === "filipino";
  const matches = matchingItems(equipment, category, itemQuery).slice(0, 8);
  if (matches.length === 0) {
    return itemQuery
      ? filipino
        ? `Walang item na tumutugma sa "${itemQuery}" sa Lendy inventory.`
        : `I couldn't find an item matching "${itemQuery}" in the Lendy inventory.`
      : filipino
        ? "Walang nahanap na tumutugmang item sa Lendy inventory."
        : "I couldn't find a matching item in the Lendy inventory.";
  }
  const requested = itemDetailField(question) || "any";
  if (requested === "brand") {
    const savedBrands = [
      ...new Set(
        matches
          .map((item) => itemDetailValue(item, "brand"))
          .filter(Boolean),
      ),
    ];
    const missingBrand = matches.some(
      (item) => !itemDetailValue(item, "brand"),
    );
    if (savedBrands.length === 0) {
      return filipino ? "Walang naka-lagay na Brand." : "Brand Not specified.";
    }
    const brands = savedBrands.join(", ");
    if (savedBrands.length === 1 && !missingBrand) {
      return filipino
        ? `Ang brand ay ${brands}.`
        : `The brand is ${brands}.`;
    }
    return filipino
      ? `Mga brand na naka-save: ${brands}.${missingBrand ? " May item na walang naka-lagay na Brand." : ""}`
      : `Saved brands: ${brands}.${missingBrand ? " Some items have no brand specified." : ""}`;
  }
  const labels = {
    brand: "Brand",
    model: "Model",
    condition: filipino ? "Kondisyon" : "Condition",
    specs: "Specs",
    description: "Description",
  };
  const fields = requested === "any"
    ? ["brand", "model", "condition", "specs", "description"]
    : [requested];
  const notRecorded = filipino ? "hindi naka-save" : "not recorded";
  const lines = matches.map((item) => {
    const parts = fields
      .map((field) => {
        const value = itemDetailValue(item, field);
        if (value) return `${labels[field]}: ${value}`;
        return field === requested ? `${labels[field]}: ${notRecorded}` : "";
      })
      .filter(Boolean);
    parts.push(`Status: ${itemStatus(item, activeLoans)}`);
    return `${item.name || "Unnamed item"} — ${parts.join("; ")}`;
  });
  return filipino
    ? `Ito ang naka-save sa Lendy para sa ${matches.length} tumutugmang item:\n${lines.join("\n")}\nAng makukumpirma ko lang ay ang impormasyong naka-save sa inventory.`
    : `Here's what Lendy has recorded for ${matches.length} matching item(s):\n${lines.join("\n")}\nI can only confirm details saved in the inventory.`;
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
  question = "",
  language = "english",
  today = manilaToday(),
}) {
  const filipino = language === "filipino";
  if (intent === "greeting") {
    return filipino
      ? "Kumusta! Ako ang Lendy assistant. Matutulungan kitang tingnan ang available na equipment, ang mga loan at due date mo, at ang profile mo. Ano ang maitutulong ko?"
      : "Hello! I'm the Lendy assistant. I can help you check available equipment, see your loans and due dates, and look up your profile. What would you like to know?";
  }
  if (intent === "thanks") {
    return filipino
      ? "Walang anuman! Sabihan mo lang ako kung may kailangan ka pa tungkol sa equipment o loans mo."
      : "You're welcome! Let me know if you need anything else about Lendy equipment or your loans.";
  }
  if (intent === "farewell") {
    return filipino
      ? "Paalam! Balik ka lang kapag kailangan mo ng tulong sa Lendy."
      : "Goodbye! Come back anytime you need help with Lendy.";
  }
  if (intent === "help") {
    return filipino
      ? "Matutulungan kitang tingnan ang available na equipment at status ng mga item, ang mga loan at due date mo, at ang mga detalye ng profile mo. Halimbawa: \"Anong camera ang available?\", \"Anong brand ng projector?\" o \"Kailan ang due ng hiniram ko?\""
      : "I can help you check available equipment and item status, see your loans and due dates, and look up your profile details. For example: \"What cameras are available?\", \"What brand is the projector?\" or \"When are my items due?\"";
  }
  if (intent === "item_details") {
    return buildItemDetailsAnswer({
      question,
      category,
      itemQuery,
      equipment,
      activeLoans,
      language,
    });
  }
  if (intent === "my_profile") {
    return buildBorrowerProfileAnswer(profileField, personalProfile, language);
  }

  if (intent === "how_to_borrow") {
    return filipino
      ? "Pumunta sa Browse, pumili ng available na item, at i-tap ang Request. Piliin ang hiram at return dates, pagkatapos ay isumite ang request. Makikita mo ang approval status sa Loans."
      : "Open Browse, choose an available item, and tap Request. Select your borrow and return dates, then submit the request. You can track its approval in Loans. After approval, check out the item and report its return when you are done.";
  }

  if (intent === "my_loan_deadlines") {
    const loans = personalLoans
      .filter((loan) => activeLoanStatuses.has(loan.status))
      .sort((a, b) => String(a.end || "").localeCompare(String(b.end || "")));
    if (loans.length === 0) {
      return filipino
        ? "Wala kang active loan na may return deadline sa ngayon."
        : "You have no active loans with a return deadline right now.";
    }
    return `${filipino ? "Mga return deadline ng active loans mo:" : "Your active loan deadlines:"}\n${loans
      .map(
        (loan) =>
          filipino
            ? `${loan.name || "Unnamed item"} — ibalik sa ${formatDueDate(loan.end)}${isOverdue(loan.end, today) ? " (lampas na)" : ""}`
            : `${loan.name || "Unnamed item"} — due ${formatDueDate(loan.end)}${isOverdue(loan.end, today) ? " (overdue)" : ""}`,
      )
      .join("\n")}`;
  }

  if (intent === "my_loans") {
    const loans = [...personalLoans]
      .sort((a, b) => String(b.start || "").localeCompare(String(a.start || "")))
      .slice(0, 20);
    if (loans.length === 0) {
      return filipino
        ? "Walang nahanap na loan o request record para sa account mo."
        : "I couldn't find any loan or request records for your account.";
    }
    return `${filipino ? "Mga loan/request record mo sa Lendy:" : "Your Lendy loan/request records:"}\n${loans
      .map((loan) => {
        const dueDate = loan.end
          ? filipino
            ? ` — ibalik sa ${formatDueDate(loan.end)}`
            : ` — return date ${formatDueDate(loan.end)}`
          : "";
        return `${loan.name || "Unnamed item"} — ${loanStatusLabel(loan, language)}${dueDate}`;
      })
      .join("\n")}${personalLoans.length > loans.length
        ? filipino
          ? "\nIpinapakita ang 20 pinakabagong record."
          : "\nShowing the 20 most recent records."
        : ""}`;
  }

  if (intent === "item_question") {
    return answer.trim() || buildItemQuestionAnswer({
      category,
      itemQuery,
      equipment,
      activeLoans,
      language,
    });
  }

  if (intent === "maintenance_items") {
    const matches = equipment.filter(
      (item) =>
        itemStatus(item, activeLoans) === "In Maintenance" &&
        categoryMatches(item, category),
    );
    return filipino
      ? matches.length
        ? `May ${matches.length} item na nasa maintenance sa ngayon.`
        : "Walang item na nasa maintenance sa ngayon."
      : matches.length
        ? `${matches.length} item(s) are currently in maintenance.`
        : "There are no items in maintenance right now.";
  }

  if (intent === "inventory_list" || intent === "item_status") {
    const matches = matchingItems(equipment, category, itemQuery);
    if (matches.length === 0) {
      return itemQuery
        ? filipino
          ? `Walang item na tumutugma sa "${itemQuery}". Tingnan ang pangalan o code at subukan ulit.`
          : `I couldn't find an inventory item matching "${itemQuery}". Check the item name or code and try again.`
        : filipino
          ? "Walang item sa equipment inventory sa ngayon."
          : "There are no items in the equipment inventory right now.";
    }
    if (intent === "item_status" && matches.length === 1) {
      return filipino
        ? `${matches[0].name || "Ang item na ito"} ay kasalukuyang ${itemStatus(matches[0], activeLoans)}.`
        : `${matches[0].name || "This item"} is currently ${itemStatus(matches[0], activeLoans)}.`;
    }
    const shown = Math.min(matches.length, 20);
    return filipino
      ? `Narito ang ${shown} item sa inventory at ang kasalukuyang status ng mga ito.${matches.length > shown ? " Ipinapakita ang unang 20 tugma." : ""}`
      : `Here are ${shown} inventory item(s) and their current status.${matches.length > shown ? " Showing the first 20 matches." : ""}`;
  }

  if (intent === "available_items" || intent === "suggest_item") {
    const matches = availableItems(equipment, activeLoans, category, itemQuery);
    if (intent === "available_items") {
      const description = category
        ? filipino
          ? ` sa kategoryang "${category}"`
          : ` matching "${category}"`
        : itemQuery
          ? filipino
            ? ` na tumutugma sa "${itemQuery}"`
            : ` matching "${itemQuery}"`
          : "";
      if (matches.length === 0) {
        return filipino
          ? `Walang available na item${description} sa ngayon.`
          : `There are no available items${description} right now.`;
      }
      return filipino
        ? `${matches.length} item ang available${description}. Pumili sa ibaba para mag-request.`
        : `${matches.length} item(s) available${description}. Choose one below to request it.`;
    }

    if (matches.length === 0) {
      return category
        ? filipino
          ? `Walang available na item sa "${category}" sa ngayon.`
          : `There are no available items matching "${category}" right now. Try asking what items are available.`
        : filipino
          ? "Walang available na item na maimumungkahi sa ngayon."
          : "There are no available items to suggest right now.";
    }
    return filipino
      ? "Narito ang ilang available na item. I-tap ang Request para pumili ng mga petsa."
      : "Here are some available matches. Tap Request on an item to choose your dates.";
  }

  return filipino
    ? "Makakatulong ako sa mga item at equipment ng Lendy, profile mo, at sarili mong loan/request records. Impormasyong naka-save lang sa Lendy ang makukumpirma ko, kaya hindi ako manghuhula kapag walang detalye."
    : "I can help with Lendy's equipment, your profile, and your own loan/request records. I can only confirm information saved in Lendy, so I won't guess when a detail isn't available.";
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
    input.intent === "item_details"
      ? matchingItems(input.equipment, input.category, input.itemQuery).slice(0, 8)
      : input.intent === "maintenance_items"
      ? matchingItems(input.equipment, input.category, input.itemQuery)
          .filter(
            (item) => itemStatus(item, input.activeLoans) === "In Maintenance",
          )
          .slice(0, 20)
      : input.intent === "inventory_list" || input.intent === "item_status"
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
    brand: typeof item.brand === "string" ? item.brand : "",
    model: typeof item.model === "string" ? item.model : "",
    status: itemStatus(item, input.activeLoans),
  }));
  return { answer, items };
}

module.exports = {
  buildBorrowerAssistantResponse,
  borrowerAnswerLanguage,
  borrowerProfileField,
  findInventoryCategory,
  fallbackBorrowerIntent,
  isBorrowerDomainQuestion,
  itemDetailField,
  itemStatus,
};