import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { cardProblem, contentRules } from "./ai/lessonContent";
import { createLesson as insertLessonWithContent, createUnitFromOutline, retryBuild } from "./coach";
import { normalizeKey } from "./items";
import { strength } from "./lib/srs";
import { itemDetailsValidator, itemKindValidator, lessonGuideValidator } from "./schema";
import { lessonOutlineValidator, seedCardValidator, seedItemValidator } from "./seeds/validators";
import { getUserSettings } from "./settings";
import { requestItemStudy, requestLessonStudy, startLessonStudy } from "./study";
import {
  addLessonContent,
  insertCard,
  lessonItemIds,
  MAX_ITEMS_PER_PROFILE,
  MAX_LESSONS_PER_UNIT,
  MAX_UNITS,
  nextLessonOrder,
} from "./units";

// Data access for the MCP server (convex/mcp.ts). `userId` is always the
// token's owner, and ids sent by the agent are plain strings: everything is
// looked up and checked to belong to that user here.

const MAX_PROFILES = 50;
const MAX_CARDS_SCANNED = 5000;

// Reaches the agent as the tool's error text.
function fail(message: string): never {
  throw new ConvexError(message);
}

// ---- Ownership --------------------------------------------------------------

async function ownProfile(ctx: QueryCtx, userId: Id<"users">, rawId: string) {
  const id = ctx.db.normalizeId("profiles", rawId);
  const profile = id ? await ctx.db.get("profiles", id) : null;
  if (profile === null || profile.userId !== userId) fail(`Profile not found: ${rawId}`);
  return profile;
}

async function activeProfile(ctx: QueryCtx, userId: Id<"users">) {
  const activeId = (await getUserSettings(ctx, userId))?.activeProfileId;
  const active = activeId ? await ctx.db.get("profiles", activeId) : null;
  if (active !== null && active.userId === userId) return active;
  return await ctx.db
    .query("profiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();
}

// The given profile, or the one active in the app.
async function pickProfile(ctx: QueryCtx, userId: Id<"users">, rawId: string | undefined) {
  if (rawId !== undefined) return await ownProfile(ctx, userId, rawId);
  const profile = await activeProfile(ctx, userId);
  if (profile === null) fail("No profile yet. The learner has to create one in the app first.");
  return profile;
}

async function owns(ctx: QueryCtx, userId: Id<"users">, profileId: Id<"profiles">) {
  return (await ctx.db.get("profiles", profileId))?.userId === userId;
}

async function ownUnit(ctx: QueryCtx, userId: Id<"users">, rawId: string) {
  const id = ctx.db.normalizeId("units", rawId);
  const unit = id ? await ctx.db.get("units", id) : null;
  if (unit === null || !(await owns(ctx, userId, unit.profileId))) fail(`Unit not found: ${rawId}`);
  return unit;
}

async function ownLesson(ctx: QueryCtx, userId: Id<"users">, rawId: string) {
  const id = ctx.db.normalizeId("lessons", rawId);
  const lesson = id ? await ctx.db.get("lessons", id) : null;
  if (lesson === null || !(await owns(ctx, userId, lesson.profileId))) fail(`Lesson not found: ${rawId}`);
  return lesson;
}

async function ownItem(ctx: QueryCtx, userId: Id<"users">, rawId: string) {
  const id = ctx.db.normalizeId("items", rawId);
  const item = id ? await ctx.db.get("items", id) : null;
  if (item === null || !(await owns(ctx, userId, item.profileId))) fail(`Item not found: ${rawId}`);
  return item;
}

async function ownCard(ctx: QueryCtx, userId: Id<"users">, rawId: string) {
  const id = ctx.db.normalizeId("cards", rawId);
  const card = id ? await ctx.db.get("cards", id) : null;
  if (card === null || !(await owns(ctx, userId, card.profileId))) fail(`Card not found: ${rawId}`);
  return card;
}

// ---- Reading ----------------------------------------------------------------

const iso = (ms: number | undefined) => (ms === undefined ? null : new Date(ms).toISOString());

function presentItem(item: Doc<"items">) {
  return {
    itemId: item._id,
    kind: item.kind,
    key: item.key,
    text: item.text,
    gloss: item.gloss ?? null,
    notes: item.notes ?? null,
    strengthPercent: Math.round(strength(item) * 100),
    reps: item.reps,
    lapses: item.lapses,
    due: iso(item.due),
    lastReviewedAt: iso(item.lastReviewedAt),
    suspended: item.suspended,
    hasDetails: item.details !== undefined,
  };
}

function presentCard(card: Doc<"cards">) {
  return {
    cardId: card._id,
    itemIds: card.itemIds,
    kind: card.kind,
    prompt: card.prompt,
    cue: card.cue ?? null,
    answer: card.answer,
    accepted: card.accepted,
  };
}

async function profileCards(ctx: QueryCtx, profileId: Id<"profiles">) {
  return await ctx.db
    .query("cards")
    .withIndex("by_profileId", (q) => q.eq("profileId", profileId))
    .take(MAX_CARDS_SCANNED);
}

async function profileItems(ctx: QueryCtx, profileId: Id<"profiles">) {
  return await ctx.db
    .query("items")
    .withIndex("by_profileId_and_kind_and_key", (q) => q.eq("profileId", profileId))
    .take(MAX_ITEMS_PER_PROFILE);
}

async function lessonItems(ctx: QueryCtx, lessonId: Id<"lessons">) {
  const items = await Promise.all((await lessonItemIds(ctx, lessonId)).map((id) => ctx.db.get("items", id)));
  return items.filter((item): item is Doc<"items"> => item !== null);
}

function page<T>(rows: T[], offset: number, limit: number) {
  return { total: rows.length, offset, rows: rows.slice(offset, offset + limit) };
}

export const listProfiles = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const active = await activeProfile(ctx, userId);
    const profiles = await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(MAX_PROFILES);
    return profiles.map((p) => ({
      profileId: p._id,
      name: p.name,
      baseLang: p.baseLang,
      targetLang: p.targetLang,
      goal: p.goal ?? null,
      active: p._id === active?._id,
    }));
  },
});

export const curriculum = internalQuery({
  args: { userId: v.id("users"), profileId: v.optional(v.string()), now: v.number() },
  handler: async (ctx, { userId, profileId, now }) => {
    const profile = await pickProfile(ctx, userId, profileId);
    const items = await profileItems(ctx, profile._id);
    const units = await ctx.db
      .query("units")
      .withIndex("by_profileId_and_order", (q) => q.eq("profileId", profile._id))
      .take(MAX_UNITS);
    const active = items.filter((item) => !item.suspended);
    return {
      profile: {
        profileId: profile._id,
        name: profile.name,
        baseLang: profile.baseLang,
        targetLang: profile.targetLang,
        goal: profile.goal ?? null,
      },
      items: {
        total: items.length,
        practised: items.filter((item) => item.reps > 0).length,
        due: active.filter((item) => item.due <= now).length,
      },
      units: await Promise.all(
        units.map(async (unit) => ({
          unitId: unit._id,
          title: unit.title,
          description: unit.description ?? null,
          definitionOfDone: unit.definitionOfDone ?? null,
          closed: unit.closedAt !== undefined,
          lessons: (
            await ctx.db
              .query("lessons")
              .withIndex("by_unitId_and_order", (q) => q.eq("unitId", unit._id))
              .take(MAX_LESSONS_PER_UNIT)
          ).map((lesson) => ({
            lessonId: lesson._id,
            title: lesson.title,
            description: lesson.description ?? null,
            status: lesson.status ?? "ready",
          })),
        })),
      ),
      contentRules: contentRules(profile.baseLang, profile.targetLang),
    };
  },
});

export const getLesson = internalQuery({
  args: { userId: v.id("users"), lessonId: v.string() },
  handler: async (ctx, { userId, lessonId }) => {
    const lesson = await ownLesson(ctx, userId, lessonId);
    const unit = await ctx.db.get("units", lesson.unitId);
    return {
      lessonId: lesson._id,
      profileId: lesson.profileId,
      unitId: lesson.unitId,
      unitTitle: unit?.title ?? null,
      title: lesson.title,
      description: lesson.description ?? null,
      status: lesson.status ?? "ready",
      error: lesson.error ?? null,
      guide: lesson.guide ?? null,
      guideStatus: lesson.guideStatus ?? null,
      items: (await lessonItems(ctx, lesson._id)).map(presentItem),
    };
  },
});

export const listItems = internalQuery({
  args: {
    userId: v.id("users"),
    profileId: v.optional(v.string()),
    lessonId: v.optional(v.string()),
    kind: v.optional(itemKindValidator),
    search: v.optional(v.string()),
    dueOnly: v.boolean(),
    now: v.number(),
    limit: v.number(),
    offset: v.number(),
  },
  handler: async (ctx, args) => {
    let items: Doc<"items">[];
    if (args.lessonId !== undefined) {
      items = await lessonItems(ctx, (await ownLesson(ctx, args.userId, args.lessonId))._id);
    } else {
      items = await profileItems(ctx, (await pickProfile(ctx, args.userId, args.profileId))._id);
    }
    const needle = args.search?.normalize("NFC").trim().toLowerCase();
    const matches = items.filter(
      (item) =>
        (!args.kind || item.kind === args.kind) &&
        (!args.dueOnly || (!item.suspended && item.due <= args.now)) &&
        (!needle || [item.key, item.text, item.gloss ?? "", item.notes ?? ""].some((s) => s.toLowerCase().includes(needle))),
    );
    const { total, offset, rows } = page(matches, args.offset, args.limit);
    return { total, offset, items: rows.map(presentItem) };
  },
});

export const getItem = internalQuery({
  args: { userId: v.id("users"), itemId: v.string() },
  handler: async (ctx, { userId, itemId }) => {
    const item = await ownItem(ctx, userId, itemId);
    const links = await ctx.db
      .query("lessonItems")
      .withIndex("by_itemId", (q) => q.eq("itemId", item._id))
      .take(100);
    const lessons = await Promise.all(links.map((link) => ctx.db.get("lessons", link.lessonId)));
    const cards = (await profileCards(ctx, item.profileId)).filter((card) => card.itemIds.includes(item._id));
    return {
      ...presentItem(item),
      profileId: item.profileId,
      details: item.details ?? null,
      detailsStatus: item.detailsStatus ?? null,
      lessons: lessons.flatMap((l) => (l ? [{ lessonId: l._id, title: l.title }] : [])),
      cards: cards.map(presentCard),
    };
  },
});

export const listCards = internalQuery({
  args: {
    userId: v.id("users"),
    profileId: v.optional(v.string()),
    lessonId: v.optional(v.string()),
    itemId: v.optional(v.string()),
    search: v.optional(v.string()),
    limit: v.number(),
    offset: v.number(),
  },
  handler: async (ctx, args) => {
    const lesson = args.lessonId !== undefined ? await ownLesson(ctx, args.userId, args.lessonId) : null;
    const item = args.itemId !== undefined ? await ownItem(ctx, args.userId, args.itemId) : null;
    const profileId =
      lesson?.profileId ?? item?.profileId ?? (await pickProfile(ctx, args.userId, args.profileId))._id;
    const inLesson = lesson ? new Set(await lessonItemIds(ctx, lesson._id)) : null;
    const needle = args.search?.normalize("NFC").trim().toLowerCase();
    const matches = (await profileCards(ctx, profileId)).filter(
      (card) =>
        (!inLesson || card.itemIds.some((id) => inLesson.has(id))) &&
        (!item || card.itemIds.includes(item._id)) &&
        (!needle ||
          [card.prompt, card.cue ?? "", card.answer, ...card.accepted].some((s) => s.toLowerCase().includes(needle))),
    );
    const { total, offset, rows } = page(matches, args.offset, args.limit);
    return { total, offset, cards: rows.map(presentCard) };
  },
});

export const listMistakes = internalQuery({
  args: { userId: v.id("users"), profileId: v.optional(v.string()), limit: v.number() },
  handler: async (ctx, { userId, profileId, limit }) => {
    const profile = await pickProfile(ctx, userId, profileId);
    const mistakes = await ctx.db
      .query("mistakes")
      .withIndex("by_profileId_and_pattern", (q) => q.eq("profileId", profile._id))
      .take(1000);
    return mistakes
      .sort((a, b) => b.count - a.count || b.lastSeenAt - a.lastSeenAt)
      .slice(0, limit)
      .map((m) => ({
        pattern: m.pattern,
        description: m.description,
        itemId: m.itemId ?? null,
        count: m.count,
        lastSeenAt: iso(m.lastSeenAt),
      }));
  },
});

// ---- Creating ---------------------------------------------------------------

type NewCard = typeof seedCardValidator.type;

// Unlike the coach's own output (cleanContent drops what's broken), an agent
// gets told what's wrong so it can fix it.
function checkedCards(cards: NewCard[], knownKeys: Set<string>) {
  return cards.map((card) => {
    const problem =
      cardProblem(card) ??
      card.itemKeys
        .filter((key) => !knownKeys.has(normalizeKey(key)))
        .map((key) => `no item with key "${key}" in this lesson`)[0];
    if (problem) fail(`Card "${card.prompt}" → "${card.answer}": ${problem}. Nothing was saved.`);
    return { ...card, cue: card.cue?.trim() || undefined, accepted: acceptedWith(card.answer, card.accepted) };
  });
}

function acceptedWith(answer: string, accepted: string[]) {
  return [...new Set([answer, ...accepted.filter((a) => a.trim() !== "")])];
}

function checkItems(items: (typeof seedItemValidator.type)[]) {
  for (const item of items) {
    if (normalizeKey(item.key) === "" || item.text.trim() === "") fail("Every item needs a key and a text.");
  }
}

// Card keys don't carry the item's kind, so a key must mean one item.
function keysOf(items: { key: string }[]) {
  const keys = new Set<string>();
  for (const { key } of items) {
    const normalized = normalizeKey(key);
    if (keys.has(normalized)) fail(`Item key "${key}" is given twice.`);
    keys.add(normalized);
  }
  return keys;
}

export const createLesson = internalMutation({
  args: {
    userId: v.id("users"),
    profileId: v.optional(v.string()),
    unitId: v.optional(v.string()),
    newUnitTitle: v.optional(v.string()),
    title: v.string(),
    description: v.optional(v.string()),
    items: v.array(seedItemValidator),
    cards: v.array(seedCardValidator),
    guide: v.optional(lessonGuideValidator),
    fillStudyMaterial: v.boolean(),
  },
  handler: async (ctx, args) => {
    if ((args.unitId === undefined) === (args.newUnitTitle === undefined)) fail("Give either unitId or newUnitTitle.");
    const unit = args.unitId !== undefined ? await ownUnit(ctx, args.userId, args.unitId) : null;
    if (unit && args.profileId !== undefined && unit.profileId !== args.profileId) {
      fail("That unit belongs to another profile.");
    }
    const profileId = unit?.profileId ?? (await pickProfile(ctx, args.userId, args.profileId))._id;
    checkItems(args.items);
    const created = await insertLessonWithContent(ctx, profileId, {
      unitId: unit?._id,
      unitTitle: args.newUnitTitle,
      title: args.title,
      description: args.description,
      items: args.items,
      cards: checkedCards(args.cards, keysOf(args.items)),
    });
    if (args.guide) await ctx.db.patch("lessons", created.lessonId, { guide: args.guide });
    if (args.fillStudyMaterial) await startLessonStudy(ctx, created.lessonId);
    return created;
  },
});

export const createUnit = internalMutation({
  args: {
    userId: v.id("users"),
    profileId: v.optional(v.string()),
    title: v.string(),
    description: v.optional(v.string()),
    lessons: v.array(lessonOutlineValidator),
  },
  handler: async (ctx, { userId, profileId, ...outline }) => {
    const profile = await pickProfile(ctx, userId, profileId);
    return await createUnitFromOutline(ctx, profile._id, outline);
  },
});

export const addToLesson = internalMutation({
  args: {
    userId: v.id("users"),
    lessonId: v.string(),
    items: v.array(seedItemValidator),
    cards: v.array(seedCardValidator),
  },
  handler: async (ctx, { userId, lessonId, items, cards }) => {
    const lesson = await ownLesson(ctx, userId, lessonId);
    if (lesson.status) fail("This lesson isn't built yet.");
    checkItems(items);
    const keys = keysOf(items);
    // Cards may also use items the lesson already has.
    const used = new Set(cards.flatMap((card) => card.itemKeys.map(normalizeKey)));
    const existing = (await lessonItems(ctx, lesson._id)).filter((item) => used.has(item.key) && !keys.has(item.key));
    const allKeys = new Set([...keys, ...keysOf(existing)]);
    await addLessonContent(ctx, lesson.profileId, lesson._id, {
      items: [...items, ...existing.map(({ kind, key, text }) => ({ kind, key, text }))],
      cards: checkedCards(cards, allKeys),
    });
    return { lessonId: lesson._id, items: (await lessonItems(ctx, lesson._id)).map(presentItem) };
  },
});

async function cardItemIds(ctx: QueryCtx, userId: Id<"users">, profileId: Id<"profiles">, rawIds: string[]) {
  const ids = new Set<Id<"items">>();
  for (const rawId of rawIds) {
    const item = await ownItem(ctx, userId, rawId);
    if (item.profileId !== profileId) fail("A card's items must all be in the same profile.");
    ids.add(item._id);
  }
  return [...ids];
}

export const addCards = internalMutation({
  args: {
    userId: v.id("users"),
    cards: v.array(seedCardValidator.omit("itemKeys").extend({ itemIds: v.array(v.string()) })),
  },
  handler: async (ctx, { userId, cards }) => {
    const added = [];
    let duplicates = 0;
    for (const card of cards) {
      const problem = cardProblem(card);
      if (problem) fail(`Card "${card.prompt}" → "${card.answer}": ${problem}. Nothing was saved.`);
      const { profileId } = await ownItem(ctx, userId, card.itemIds[0]);
      const cardId = await insertCard(ctx, profileId, {
        ...card,
        itemIds: await cardItemIds(ctx, userId, profileId, card.itemIds),
        cue: card.cue?.trim() || undefined,
        accepted: acceptedWith(card.answer, card.accepted),
      });
      if (cardId === null) duplicates++;
      else added.push({ cardId, prompt: card.prompt, answer: card.answer });
    }
    return { added, duplicatesSkipped: duplicates };
  },
});

// ---- Editing ----------------------------------------------------------------

async function updateCard(
  ctx: MutationCtx,
  userId: Id<"users">,
  change: {
    cardId: string;
    itemIds?: string[];
    prompt?: string;
    cue?: string;
    answer?: string;
    accepted?: string[];
  },
) {
  const card = await ownCard(ctx, userId, change.cardId);
  const prompt = change.prompt ?? card.prompt;
  const answer = change.answer ?? card.answer;
  const problem = cardProblem({ kind: card.kind, prompt, answer });
  if (problem) fail(`Card ${card._id}: ${problem}. Nothing was saved.`);
  // A replaced answer was probably wrong, so it stops being accepted.
  const accepted = change.accepted ?? card.accepted.filter((a) => a !== card.answer);
  await ctx.db.patch("cards", card._id, {
    prompt,
    answer,
    accepted: acceptedWith(answer, accepted),
    ...(change.cue !== undefined && { cue: change.cue.trim() || undefined }),
    ...(change.itemIds && { itemIds: await cardItemIds(ctx, userId, card.profileId, change.itemIds) }),
  });
  return presentCard((await ctx.db.get("cards", card._id))!);
}

export const updateCards = internalMutation({
  args: {
    userId: v.id("users"),
    cards: v.array(
      v.object({
        cardId: v.string(),
        itemIds: v.optional(v.array(v.string())),
        prompt: v.optional(v.string()),
        cue: v.optional(v.string()),
        answer: v.optional(v.string()),
        accepted: v.optional(v.array(v.string())),
      }),
    ),
  },
  handler: async (ctx, { userId, cards }) => {
    const updated = [];
    for (const change of cards) updated.push(await updateCard(ctx, userId, change));
    return updated;
  },
});

export const deleteCards = internalMutation({
  args: { userId: v.id("users"), cardIds: v.array(v.string()) },
  handler: async (ctx, { userId, cardIds }) => {
    const deleted = [];
    for (const rawId of new Set(cardIds)) {
      const card = await ownCard(ctx, userId, rawId);
      await ctx.db.delete("cards", card._id);
      deleted.push(presentCard(card));
    }
    return deleted;
  },
});

export const updateItems = internalMutation({
  args: {
    userId: v.id("users"),
    items: v.array(
      v.object({
        itemId: v.string(),
        text: v.optional(v.string()),
        gloss: v.optional(v.string()),
        notes: v.optional(v.string()),
        details: v.optional(itemDetailsValidator),
        suspended: v.optional(v.boolean()),
      }),
    ),
  },
  handler: async (ctx, { userId, items }) => {
    const updated = [];
    for (const change of items) {
      const item = await ownItem(ctx, userId, change.itemId);
      if (change.text !== undefined && change.text.trim() === "") fail(`Item ${item._id}: the text can't be empty.`);
      await ctx.db.patch("items", item._id, {
        ...(change.text !== undefined && { text: change.text.trim() }),
        ...(change.gloss !== undefined && { gloss: change.gloss.trim() || undefined }),
        ...(change.notes !== undefined && { notes: change.notes.trim() || undefined }),
        ...(change.details !== undefined && { details: change.details, detailsStatus: undefined }),
        ...(change.suspended !== undefined && { suspended: change.suspended }),
      });
      updated.push(presentItem((await ctx.db.get("items", item._id))!));
    }
    return updated;
  },
});

export const updateLesson = internalMutation({
  args: {
    userId: v.id("users"),
    lessonId: v.string(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    guide: v.optional(lessonGuideValidator),
    unitId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const lesson = await ownLesson(ctx, args.userId, args.lessonId);
    const unit = args.unitId !== undefined ? await ownUnit(ctx, args.userId, args.unitId) : null;
    if (unit && unit.profileId !== lesson.profileId) fail("That unit belongs to another profile.");
    await ctx.db.patch("lessons", lesson._id, {
      ...(args.title !== undefined && { title: args.title }),
      ...(args.description !== undefined && { description: args.description.trim() || undefined }),
      ...(args.guide !== undefined && { guide: args.guide }),
      ...(unit &&
        unit._id !== lesson.unitId && { unitId: unit._id, order: await nextLessonOrder(ctx, unit._id) }),
    });
    return null;
  },
});

export const updateUnit = internalMutation({
  args: {
    userId: v.id("users"),
    unitId: v.string(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, { userId, unitId, title, description }) => {
    const unit = await ownUnit(ctx, userId, unitId);
    await ctx.db.patch("units", unit._id, {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description: description.trim() || undefined }),
    });
    return null;
  },
});

// Only unlinks: the items keep their progress and stay in Everything.
export const removeFromLesson = internalMutation({
  args: { userId: v.id("users"), lessonId: v.string(), itemIds: v.array(v.string()) },
  handler: async (ctx, { userId, lessonId, itemIds }) => {
    const lesson = await ownLesson(ctx, userId, lessonId);
    const removed: string[] = [];
    for (const rawId of itemIds) {
      const item = await ownItem(ctx, userId, rawId);
      const link = await ctx.db
        .query("lessonItems")
        .withIndex("by_lessonId_and_itemId", (q) => q.eq("lessonId", lesson._id).eq("itemId", item._id))
        .unique();
      if (link === null) continue;
      await ctx.db.delete("lessonItems", link._id);
      removed.push(item.text);
    }
    return removed;
  },
});

// ---- Background AI work -----------------------------------------------------

export const fillStudyMaterial = internalMutation({
  args: { userId: v.id("users"), lessonId: v.optional(v.string()), itemId: v.optional(v.string()) },
  handler: async (ctx, { userId, lessonId, itemId }) => {
    if ((lessonId === undefined) === (itemId === undefined)) fail("Give either lessonId or itemId.");
    if (lessonId !== undefined) return await requestLessonStudy(ctx, await ownLesson(ctx, userId, lessonId));
    return await requestItemStudy(ctx, await ownItem(ctx, userId, itemId!));
  },
});

export const rebuildLesson = internalMutation({
  args: { userId: v.id("users"), lessonId: v.string() },
  handler: async (ctx, { userId, lessonId }) => await retryBuild(ctx, await ownLesson(ctx, userId, lessonId)),
});
