import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { requireProfile, requireUserIdInAction } from "./lib/auth";
import { strength } from "./lib/srs";
import { matchesSpoken, normalize, spokenText } from "./lib/text";
import { DEFAULT_STT_MODEL, ttsVoicesFor } from "./lib/voices";
import { speak, transcribe } from "./ai/voice";
import { recordEvidence } from "./items";
import { lessonItemIds } from "./units";

// Cheap practice modes built on ready-made cards: flashcards (multiple choice
// or typed) and "say the word". No LLM calls; speech costs one transcription.

const MAX_CARDS_SCANNED = 5000;

// Deterministic shuffle so a query returns the same draw for the same seed.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Up to three wrong options, preferring siblings (other forms of the same verb).
function distractors(card: Doc<"cards">, pool: Doc<"cards">[], random: () => number) {
  const accepted = new Set(card.accepted.map((a) => normalize(a)));
  const sameKind = pool.filter((c) => c.kind === card.kind && c._id !== card._id);
  const siblings = card.cue ? sameKind.filter((c) => c.cue === card.cue) : [];
  const options: string[] = [];
  for (const candidate of [...shuffle(siblings, random), ...shuffle(sameKind, random)]) {
    const key = normalize(candidate.answer);
    if (accepted.has(key) || options.some((o) => normalize(o) === key)) continue;
    options.push(candidate.answer);
    if (options.length === 3) break;
  }
  return options;
}

// A batch of cards for a lesson (or everything): cards of due items first,
// then weaker items; at most two cards per item for variety.
export const drawCards = query({
  args: {
    profileId: v.id("profiles"),
    lessonId: v.optional(v.id("lessons")),
    now: v.number(),
    seed: v.number(),
    count: v.optional(v.number()),
  },
  handler: async (ctx, { profileId, lessonId, now, seed, count = 10 }) => {
    await requireProfile(ctx, profileId);
    const allCards = await ctx.db
      .query("cards")
      .withIndex("by_profileId", (q) => q.eq("profileId", profileId))
      .take(MAX_CARDS_SCANNED);
    let pool = allCards;
    if (lessonId) {
      const lesson = await ctx.db.get("lessons", lessonId);
      if (lesson === null || lesson.profileId !== profileId) throw new Error("Lesson not found");
      const ids = new Set(await lessonItemIds(ctx, lessonId));
      pool = allCards.filter((card) => card.itemIds.some((id) => ids.has(id)));
    }
    const itemIds = [...new Set(pool.flatMap((card) => card.itemIds))];
    const items = new Map(
      (await Promise.all(itemIds.map((id) => ctx.db.get("items", id))))
        .filter((item): item is Doc<"items"> => item !== null)
        .map((item) => [item._id, item]),
    );
    const random = rng(seed);
    const score = (card: Doc<"cards">) => {
      const cardItems = card.itemIds.flatMap((id) => (items.has(id) ? [items.get(id)!] : []));
      if (cardItems.length === 0 || cardItems.some((item) => item.suspended)) return Infinity;
      const due = cardItems.some((item) => item.due <= now) ? 0 : 1;
      return due + Math.min(...cardItems.map(strength)) + random() * 0.3;
    };
    const ranked = pool
      .map((card) => ({ card, score: score(card) }))
      .filter((c) => c.score !== Infinity)
      .sort((a, b) => a.score - b.score);
    const perItem = new Map<Id<"items">, number>();
    const picked: Doc<"cards">[] = [];
    for (const { card } of ranked) {
      const main = card.itemIds[0];
      if ((perItem.get(main) ?? 0) >= 2) continue;
      perItem.set(main, (perItem.get(main) ?? 0) + 1);
      picked.push(card);
      if (picked.length === Math.min(count, 30)) break;
    }
    return shuffle(picked, random).map((card) => ({
      _id: card._id,
      kind: card.kind,
      prompt: card.prompt,
      cue: card.cue,
      answer: card.answer,
      accepted: card.accepted,
      options: shuffle([card.answer, ...distractors(card, pool, random)], random),
    }));
  },
});

// Every card of a lesson (or everything) for passive viewing, in creation
// order; the client shuffles. Read-only: watching records no evidence.
export const allCards = query({
  args: { profileId: v.id("profiles"), lessonId: v.optional(v.id("lessons")) },
  handler: async (ctx, { profileId, lessonId }) => {
    await requireProfile(ctx, profileId);
    let cards = await ctx.db
      .query("cards")
      .withIndex("by_profileId", (q) => q.eq("profileId", profileId))
      .take(MAX_CARDS_SCANNED);
    if (lessonId) {
      const lesson = await ctx.db.get("lessons", lessonId);
      if (lesson === null || lesson.profileId !== profileId) throw new Error("Lesson not found");
      const ids = new Set(await lessonItemIds(ctx, lessonId));
      cards = cards.filter((card) => card.itemIds.some((id) => ids.has(id)));
    }
    const itemIds = [...new Set(cards.flatMap((card) => card.itemIds))];
    const suspended = new Set(
      (await Promise.all(itemIds.map((id) => ctx.db.get("items", id))))
        .filter((item): item is Doc<"items"> => item !== null && item.suspended)
        .map((item) => item._id),
    );
    return cards
      .filter((card) => !card.itemIds.some((id) => suspended.has(id)))
      .map((card) => ({ _id: card._id, kind: card.kind, prompt: card.prompt, cue: card.cue, answer: card.answer }));
  },
});

export const answerCard = mutation({
  args: {
    cardId: v.id("cards"),
    correct: v.boolean(),
    mode: v.union(v.literal("choice"), v.literal("typed"), v.literal("spoken")),
    given: v.optional(v.string()),
  },
  handler: async (ctx, { cardId, correct, mode, given }) => {
    const card = await ctx.db.get("cards", cardId);
    if (card === null) throw new Error("Card not found");
    await requireProfile(ctx, card.profileId);
    for (const itemId of card.itemIds) {
      const item = await ctx.db.get("items", itemId);
      if (item) {
        await recordEvidence(ctx, item, {
          outcome: correct ? "correct" : "incorrect",
          source: `card:${mode}`,
          detail: given,
        });
      }
    }
    return null;
  },
});

// ---- Speech -----------------------------------------------------------------

export const ownedCard = internalQuery({
  args: { cardId: v.id("cards"), userId: v.id("users") },
  handler: async (ctx, { cardId, userId }) => {
    const card = await ctx.db.get("cards", cardId);
    if (card === null) return null;
    const profile = await ctx.db.get("profiles", card.profileId);
    if (profile === null || profile.userId !== userId) return null;
    return { card, targetLang: profile.targetLang };
  },
});

// Transcribes the learner saying a card and checks it. Evidence is recorded
// separately (answerCard) so the learner can overrule a mis-hearing first.
export const checkSpoken = action({
  args: { cardId: v.id("cards"), recordingId: v.id("recordings") },
  handler: async (ctx, { cardId, recordingId }): Promise<{ transcript: string; expected: string; correct: boolean }> => {
    const userId = await requireUserIdInAction(ctx);
    const owned = await ctx.runQuery(internal.practice.ownedCard, { cardId, userId });
    const recording = await ctx.runQuery(internal.recordings.getOwned, { recordingId, userId });
    if (owned === null || recording === null) throw new Error("Not found");
    const blob = await ctx.storage.get(recording.storageId);
    if (blob === null) throw new Error("Recording file missing");
    try {
      const { text } = await transcribe(await blob.arrayBuffer(), recording.mediaType, {
        model: DEFAULT_STT_MODEL,
        language: owned.targetLang,
      });
      const expected = spokenText(owned.card);
      return { transcript: text, expected, correct: matchesSpoken(expected, text) };
    } finally {
      await ctx.runMutation(internal.practice.deleteRecording, { recordingId });
    }
  },
});

export const deleteRecording = internalMutation({
  args: { recordingId: v.id("recordings") },
  handler: async (ctx, { recordingId }) => {
    const recording = await ctx.db.get("recordings", recordingId);
    if (recording === null) return null;
    await ctx.storage.delete(recording.storageId);
    await ctx.db.delete("recordings", recordingId);
    return null;
  },
});

export const cachedAudio = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const hit = await ctx.db
      .query("ttsCache")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    return hit ? await ctx.storage.getUrl(hit.storageId) : null;
  },
});

export const cacheAudio = internalMutation({
  args: { key: v.string(), storageId: v.id("_storage") },
  handler: async (ctx, { key, storageId }) => {
    await ctx.db.insert("ttsCache", { key, storageId });
    return await ctx.storage.getUrl(storageId);
  },
});

// Pronunciation of a card's spoken text, rendered once and cached.
export const pronounce = action({
  args: { cardId: v.id("cards") },
  handler: async (ctx, { cardId }): Promise<string | null> => {
    const userId = await requireUserIdInAction(ctx);
    const owned = await ctx.runQuery(internal.practice.ownedCard, { cardId, userId });
    if (owned === null) throw new Error("Card not found");
    const voice = ttsVoicesFor(owned.targetLang)[0];
    const text = spokenText(owned.card);
    const key = `${voice.model}|${voice.voice}|${text}`;
    const cached = await ctx.runQuery(internal.practice.cachedAudio, { key });
    if (cached) return cached;
    const storageId = await ctx.storage.store(await speak(text, { model: voice.model, voice: voice.voice }));
    return await ctx.runMutation(internal.practice.cacheAudio, { key, storageId });
  },
});
