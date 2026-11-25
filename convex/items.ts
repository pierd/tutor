import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { outcomeValidator, itemKindValidator } from "./schema";
import { requireItem, requireProfile } from "./lib/auth";
import { applyOutcome, initialState, type Outcome } from "./lib/srs";

const LIST_LIMIT = 500;

type NewItem = {
  kind: Doc<"items">["kind"];
  key: string;
  text: string;
  gloss?: string;
  notes?: string;
};

export function normalizeKey(key: string) {
  return key.normalize("NFC").trim().toLowerCase();
}

// Inserts the item unless one with the same kind+key exists; returns its id
// and whether it was created.
export async function upsertItem(ctx: MutationCtx, profileId: Id<"profiles">, item: NewItem) {
  const key = normalizeKey(item.key);
  const existing = await ctx.db
    .query("items")
    .withIndex("by_profileId_and_kind_and_key", (q) =>
      q.eq("profileId", profileId).eq("kind", item.kind).eq("key", key),
    )
    .unique();
  if (existing) return { itemId: existing._id, created: false };
  const itemId = await ctx.db.insert("items", {
    profileId,
    kind: item.kind,
    key,
    text: item.text,
    gloss: item.gloss,
    notes: item.notes,
    suspended: false,
    ...initialState(Date.now()),
  });
  return { itemId, created: true };
}

// The single entry point lessons use to report what happened to an item.
export async function recordEvidence(
  ctx: MutationCtx,
  item: Doc<"items">,
  evidence: { outcome: Outcome; source: string; detail?: string },
) {
  const now = Date.now();
  const before = {
    itemId: item._id,
    due: item.due,
    intervalDays: item.intervalDays,
    ease: item.ease,
    reps: item.reps,
    lapses: item.lapses,
    lastReviewedAt: item.lastReviewedAt,
  };
  await ctx.db.insert("evidence", {
    profileId: item.profileId,
    itemId: item._id,
    ...evidence,
  });
  const next = applyOutcome(item, evidence.outcome, now);
  await ctx.db.patch("items", item._id, {
    due: next.due,
    intervalDays: next.intervalDays,
    ease: next.ease,
    reps: next.reps,
    lapses: next.lapses,
    lastReviewedAt: next.lastReviewedAt,
  });
  return before;
}

export async function recordMistake(
  ctx: MutationCtx,
  profileId: Id<"profiles">,
  mistake: { pattern: string; description: string; itemId?: Id<"items"> },
) {
  const now = Date.now();
  const existing = await ctx.db
    .query("mistakes")
    .withIndex("by_profileId_and_pattern", (q) =>
      q.eq("profileId", profileId).eq("pattern", mistake.pattern),
    )
    .unique();
  if (existing) {
    await ctx.db.patch("mistakes", existing._id, {
      count: existing.count + 1,
      lastSeenAt: now,
      description: mistake.description,
    });
  } else {
    await ctx.db.insert("mistakes", { profileId, ...mistake, count: 1, lastSeenAt: now });
  }
}

export const list = query({
  args: { profileId: v.id("profiles"), lessonId: v.optional(v.id("lessons")) },
  handler: async (ctx, { profileId, lessonId }) => {
    await requireProfile(ctx, profileId);
    if (lessonId === undefined) {
      return await ctx.db
        .query("items")
        .withIndex("by_profileId_and_kind_and_key", (q) => q.eq("profileId", profileId))
        .take(LIST_LIMIT);
    }
    const lesson = await ctx.db.get("lessons", lessonId);
    if (lesson === null || lesson.profileId !== profileId) throw new Error("Lesson not found");
    const links = await ctx.db
      .query("lessonItems")
      .withIndex("by_lessonId_and_itemId", (q) => q.eq("lessonId", lessonId))
      .take(LIST_LIMIT);
    const items = await Promise.all(links.map((link) => ctx.db.get("items", link.itemId)));
    return items.filter((item): item is Doc<"items"> => item !== null);
  },
});

// Items due for review at `now` (passed by the client so the query stays cacheable).
export const due = query({
  args: { profileId: v.id("profiles"), now: v.number() },
  handler: async (ctx, { profileId, now }) => {
    await requireProfile(ctx, profileId);
    const items = await ctx.db
      .query("items")
      .withIndex("by_profileId_and_due", (q) => q.eq("profileId", profileId).lte("due", now))
      .take(50);
    return items.filter((item) => !item.suspended);
  },
});

export const add = mutation({
  args: {
    profileId: v.id("profiles"),
    kind: itemKindValidator,
    key: v.string(),
    text: v.string(),
    gloss: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { profileId, ...item }) => {
    await requireProfile(ctx, profileId);
    if (item.key.trim() === "" || item.text.trim() === "") {
      throw new Error("Key and text are required");
    }
    const { itemId } = await upsertItem(ctx, profileId, item);
    return itemId;
  },
});

export const review = mutation({
  args: {
    itemId: v.id("items"),
    outcome: outcomeValidator,
    source: v.string(),
    detail: v.optional(v.string()),
  },
  handler: async (ctx, { itemId, ...evidence }) => {
    const item = await requireItem(ctx, itemId);
    await recordEvidence(ctx, item, evidence);
    return null;
  },
});

export const setSuspended = mutation({
  args: { itemId: v.id("items"), suspended: v.boolean() },
  handler: async (ctx, { itemId, suspended }) => {
    await requireItem(ctx, itemId);
    await ctx.db.patch("items", itemId, { suspended });
    return null;
  },
});
