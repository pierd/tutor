import { getAuthUserId } from "@convex-dev/auth/server";
import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { requireProfile } from "./lib/auth";
import { ttsVoicesFor } from "./lib/voices";
import { speak } from "./ai/voice";
import { drawIllustration, generateReading } from "./ai/readingAi";
import { recordEvidence } from "./items";
import { lessonItemIds } from "./units";

// Reading comprehension: one AI-written text per lesson, reused until the
// learner asks for a new one. Questions are graded locally; tapping a word
// records `lookup` evidence for its item.

const MAX_TARGETS = 25;

async function readingsFor(ctx: QueryCtx, profileId: Id<"profiles">, lessonId?: Id<"lessons">) {
  const rows = await ctx.db
    .query("readings")
    .withIndex("by_profileId", (q) => q.eq("profileId", profileId))
    .order("desc")
    .take(100);
  return rows.filter((r) => r.lessonId === lessonId);
}

async function withUrls(ctx: QueryCtx, reading: Doc<"readings">) {
  const { audioStorageId, illustrations, ...rest } = reading;
  return {
    ...rest,
    hasAudio: audioStorageId !== undefined,
    illustrations: await Promise.all(
      (illustrations ?? []).map(async ({ paragraph, storageId, failed }) => ({
        paragraph,
        failed: failed ?? false,
        url: storageId ? await ctx.storage.getUrl(storageId) : null,
      })),
    ),
  };
}

// The newest text for the lesson (or the one being generated).
export const current = query({
  args: { profileId: v.id("profiles"), lessonId: v.optional(v.id("lessons")) },
  handler: async (ctx, { profileId, lessonId }) => {
    await requireProfile(ctx, profileId);
    const [latest] = await readingsFor(ctx, profileId, lessonId);
    return latest ? await withUrls(ctx, latest) : null;
  },
});

export const get = query({
  args: { readingId: v.id("readings") },
  handler: async (ctx, { readingId }) => {
    const reading = await ctx.db.get("readings", readingId);
    if (reading === null) return null;
    await requireProfile(ctx, reading.profileId);
    return await withUrls(ctx, reading);
  },
});

// Earlier texts for the lesson, newest first, to revisit.
export const history = query({
  args: { profileId: v.id("profiles"), lessonId: v.optional(v.id("lessons")) },
  handler: async (ctx, { profileId, lessonId }) => {
    await requireProfile(ctx, profileId);
    const rows = await readingsFor(ctx, profileId, lessonId);
    return rows
      .filter((r) => r.status === "ready")
      .map((r) => ({
        _id: r._id,
        _creationTime: r._creationTime,
        title: r.title ?? "",
        lastScore: r.lastScore,
        withImages: r.withImages ?? false,
      }));
  },
});

export const generate = mutation({
  args: { profileId: v.id("profiles"), lessonId: v.optional(v.id("lessons")), withImages: v.optional(v.boolean()) },
  handler: async (ctx, { profileId, lessonId, withImages }) => {
    await requireProfile(ctx, profileId);
    if (lessonId) {
      const lesson = await ctx.db.get("lessons", lessonId);
      if (lesson === null || lesson.profileId !== profileId) throw new Error("Lesson not found");
    }
    const [latest] = await readingsFor(ctx, profileId, lessonId);
    if (latest?.status === "generating") return latest._id;
    const readingId = await ctx.db.insert("readings", {
      profileId,
      lessonId,
      status: "generating",
      glossary: [],
      questions: [],
      withImages: withImages ?? false,
    });
    await ctx.scheduler.runAfter(0, internal.reading.write, { readingId });
    return readingId;
  },
});

export const writeContext = internalQuery({
  args: { readingId: v.id("readings") },
  handler: async (ctx, { readingId }) => {
    const reading = await ctx.db.get("readings", readingId);
    if (reading === null || reading.status !== "generating") return null;
    const profile = await ctx.db.get("profiles", reading.profileId);
    if (profile === null) return null;
    const all = await ctx.db
      .query("items")
      .withIndex("by_profileId_and_kind_and_key", (q) => q.eq("profileId", profile._id))
      .take(500);
    let targets: Doc<"items">[];
    let lessonTitle: string | undefined;
    if (reading.lessonId) {
      const ids = new Set(await lessonItemIds(ctx, reading.lessonId));
      targets = all.filter((item) => ids.has(item._id));
      lessonTitle = (await ctx.db.get("lessons", reading.lessonId))?.title;
    } else {
      // Everything: what's due or weakest among practised items.
      targets = all.filter((item) => item.reps > 0 || item.lapses > 0).sort((a, b) => a.due - b.due);
    }
    const known = all
      .filter((item) => item.reps > 0 && item.kind !== "grammar")
      .sort((a, b) => b.intervalDays - a.intervalDays)
      .slice(0, 40)
      .map((item) => item.text);
    const earlier = (await readingsFor(ctx, profile._id, reading.lessonId))
      .flatMap((r) => (r.title ? [r.title] : []))
      .slice(0, 10);
    return {
      profile,
      withImages: reading.withImages ?? false,
      lessonTitle,
      targets: targets.slice(0, MAX_TARGETS).map(({ key, text, gloss }) => ({ key, text, gloss })),
      known,
      avoidTitles: earlier,
    };
  },
});

export const write = internalAction({
  args: { readingId: v.id("readings") },
  handler: async (ctx, { readingId }) => {
    const c = await ctx.runQuery(internal.reading.writeContext, { readingId });
    if (c === null) return null;
    try {
      const reading = await generateReading({
        baseLang: c.profile.baseLang,
        targetLang: c.profile.targetLang,
        goal: c.profile.goal,
        lessonTitle: c.lessonTitle,
        targets: c.targets,
        known: c.known,
        avoidTitles: c.avoidTitles,
        withImages: c.withImages,
      });
      await ctx.runMutation(internal.reading.save, { readingId, ...reading, illustrations: reading.illustrations ?? [] });
    } catch (e) {
      await ctx.runMutation(internal.reading.fail, { readingId, error: e instanceof Error ? e.message : String(e) });
    }
    return null;
  },
});

export const save = internalMutation({
  args: {
    readingId: v.id("readings"),
    title: v.string(),
    text: v.string(),
    glossary: v.array(v.object({ surface: v.string(), gloss: v.string(), itemKey: v.optional(v.string()) })),
    questions: v.array(
      v.object({
        kind: v.union(v.literal("truefalse"), v.literal("choice")),
        question: v.string(),
        options: v.array(v.string()),
        answerIndex: v.number(),
        explanation: v.optional(v.string()),
        itemKeys: v.array(v.string()),
      }),
    ),
    illustrations: v.array(v.object({ paragraph: v.number(), prompt: v.string() })),
  },
  handler: async (ctx, { readingId, illustrations, ...content }) => {
    await ctx.db.patch("readings", readingId, { ...content, illustrations, status: "ready" });
    // The text is readable right away; pictures fill in as they're drawn.
    for (const index of illustrations.keys()) {
      await ctx.scheduler.runAfter(0, internal.reading.draw, { readingId, index });
    }
    return null;
  },
});

export const illustrationPrompt = internalQuery({
  args: { readingId: v.id("readings"), index: v.number() },
  handler: async (ctx, { readingId, index }) => {
    const reading = await ctx.db.get("readings", readingId);
    return reading?.illustrations?.[index]?.prompt ?? null;
  },
});

export const draw = internalAction({
  args: { readingId: v.id("readings"), index: v.number() },
  handler: async (ctx, { readingId, index }) => {
    const prompt = await ctx.runQuery(internal.reading.illustrationPrompt, { readingId, index });
    if (prompt === null) return null;
    try {
      const storageId = await ctx.storage.store(await drawIllustration(prompt));
      await ctx.runMutation(internal.reading.saveIllustration, { readingId, index, storageId });
    } catch (e) {
      console.warn("Illustration failed", e);
      await ctx.runMutation(internal.reading.saveIllustration, { readingId, index });
    }
    return null;
  },
});

export const saveIllustration = internalMutation({
  args: { readingId: v.id("readings"), index: v.number(), storageId: v.optional(v.id("_storage")) },
  handler: async (ctx, { readingId, index, storageId }) => {
    const reading = await ctx.db.get("readings", readingId);
    if (reading === null || !reading.illustrations?.[index]) return null;
    const illustrations = reading.illustrations.map((ill, i) =>
      i === index ? { ...ill, storageId, failed: storageId === undefined } : ill,
    );
    await ctx.db.patch("readings", readingId, { illustrations });
    return null;
  },
});

export const fail = internalMutation({
  args: { readingId: v.id("readings"), error: v.string() },
  handler: async (ctx, { readingId, error }) => {
    await ctx.db.patch("readings", readingId, { status: "failed", error });
    return null;
  },
});

// Records the outcome: lookups are soft fails for their items; questions
// answered correctly credit the items they test (wrong answers only count as
// exposure, since a comprehension slip doesn't pin down a word).
export const submit = mutation({
  args: {
    readingId: v.id("readings"),
    answers: v.array(v.number()),
    lookedUp: v.array(v.string()),
  },
  handler: async (ctx, { readingId, answers, lookedUp }) => {
    const reading = await ctx.db.get("readings", readingId);
    if (reading === null || reading.status !== "ready") throw new Error("Reading not found");
    await requireProfile(ctx, reading.profileId);
    const items = await ctx.db
      .query("items")
      .withIndex("by_profileId_and_kind_and_key", (q) => q.eq("profileId", reading.profileId))
      .take(2000);
    const byKey = new Map(items.map((item) => [item.key, item]));
    const outcomes = new Map<string, "correct" | "exposure" | "lookup">();
    reading.questions.forEach((question, i) => {
      const correct = answers[i] === question.answerIndex;
      for (const key of question.itemKeys) {
        if (outcomes.get(key) !== "exposure") outcomes.set(key, correct ? "correct" : "exposure");
      }
    });
    for (const key of lookedUp.slice(0, 100)) outcomes.set(key, "lookup");
    for (const [key, outcome] of outcomes) {
      const item = byKey.get(key.trim().toLowerCase());
      if (item) await recordEvidence(ctx, item, { outcome, source: "reading" });
    }
    const score = reading.questions.length
      ? reading.questions.filter((q, i) => answers[i] === q.answerIndex).length / reading.questions.length
      : 0;
    await ctx.db.patch("readings", readingId, { lastScore: score, lastAnswers: answers });
    return score;
  },
});

// ---- Read aloud ---------------------------------------------------------------

export const ownedReading = internalQuery({
  args: { readingId: v.id("readings"), userId: v.id("users") },
  handler: async (ctx, { readingId, userId }) => {
    const reading = await ctx.db.get("readings", readingId);
    if (reading === null) return null;
    const profile = await ctx.db.get("profiles", reading.profileId);
    if (profile === null || profile.userId !== userId) return null;
    const audioUrl = reading.audioStorageId ? await ctx.storage.getUrl(reading.audioStorageId) : null;
    return { text: reading.text, targetLang: profile.targetLang, audioUrl };
  },
});

export const saveAudio = internalMutation({
  args: { readingId: v.id("readings"), storageId: v.id("_storage") },
  handler: async (ctx, { readingId, storageId }) => {
    await ctx.db.patch("readings", readingId, { audioStorageId: storageId });
    return await ctx.storage.getUrl(storageId);
  },
});

// TTS of the whole text, rendered on first request and kept.
export const audio = action({
  args: { readingId: v.id("readings") },
  handler: async (ctx, { readingId }): Promise<string | null> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const reading = await ctx.runQuery(internal.reading.ownedReading, { readingId, userId });
    if (reading === null || !reading.text) throw new Error("Reading not found");
    if (reading.audioUrl) return reading.audioUrl;
    const voice = ttsVoicesFor(reading.targetLang)[0];
    const storageId = await ctx.storage.store(await speak(reading.text, { model: voice.model, voice: voice.voice }));
    return await ctx.runMutation(internal.reading.saveAudio, { readingId, storageId });
  },
});

// npx convex run reading:smokeTest '{"baseLang":"es","targetLang":"fr","withImages":true}'
export const smokeTest = internalAction({
  args: { baseLang: v.string(), targetLang: v.string(), withImages: v.optional(v.boolean()) },
  handler: async (ctx, { baseLang, targetLang, withImages }) => {
    const started = Date.now();
    const reading = await generateReading({
      baseLang,
      targetLang,
      lessonTitle: "Être",
      targets: [
        { key: "être", text: "être", gloss: "ser, estar" },
        { key: "present:etre", text: "Présent : être", gloss: "presente de être" },
      ],
      known: ["je", "tu", "il", "elle", "nous", "avoir", "maison", "content", "grand"],
      avoidTitles: [],
      withImages,
    });
    const ms = Date.now() - started;
    const first = reading.illustrations?.[0];
    if (!first) return { ms, ...reading };
    const t0 = Date.now();
    const blob = await drawIllustration(first.prompt);
    const storageId = await ctx.storage.store(blob);
    return { ms, ...reading, imageMs: Date.now() - t0, imageBytes: blob.size, imageUrl: await ctx.storage.getUrl(storageId) };
  },
});
