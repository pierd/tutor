import { getAuthUserId } from "@convex-dev/auth/server";
import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { requireProfile } from "./lib/auth";
import { recordEvidence, recordMistake, upsertItem } from "./items";
import { lessonItemIds } from "./units";
import { DEFAULT_STT_MODEL, ttsVoicesFor } from "./lib/voices";
import { speak, transcribe } from "./ai/voice";
import { generateExercise, gradeAnswer, type Graded } from "./ai/translationAi";

// Translation challenge: the database picks what to practise, the AI writes
// a sentence around it and grades the answer, and results feed the learner
// model via recordEvidence/recordMistake.

const TARGETS_PER_EXERCISE = 2;
const KNOWN_SAMPLE = 40;
const NEW_ITEM_ACCURACY = 0.8;

async function pendingExercise(ctx: MutationCtx, profileId: Id<"profiles">, lessonId?: Id<"lessons">) {
  for (const status of ["ready", "generating"] as const) {
    const pending = await ctx.db
      .query("exercises")
      .withIndex("by_profileId_and_status", (q) => q.eq("profileId", profileId).eq("status", status))
      .take(50);
    const exercise = pending.find((e) => e.lessonId === lessonId);
    if (exercise) return exercise;
  }
  return null;
}

// Within a lesson: due items first, then the least recently reviewed, so a
// lesson can always be practised.
async function pickLessonTargets(ctx: MutationCtx, lessonId: Id<"lessons">, now: number) {
  const items = (await Promise.all((await lessonItemIds(ctx, lessonId)).map((id) => ctx.db.get("items", id)))).filter(
    (item): item is Doc<"items"> => item !== null && !item.suspended,
  );
  const shuffled = items.sort(() => Math.random() - 0.5);
  const due = shuffled.filter((item) => item.due <= now);
  const rest = shuffled.filter((item) => item.due > now).sort((a, b) => (a.lastReviewedAt ?? 0) - (b.lastReviewedAt ?? 0));
  return [...due, ...rest].slice(0, TARGETS_PER_EXERCISE);
}

// Everything: due items first, previously reviewed ones before brand-new.
async function pickTargets(ctx: MutationCtx, profileId: Id<"profiles">, now: number) {
  const due = await ctx.db
    .query("items")
    .withIndex("by_profileId_and_due", (q) => q.eq("profileId", profileId).lte("due", now))
    .take(50);
  const candidates = due.filter((item) => !item.suspended);
  const reviewed = candidates.filter((item) => item.lastReviewedAt !== undefined);
  const fresh = candidates.filter((item) => item.lastReviewedAt === undefined);
  // Shuffle new items so the starter set isn't introduced alphabetically.
  fresh.sort(() => Math.random() - 0.5);
  return [...reviewed, ...fresh].slice(0, TARGETS_PER_EXERCISE);
}

async function recentAccuracy(ctx: MutationCtx, profileId: Id<"profiles">) {
  const attempts = await ctx.db
    .query("attempts")
    .withIndex("by_profileId", (q) => q.eq("profileId", profileId))
    .order("desc")
    .take(10);
  if (attempts.length < 5) return null;
  return attempts.filter((a) => a.verdict === "correct").length / attempts.length;
}

// Returns the pending exercise for the profile (and lesson), creating and
// generating one if needed. Only "Everything" may introduce new items.
async function ensurePending(ctx: MutationCtx, profileId: Id<"profiles">, lessonId?: Id<"lessons">) {
  const pending = await pendingExercise(ctx, profileId, lessonId);
  if (pending) return pending._id;
  const now = Date.now();
  const targets = lessonId ? await pickLessonTargets(ctx, lessonId, now) : await pickTargets(ctx, profileId, now);
  const accuracy = await recentAccuracy(ctx, profileId);
  const allowNewItem =
    !lessonId &&
    (targets.length === 0 || (targets.length < TARGETS_PER_EXERCISE && (accuracy ?? 1) >= NEW_ITEM_ACCURACY));
  const exerciseId = await ctx.db.insert("exercises", {
    profileId,
    lessonId,
    status: "generating",
    itemIds: targets.map((t) => t._id),
    allowNewItem,
    answers: [],
  });
  await ctx.scheduler.runAfter(0, internal.translation.generate, { exerciseId });
  return exerciseId;
}

export const next = mutation({
  args: { profileId: v.id("profiles"), lessonId: v.optional(v.id("lessons")) },
  handler: async (ctx, { profileId, lessonId }) => {
    await requireProfile(ctx, profileId);
    if (lessonId) {
      const lesson = await ctx.db.get("lessons", lessonId);
      if (lesson === null || lesson.profileId !== profileId) throw new Error("Lesson not found");
    }
    return await ensurePending(ctx, profileId, lessonId);
  },
});

export const skip = mutation({
  args: { exerciseId: v.id("exercises") },
  handler: async (ctx, { exerciseId }) => {
    const exercise = await ctx.db.get("exercises", exerciseId);
    if (exercise === null) throw new Error("Exercise not found");
    await requireProfile(ctx, exercise.profileId);
    if (exercise.status === "ready" || exercise.status === "failed") {
      await ctx.db.patch("exercises", exerciseId, { status: "skipped" });
    }
    return await ensurePending(ctx, exercise.profileId, exercise.lessonId);
  },
});

export const get = query({
  args: { exerciseId: v.id("exercises") },
  handler: async (ctx, { exerciseId }) => {
    const exercise = await ctx.db.get("exercises", exerciseId);
    if (exercise === null) return null;
    await requireProfile(ctx, exercise.profileId);
    const attempts = await ctx.db
      .query("attempts")
      .withIndex("by_exerciseId", (q) => q.eq("exerciseId", exerciseId))
      .take(5);
    const items = await Promise.all(exercise.itemIds.map((id) => ctx.db.get("items", id)));
    const itemText = new Map(items.flatMap((item) => (item ? [[item._id, item.text] as const] : [])));
    const answered = exercise.status === "answered";
    return {
      _id: exercise._id,
      status: exercise.status,
      prompt: exercise.prompt,
      hint: exercise.hint,
      error: exercise.error,
      // Revealed only after answering.
      answers: answered ? exercise.answers : [],
      audioUrl: answered && exercise.audioStorageId ? await ctx.storage.getUrl(exercise.audioStorageId) : null,
      attempts: attempts.map((attempt) => ({
        ...attempt,
        itemResults: attempt.itemResults.map((r) => ({ ...r, text: itemText.get(r.itemId) ?? "" })),
      })),
    };
  },
});

// ---- Generation -----------------------------------------------------------

export const generationContext = internalQuery({
  args: { exerciseId: v.id("exercises") },
  handler: async (ctx, { exerciseId }) => {
    const exercise = await ctx.db.get("exercises", exerciseId);
    if (exercise === null || exercise.status !== "generating") return null;
    const profile = await ctx.db.get("profiles", exercise.profileId);
    if (profile === null) return null;
    const targets = (await Promise.all(exercise.itemIds.map((id) => ctx.db.get("items", id)))).filter(
      (item): item is Doc<"items"> => item !== null,
    );
    const pool = await ctx.db
      .query("items")
      .withIndex("by_profileId_and_kind_and_key", (q) => q.eq("profileId", profile._id))
      .take(500);
    const known = pool
      .filter((item) => item.lastReviewedAt !== undefined && item.kind !== "grammar")
      .sort((a, b) => b.intervalDays - a.intervalDays)
      .slice(0, KNOWN_SAMPLE)
      .map((item) => item.text);
    const recent = await ctx.db
      .query("exercises")
      .withIndex("by_profileId_and_status", (q) => q.eq("profileId", profile._id).eq("status", "answered"))
      .order("desc")
      .take(8);
    return {
      profile,
      exercise,
      targets: targets.map(({ key, kind, text, gloss }) => ({ key, kind, text, gloss })),
      known,
      recentPrompts: recent.flatMap((e) => (e.prompt ? [e.prompt] : [])),
    };
  },
});

export const generate = internalAction({
  args: { exerciseId: v.id("exercises") },
  handler: async (ctx, { exerciseId }) => {
    const context = await ctx.runQuery(internal.translation.generationContext, { exerciseId });
    if (context === null) return null;
    const { profile, exercise } = context;
    try {
      const generated = await generateExercise({
        baseLang: profile.baseLang,
        targetLang: profile.targetLang,
        goal: profile.goal,
        targets: context.targets,
        known: context.known,
        recentPrompts: context.recentPrompts,
        allowNewItem: exercise.allowNewItem,
      });
      // Pre-render the model answer so feedback can play it instantly.
      let audioStorageId: Id<"_storage"> | undefined;
      const voice = ttsVoicesFor(profile.targetLang)[0];
      try {
        audioStorageId = await ctx.storage.store(
          await speak(generated.answers[0], { model: voice.model, voice: voice.voice }),
        );
      } catch (e) {
        console.warn("TTS failed, continuing without audio", e);
      }
      await ctx.runMutation(internal.translation.saveGenerated, {
        exerciseId,
        prompt: generated.prompt,
        answers: generated.answers,
        hint: generated.hint,
        itemKeys: generated.itemKeys,
        newItem: exercise.allowNewItem ? generated.newItem : undefined,
        audioStorageId,
      });
    } catch (e) {
      await ctx.runMutation(internal.translation.markFailed, {
        exerciseId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
    return null;
  },
});

export const saveGenerated = internalMutation({
  args: {
    exerciseId: v.id("exercises"),
    prompt: v.string(),
    answers: v.array(v.string()),
    hint: v.optional(v.string()),
    itemKeys: v.array(v.string()),
    newItem: v.optional(
      v.object({
        kind: v.union(v.literal("lemma"), v.literal("chunk"), v.literal("grammar")),
        key: v.string(),
        text: v.string(),
        gloss: v.string(),
      }),
    ),
    audioStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, { exerciseId, itemKeys, newItem, ...fields }) => {
    const exercise = await ctx.db.get("exercises", exerciseId);
    if (exercise === null || exercise.status !== "generating") return null;
    // Keep only targets the sentence really uses; the rest stay due.
    const targets = (await Promise.all(exercise.itemIds.map((id) => ctx.db.get("items", id)))).filter(
      (item): item is Doc<"items"> => item !== null,
    );
    const used = new Set(itemKeys.map((k) => k.trim().toLowerCase()));
    const itemIds = targets.filter((t) => used.has(t.key)).map((t) => t._id);
    if (itemIds.length === 0) itemIds.push(...targets.map((t) => t._id));
    if (newItem) {
      const { itemId } = await upsertItem(ctx, exercise.profileId, newItem);
      if (!itemIds.includes(itemId)) itemIds.push(itemId);
    }
    await ctx.db.patch("exercises", exerciseId, { ...fields, itemIds, status: "ready" });
    return null;
  },
});

export const markFailed = internalMutation({
  args: { exerciseId: v.id("exercises"), error: v.string() },
  handler: async (ctx, { exerciseId, error }) => {
    await ctx.db.patch("exercises", exerciseId, { status: "failed", error });
    return null;
  },
});

// ---- Answering ------------------------------------------------------------

export const gradingContext = internalQuery({
  args: { exerciseId: v.id("exercises"), userId: v.id("users") },
  handler: async (ctx, { exerciseId, userId }) => {
    const exercise = await ctx.db.get("exercises", exerciseId);
    if (exercise === null) throw new Error("Exercise not found");
    const profile = await ctx.db.get("profiles", exercise.profileId);
    if (profile === null || profile.userId !== userId) throw new Error("Exercise not found");
    if (exercise.status !== "ready" && exercise.status !== "answered") {
      throw new Error("Exercise can't be answered");
    }
    const items = (await Promise.all(exercise.itemIds.map((id) => ctx.db.get("items", id)))).filter(
      (item): item is Doc<"items"> => item !== null,
    );
    return { exercise, profile, items };
  },
});

type GradingContext = {
  exercise: Doc<"exercises">;
  profile: Doc<"profiles">;
  items: Doc<"items">[];
};

async function gradeAndSave(
  ctx: ActionCtx,
  { exercise, profile, items }: GradingContext,
  args: { mode: "speech" | "text"; answer: string; recordingId?: Id<"recordings"> },
) {
  const graded: Graded = await gradeAnswer({
    baseLang: profile.baseLang,
    targetLang: profile.targetLang,
    prompt: exercise.prompt ?? "",
    answers: exercise.answers,
    items: items.map(({ key, kind, text, gloss }) => ({ key, kind, text, gloss })),
    mode: args.mode,
    answer: args.answer,
  });
  const byKey = new Map(graded.items.map((r) => [r.key.trim().toLowerCase(), r]));
  const itemResults = items.map((item) => {
    const result = byKey.get(item.key);
    const outcome = result?.outcome ?? "incorrect";
    return {
      itemId: item._id,
      // Typed answers can't be "inaudible".
      outcome: args.mode === "text" && outcome === "inaudible" ? ("incorrect" as const) : outcome,
      note: result?.note,
    };
  });
  return await ctx.runMutation(internal.translation.saveAttempt, {
    exerciseId: exercise._id,
    mode: args.mode,
    answer: args.answer,
    recordingId: args.recordingId,
    verdict: graded.verdict,
    corrected: graded.corrected,
    feedback: graded.feedback,
    itemResults,
    mistakes: graded.mistakes,
    needsTypedCheck: args.mode === "speech" && graded.needsTypedCheck,
  });
}

export const submitSpeech = action({
  args: { exerciseId: v.id("exercises"), recordingId: v.id("recordings") },
  handler: async (ctx, { exerciseId, recordingId }): Promise<Id<"attempts">> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const recording = await ctx.runQuery(internal.recordings.getOwned, { recordingId, userId });
    if (recording === null) throw new Error("Recording not found");
    const context: GradingContext = await ctx.runQuery(internal.translation.gradingContext, { exerciseId, userId });
    const blob = await ctx.storage.get(recording.storageId);
    if (blob === null) throw new Error("Recording file missing");
    const { text } = await transcribe(await blob.arrayBuffer(), recording.mediaType, {
      model: DEFAULT_STT_MODEL,
      language: context.profile.targetLang,
    });
    return await gradeAndSave(ctx, context, { mode: "speech", answer: text, recordingId });
  },
});

export const submitText = action({
  args: { exerciseId: v.id("exercises"), text: v.string() },
  handler: async (ctx, { exerciseId, text }): Promise<Id<"attempts">> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Not authenticated");
    const answer = text.trim();
    if (answer === "" || answer.length > 500) throw new Error("Answer must be 1–500 characters");
    const context: GradingContext = await ctx.runQuery(internal.translation.gradingContext, { exerciseId, userId });
    return await gradeAndSave(ctx, context, { mode: "text", answer });
  },
});

const itemResultValidator = v.object({
  itemId: v.id("items"),
  outcome: v.union(v.literal("correct"), v.literal("incorrect"), v.literal("inaudible")),
  note: v.optional(v.string()),
});

export const saveAttempt = internalMutation({
  args: {
    exerciseId: v.id("exercises"),
    mode: v.union(v.literal("speech"), v.literal("text")),
    answer: v.string(),
    recordingId: v.optional(v.id("recordings")),
    verdict: v.union(v.literal("correct"), v.literal("almost"), v.literal("incorrect")),
    corrected: v.string(),
    feedback: v.string(),
    itemResults: v.array(itemResultValidator),
    mistakes: v.array(v.object({ pattern: v.string(), description: v.string() })),
    needsTypedCheck: v.boolean(),
  },
  handler: async (ctx, args) => {
    const exercise = await ctx.db.get("exercises", args.exerciseId);
    if (exercise === null) throw new Error("Exercise not found");
    const previous = await ctx.db
      .query("attempts")
      .withIndex("by_exerciseId", (q) => q.eq("exerciseId", args.exerciseId))
      .take(5);
    const attemptId = await ctx.db.insert("attempts", {
      ...args,
      profileId: exercise.profileId,
      contested: false,
    });

    // The first attempt counts fully. A typed follow-up only settles items the
    // spoken attempt couldn't judge.
    const inaudibleBefore = new Set(
      previous.flatMap((a) => a.itemResults.filter((r) => r.outcome === "inaudible").map((r) => r.itemId)),
    );
    const counts = (itemId: Id<"items">) => previous.length === 0 || inaudibleBefore.has(itemId);
    const srsBefore = [];
    for (const result of args.itemResults) {
      if (!counts(result.itemId)) continue;
      const item = await ctx.db.get("items", result.itemId);
      if (item === null) continue;
      srsBefore.push(
        await recordEvidence(ctx, item, {
          outcome: result.outcome === "inaudible" ? "exposure" : result.outcome,
          source: `translation:${args.mode}`,
          detail: args.answer,
        }),
      );
    }
    await ctx.db.patch("attempts", attemptId, { srsBefore });
    if (previous.length === 0) {
      for (const mistake of args.mistakes) await recordMistake(ctx, exercise.profileId, mistake);
      await ctx.db.patch("exercises", args.exerciseId, { status: "answered" });
      // Prepare the next sentence while the learner reads the feedback.
      await ensurePending(ctx, exercise.profileId, exercise.lessonId);
    }
    return attemptId;
  },
});

// The learner disagrees with a grade: undo its negative effects.
export const contest = mutation({
  args: { attemptId: v.id("attempts") },
  handler: async (ctx, { attemptId }) => {
    const attempt = await ctx.db.get("attempts", attemptId);
    if (attempt === null) throw new Error("Attempt not found");
    await requireProfile(ctx, attempt.profileId);
    if (attempt.contested) return null;
    await ctx.db.patch("attempts", attemptId, { contested: true });
    // Restore the schedules the failed items had before this attempt.
    for (const result of attempt.itemResults) {
      if (result.outcome !== "incorrect") continue;
      const before = attempt.srsBefore?.find((s) => s.itemId === result.itemId);
      const item = await ctx.db.get("items", result.itemId);
      if (item === null || before === undefined) continue;
      const { itemId, ...state } = before;
      await ctx.db.patch("items", itemId, state);
      await ctx.db.insert("evidence", {
        profileId: attempt.profileId,
        itemId,
        outcome: "correct",
        source: "contest",
        detail: attempt.answer,
      });
    }
    for (const { pattern } of attempt.mistakes) {
      const mistake = await ctx.db
        .query("mistakes")
        .withIndex("by_profileId_and_pattern", (q) => q.eq("profileId", attempt.profileId).eq("pattern", pattern))
        .unique();
      if (mistake === null) continue;
      if (mistake.count <= 1) await ctx.db.delete("mistakes", mistake._id);
      else await ctx.db.patch("mistakes", mistake._id, { count: mistake.count - 1 });
    }
    return null;
  },
});

// Prompt check without the UI:
// npx convex run translation:smokeTest '{"baseLang":"es","targetLang":"fr","answer":"…"}'
export const smokeTest = internalAction({
  args: {
    baseLang: v.string(),
    targetLang: v.string(),
    answer: v.optional(v.string()),
    mode: v.optional(v.union(v.literal("speech"), v.literal("text"))),
    // Skip generation and grade against a fixed sentence.
    prompt: v.optional(v.string()),
    answers: v.optional(v.array(v.string())),
    // Simulate an empty profile: no targets, AI must introduce an item.
    empty: v.optional(v.boolean()),
  },
  handler: async (_ctx, { baseLang, targetLang, answer, mode, prompt, answers, empty }) => {
    const targets = empty ? [] : [
      { key: "aller", kind: "lemma", text: "aller", gloss: "ir" },
      { key: "present:etre", kind: "grammar", text: "Présent : être", gloss: "presente de être" },
    ];
    const t0 = Date.now();
    const generated = prompt && answers ? { prompt, answers } : await generateExercise({
      baseLang,
      targetLang,
      targets,
      known: empty ? [] : ["je", "tu", "il", "elle", "nous", "être", "avoir", "manger", "parler"],
      recentPrompts: [],
      allowNewItem: !!empty,
    });
    const generateMs = Date.now() - t0;
    if (!answer) return { generateMs, generated };
    const t1 = Date.now();
    const graded = await gradeAnswer({
      baseLang,
      targetLang,
      prompt: generated.prompt,
      answers: generated.answers,
      items: targets,
      mode: mode ?? "speech",
      answer,
    });
    return { generateMs, generated, gradeMs: Date.now() - t1, graded };
  },
});
