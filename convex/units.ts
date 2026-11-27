import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { requireProfile, requireUserId } from "./lib/auth";
import { strength } from "./lib/srs";
import { upsertItem } from "./items";
import { FR_ES } from "./seeds/frEs";
import type { SeedLesson, StarterUnit } from "./seeds/types";

const STARTER_UNITS: StarterUnit[] = [FR_ES];

export const MAX_UNITS = 100;
export const MAX_LESSONS_PER_UNIT = 100;
const MAX_ITEMS_PER_LESSON = 500;
export const MAX_ITEMS_PER_PROFILE = 2000;

// ---- Writing content --------------------------------------------------------

// Inserts the card unless the profile already has the same one; returns its
// id, or null for a duplicate.
export async function insertCard(
  ctx: MutationCtx,
  profileId: Id<"profiles">,
  card: Pick<Doc<"cards">, "itemIds" | "kind" | "prompt" | "cue" | "answer" | "accepted">,
) {
  const existing = await ctx.db
    .query("cards")
    .withIndex("by_profileId_and_prompt", (q) => q.eq("profileId", profileId).eq("prompt", card.prompt))
    .take(20);
  if (existing.some((c) => c.cue === card.cue && c.answer === card.answer)) return null;
  return await ctx.db.insert("cards", {
    profileId,
    ...card,
    accepted: card.accepted.length ? card.accepted : [card.answer],
  });
}

// Adds items and cards to a lesson. Items and cards that already exist in the
// profile are reused, so content can overlap between lessons.
export async function addLessonContent(
  ctx: MutationCtx,
  profileId: Id<"profiles">,
  lessonId: Id<"lessons">,
  content: Pick<SeedLesson, "items" | "cards">,
) {
  const itemIds = new Map<string, Id<"items">>();
  for (const item of content.items) {
    const { itemId } = await upsertItem(ctx, profileId, item);
    itemIds.set(item.key.normalize("NFC").trim().toLowerCase(), itemId);
    const linked = await ctx.db
      .query("lessonItems")
      .withIndex("by_lessonId_and_itemId", (q) => q.eq("lessonId", lessonId).eq("itemId", itemId))
      .unique();
    if (!linked) await ctx.db.insert("lessonItems", { profileId, lessonId, itemId });
  }
  for (const card of content.cards) {
    const ids = card.itemKeys.flatMap((key) => {
      const id = itemIds.get(key.normalize("NFC").trim().toLowerCase());
      return id ? [id] : [];
    });
    if (ids.length === 0) continue;
    await insertCard(ctx, profileId, {
      itemIds: ids,
      kind: card.kind,
      prompt: card.prompt,
      cue: card.cue,
      answer: card.answer,
      accepted: card.accepted,
    });
  }
}

export async function nextLessonOrder(ctx: QueryCtx, unitId: Id<"units">) {
  const last = await ctx.db
    .query("lessons")
    .withIndex("by_unitId_and_order", (q) => q.eq("unitId", unitId))
    .order("desc")
    .first();
  return (last?.order ?? 0) + 1;
}

export async function insertLesson(
  ctx: MutationCtx,
  profileId: Id<"profiles">,
  unitId: Id<"units">,
  order: number,
  lesson: SeedLesson,
) {
  const lessonId = await ctx.db.insert("lessons", {
    profileId,
    unitId,
    title: lesson.title,
    description: lesson.description,
    order,
  });
  await addLessonContent(ctx, profileId, lessonId, lesson);
  return lessonId;
}

async function nextUnitOrder(ctx: MutationCtx, profileId: Id<"profiles">) {
  const last = await ctx.db
    .query("units")
    .withIndex("by_profileId_and_order", (q) => q.eq("profileId", profileId))
    .order("desc")
    .first();
  return (last?.order ?? 0) + 1;
}

export async function createUnit(
  ctx: MutationCtx,
  profileId: Id<"profiles">,
  unit: { title: string; description?: string },
) {
  return await ctx.db.insert("units", {
    profileId,
    title: unit.title,
    description: unit.description,
    order: await nextUnitOrder(ctx, profileId),
  });
}

export async function insertUnit(
  ctx: MutationCtx,
  profileId: Id<"profiles">,
  unit: { title: string; description?: string; lessons: SeedLesson[] },
) {
  const unitId = await createUnit(ctx, profileId, unit);
  for (const [index, lesson] of unit.lessons.entries()) {
    await insertLesson(ctx, profileId, unitId, index + 1, lesson);
  }
  return unitId;
}

function starterFor(profile: Doc<"profiles">) {
  return STARTER_UNITS.find((u) => u.baseLang === profile.baseLang && u.targetLang === profile.targetLang) ?? null;
}

async function hasUnitTitled(ctx: QueryCtx, profileId: Id<"profiles">, title: string) {
  const units = await ctx.db
    .query("units")
    .withIndex("by_profileId_and_order", (q) => q.eq("profileId", profileId))
    .take(MAX_UNITS);
  return units.some((u) => u.title === title);
}

export const starterUnitFor = query({
  args: { profileId: v.id("profiles") },
  handler: async (ctx, { profileId }) => {
    const profile = await requireProfile(ctx, profileId);
    const starter = starterFor(profile);
    if (!starter || (await hasUnitTitled(ctx, profileId, starter.title))) return null;
    return { title: starter.title, lessons: starter.lessons.length };
  },
});

export const addStarterUnit = mutation({
  args: { profileId: v.id("profiles") },
  handler: async (ctx, { profileId }) => {
    const profile = await requireProfile(ctx, profileId);
    const starter = starterFor(profile);
    if (!starter) throw new Error("No starter unit for this language pair");
    if (await hasUnitTitled(ctx, profileId, starter.title)) return null;
    return await insertUnit(ctx, profileId, starter);
  },
});

// ---- Reading with progress --------------------------------------------------

type Progress = { items: number; strength: number; due: number };

function summarize(items: Doc<"items">[], now: number): Progress {
  const active = items.filter((item) => !item.suspended);
  return {
    items: active.length,
    strength: active.length ? active.reduce((sum, item) => sum + strength(item), 0) / active.length : 0,
    due: active.filter((item) => item.due <= now).length,
  };
}

export async function lessonItemIds(ctx: QueryCtx, lessonId: Id<"lessons">) {
  const links = await ctx.db
    .query("lessonItems")
    .withIndex("by_lessonId_and_itemId", (q) => q.eq("lessonId", lessonId))
    .take(MAX_ITEMS_PER_LESSON);
  return links.map((link) => link.itemId);
}

// Units with their lessons, each with aggregated item progress. A unit's
// progress covers the distinct items of all its lessons.
export const tree = query({
  args: { profileId: v.id("profiles"), now: v.number() },
  handler: async (ctx, { profileId, now }) => {
    await requireProfile(ctx, profileId);
    const allItems = await ctx.db
      .query("items")
      .withIndex("by_profileId_and_kind_and_key", (q) => q.eq("profileId", profileId))
      .take(MAX_ITEMS_PER_PROFILE);
    const byId = new Map(allItems.map((item) => [item._id, item]));
    const units = await ctx.db
      .query("units")
      .withIndex("by_profileId_and_order", (q) => q.eq("profileId", profileId))
      .take(MAX_UNITS);
    const result = [];
    for (const unit of units) {
      const lessons = await ctx.db
        .query("lessons")
        .withIndex("by_unitId_and_order", (q) => q.eq("unitId", unit._id))
        .take(MAX_LESSONS_PER_UNIT);
      const unitItems = new Map<Id<"items">, Doc<"items">>();
      const lessonRows = [];
      for (const lesson of lessons) {
        const items = (await lessonItemIds(ctx, lesson._id)).flatMap((id) => {
          const item = byId.get(id);
          return item ? [item] : [];
        });
        items.forEach((item) => unitItems.set(item._id, item));
        lessonRows.push({
          _id: lesson._id,
          title: lesson.title,
          description: lesson.description,
          status: lesson.status,
          progress: summarize(items, now),
        });
      }
      result.push({
        _id: unit._id,
        title: unit.title,
        description: unit.description,
        definitionOfDone: unit.definitionOfDone,
        closedAt: unit.closedAt,
        progress: summarize([...unitItems.values()], now),
        lessons: lessonRows,
      });
    }
    return { everything: summarize(allItems, now), units: result };
  },
});

// Takes a plain string because the id may come from a URL: a malformed id, a
// deleted lesson or another user's lesson all return null instead of throwing.
export const getLesson = query({
  args: { lessonId: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const lessonId = ctx.db.normalizeId("lessons", args.lessonId);
    const lesson = lessonId && (await ctx.db.get("lessons", lessonId));
    if (!lesson) return null;
    const profile = await ctx.db.get("profiles", lesson.profileId);
    if (profile?.userId !== userId) return null;
    const unit = await ctx.db.get("units", lesson.unitId);
    return { ...lesson, unitTitle: unit?.title ?? "" };
  },
});
