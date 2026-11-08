import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { uiLocaleValidator } from "./lib/languages";

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

const schema = defineSchema({
  ...authTables,

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

  // A unit of knowledge being learned, with its spaced-repetition state.
  items: defineTable({
    profileId: v.id("profiles"),
    kind: itemKindValidator,
    key: v.string(),
    text: v.string(),
    gloss: v.optional(v.string()),
    notes: v.optional(v.string()),
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

  // Learner audio in file storage; owned so actions can check access.
  recordings: defineTable({
    userId: v.id("users"),
    storageId: v.id("_storage"),
    mediaType: v.string(),
  }).index("by_userId", ["userId"]),

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
