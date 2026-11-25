import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { uiLocaleValidator } from "./lib/languages";
import { lessonOutlineValidator, seedCardValidator, seedItemValidator } from "./seeds/validators";

export const itemKindValidator = v.union(
  v.literal("lemma"),
  v.literal("chunk"),
  v.literal("grammar"),
  v.literal("glyph"),
);

export const outcomeValidator = v.union(
  v.literal("correct"),
  v.literal("incorrect"),
  v.literal("lookup"),
  v.literal("exposure"),
);

// Study material written by the coach: details on one item (forms,
// conjugation tables, examples) and readable notes for a lesson.
const studyTableValidator = v.object({
  title: v.optional(v.string()),
  header: v.optional(v.array(v.string())),
  rows: v.array(v.array(v.string())),
});

const studyExampleValidator = v.object({ text: v.string(), translation: v.string() });

export const itemDetailsValidator = v.object({
  explanation: v.optional(v.string()),
  facts: v.optional(v.array(v.object({ label: v.string(), value: v.string() }))),
  tables: v.optional(v.array(studyTableValidator)),
  examples: v.optional(v.array(studyExampleValidator)),
});

export const lessonGuideValidator = v.object({
  sections: v.array(
    v.object({
      heading: v.string(),
      body: v.string(),
      tables: v.optional(v.array(studyTableValidator)),
      examples: v.optional(v.array(studyExampleValidator)),
    }),
  ),
});

export const coachFocusValidator = v.union(
  v.object({ kind: v.literal("item"), itemId: v.id("items") }),
  v.object({ kind: v.literal("guide"), lessonId: v.id("lessons") }),
);

// Set while the coach writes study material in the background.
const studyStatusValidator = v.optional(v.union(v.literal("writing"), v.literal("failed")));

const schema = defineSchema({
  ...authTables,

  // Convex Auth's `users` table plus `approvedAt`: set when an admin lets the
  // user in from the wishlist. Missing = still waiting (admins always get in).
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    approvedAt: v.optional(v.number()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_approvedAt", ["approvedAt"]),

  // One learning context: a language pair plus an optional goal. A user can
  // own several, each with separate progress.
  profiles: defineTable({
    userId: v.id("users"),
    name: v.string(),
    baseLang: v.string(),
    targetLang: v.string(),
    goal: v.optional(v.string()),
  }).index("by_userId", ["userId"]),

  userSettings: defineTable({
    userId: v.id("users"),
    activeProfileId: v.optional(v.id("profiles")),
    uiLocale: v.optional(uiLocaleValidator),
  }).index("by_userId", ["userId"]),

  // Curriculum: units contain ordered lessons; a lesson is a named set of
  // items (many-to-many, so progress on an item counts in every lesson).
  units: defineTable({
    profileId: v.id("profiles"),
    title: v.string(),
    description: v.optional(v.string()),
    order: v.number(),
    // The learner's own definition of "finished"; only they close a unit.
    definitionOfDone: v.optional(v.string()),
    closedAt: v.optional(v.number()),
  }).index("by_profileId_and_order", ["profileId", "order"]),

  lessons: defineTable({
    profileId: v.id("profiles"),
    unitId: v.id("units"),
    title: v.string(),
    description: v.optional(v.string()),
    order: v.number(),
    // Set while the AI builds a lesson accepted from a unit outline.
    status: v.optional(v.union(v.literal("building"), v.literal("failed"))),
    buildFocus: v.optional(v.string()),
    error: v.optional(v.string()),
    guide: v.optional(lessonGuideValidator),
    guideStatus: studyStatusValidator,
  })
    .index("by_unitId_and_order", ["unitId", "order"])
    .index("by_profileId", ["profileId"]),

  lessonItems: defineTable({
    profileId: v.id("profiles"),
    lessonId: v.id("lessons"),
    itemId: v.id("items"),
  })
    .index("by_lessonId_and_itemId", ["lessonId", "itemId"])
    .index("by_itemId", ["itemId"]),

  // Ready-made practice material for cheap modes (flashcards, say the word).
  // `prompt` may contain "___" for a gap; answering credits every item in
  // `itemIds` (e.g. the verb and the grammar point).
  cards: defineTable({
    profileId: v.id("profiles"),
    itemIds: v.array(v.id("items")),
    kind: v.union(v.literal("meaning"), v.literal("form")),
    prompt: v.string(),
    // Shown next to a gap, e.g. the infinitive.
    cue: v.optional(v.string()),
    answer: v.string(),
    accepted: v.array(v.string()),
  })
    .index("by_profileId", ["profileId"])
    .index("by_profileId_and_prompt", ["profileId", "prompt"]),

  // Reading comprehension: a generated text per lesson (absent lessonId =
  // Everything), reused until the learner asks for a new one.
  readings: defineTable({
    profileId: v.id("profiles"),
    lessonId: v.optional(v.id("lessons")),
    status: v.union(v.literal("generating"), v.literal("ready"), v.literal("failed")),
    title: v.optional(v.string()),
    text: v.optional(v.string()),
    // Every word form in the text with its meaning, for instant tap-to-lookup.
    glossary: v.array(
      v.object({ surface: v.string(), gloss: v.string(), itemKey: v.optional(v.string()) }),
    ),
    questions: v.array(
      v.object({
        kind: v.union(v.literal("truefalse"), v.literal("choice")),
        question: v.string(),
        // truefalse: ["true", "false"]; choice: 3–4 options.
        options: v.array(v.string()),
        answerIndex: v.number(),
        explanation: v.optional(v.string()),
        itemKeys: v.array(v.string()),
      }),
    ),
    audioStorageId: v.optional(v.id("_storage")),
    // Optional illustrations: scene prompts written with the text, drawn in
    // the background and attached to paragraphs.
    withImages: v.optional(v.boolean()),
    illustrations: v.optional(
      v.array(
        v.object({
          paragraph: v.number(),
          prompt: v.string(),
          storageId: v.optional(v.id("_storage")),
          failed: v.optional(v.boolean()),
        }),
      ),
    ),
    lastScore: v.optional(v.number()),
    lastAnswers: v.optional(v.array(v.number())),
    error: v.optional(v.string()),
  }).index("by_profileId", ["profileId"]),

  // Coach chat: one row per conversation (agent-component thread).
  coachThreads: defineTable({
    profileId: v.id("profiles"),
    threadId: v.string(),
    // From the first message, or what the conversation is about. Missing on
    // conversations from before titles.
    title: v.optional(v.string()),
    // Set when started from an "Ask the coach" button; the item's or notes'
    // current content goes into the coach's instructions.
    focus: v.optional(coachFocusValidator),
  })
    .index("by_profileId", ["profileId"])
    .index("by_threadId", ["threadId"]),

  // Content the coach proposed in chat; created only when the learner accepts.
  proposals: defineTable({
    profileId: v.id("profiles"),
    threadId: v.string(),
    status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("dismissed")),
    proposal: v.union(
      v.object({
        kind: v.literal("lesson"),
        // Existing unit, or the title of a new one.
        unitId: v.optional(v.id("units")),
        unitTitle: v.optional(v.string()),
        title: v.string(),
        description: v.optional(v.string()),
        items: v.array(seedItemValidator),
        cards: v.array(seedCardValidator),
      }),
      v.object({
        kind: v.literal("unit"),
        title: v.string(),
        description: v.optional(v.string()),
        lessons: v.array(lessonOutlineValidator),
      }),
      // Corrections to existing study material, applied on accept.
      v.object({
        kind: v.literal("itemFix"),
        itemId: v.id("items"),
        title: v.string(), // the item's text
        summary: v.string(),
        gloss: v.optional(v.string()),
        notes: v.optional(v.string()),
        details: v.optional(itemDetailsValidator),
      }),
      v.object({
        kind: v.literal("guideFix"),
        lessonId: v.id("lessons"),
        title: v.string(), // the lesson's title
        summary: v.string(),
        guide: lessonGuideValidator,
      }),
    ),
    createdUnitId: v.optional(v.id("units")),
    createdLessonId: v.optional(v.id("lessons")),
  }).index("by_threadId", ["threadId"]),

  // Text-to-speech results reused across learners' sessions.
  ttsCache: defineTable({
    key: v.string(),
    storageId: v.id("_storage"),
  }).index("by_key", ["key"]),

  // A unit of knowledge being learned, with its spaced-repetition state.
  items: defineTable({
    profileId: v.id("profiles"),
    kind: itemKindValidator,
    key: v.string(),
    text: v.string(),
    gloss: v.optional(v.string()),
    notes: v.optional(v.string()),
    details: v.optional(itemDetailsValidator),
    detailsStatus: studyStatusValidator,
    due: v.number(),
    intervalDays: v.number(),
    ease: v.number(),
    reps: v.number(),
    lapses: v.number(),
    lastReviewedAt: v.optional(v.number()),
    suspended: v.boolean(),
  })
    .index("by_profileId_and_kind_and_key", ["profileId", "kind", "key"])
    .index("by_profileId_and_due", ["profileId", "due"]),

  // Append-only log of everything that tells us something about an item.
  // Every lesson type writes here.
  evidence: defineTable({
    profileId: v.id("profiles"),
    itemId: v.id("items"),
    outcome: outcomeValidator,
    source: v.string(),
    detail: v.optional(v.string()),
  })
    .index("by_itemId", ["itemId"])
    .index("by_profileId", ["profileId"]),

  // Granted from the CLI: npx convex run admin:grant '{"email":"…"}'
  roles: defineTable({
    userId: v.id("users"),
    role: v.literal("admin"),
  }).index("by_userId", ["userId"]),

  // Personal tokens for the MCP server (convex/mcp.ts); only hashes are kept.
  apiTokens: defineTable({
    userId: v.id("users"),
    name: v.string(),
    tokenHash: v.string(),
    // Last characters of the token, to tell them apart in the list.
    hint: v.string(),
    lastUsedAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_tokenHash", ["tokenHash"]),

  // Learner audio in file storage; owned so actions can check access.
  recordings: defineTable({
    userId: v.id("users"),
    storageId: v.id("_storage"),
    mediaType: v.string(),
  }).index("by_userId", ["userId"]),

  // Translation challenge: one generated sentence to translate. The server
  // keeps one pending exercise per profile so "next" is instant.
  exercises: defineTable({
    profileId: v.id("profiles"),
    // Absent = the "Everything" lesson (all items, may introduce new ones).
    lessonId: v.optional(v.id("lessons")),
    status: v.union(
      v.literal("generating"),
      v.literal("ready"),
      v.literal("answered"),
      v.literal("skipped"),
      v.literal("failed"),
    ),
    itemIds: v.array(v.id("items")),
    allowNewItem: v.boolean(),
    prompt: v.optional(v.string()),
    answers: v.array(v.string()),
    hint: v.optional(v.string()),
    audioStorageId: v.optional(v.id("_storage")),
    error: v.optional(v.string()),
  }).index("by_profileId_and_status", ["profileId", "status"]),

  attempts: defineTable({
    exerciseId: v.id("exercises"),
    profileId: v.id("profiles"),
    mode: v.union(v.literal("speech"), v.literal("text")),
    answer: v.string(),
    recordingId: v.optional(v.id("recordings")),
    verdict: v.union(v.literal("correct"), v.literal("almost"), v.literal("incorrect")),
    corrected: v.string(),
    feedback: v.string(),
    itemResults: v.array(
      v.object({
        itemId: v.id("items"),
        outcome: v.union(v.literal("correct"), v.literal("incorrect"), v.literal("inaudible")),
        note: v.optional(v.string()),
      }),
    ),
    mistakes: v.array(v.object({ pattern: v.string(), description: v.string() })),
    needsTypedCheck: v.boolean(),
    contested: v.boolean(),
    // Item schedules before this attempt, so contesting can restore them.
    srsBefore: v.optional(
      v.array(
        v.object({
          itemId: v.id("items"),
          due: v.number(),
          intervalDays: v.number(),
          ease: v.number(),
          reps: v.number(),
          lapses: v.number(),
          lastReviewedAt: v.optional(v.number()),
        }),
      ),
    ),
  })
    .index("by_exerciseId", ["exerciseId"])
    .index("by_profileId", ["profileId"]),

  // Recurring error patterns, e.g. "aux:avoir-for-etre".
  mistakes: defineTable({
    profileId: v.id("profiles"),
    pattern: v.string(),
    description: v.string(),
    itemId: v.optional(v.id("items")),
    count: v.number(),
    lastSeenAt: v.number(),
  }).index("by_profileId_and_pattern", ["profileId", "pattern"]),
});

export default schema;
