import { internalAction, internalMutation, internalQuery, mutation } from "./_generated/server";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { itemDetailsValidator, lessonGuideValidator } from "./schema";
import { requireItem, requireProfile } from "./lib/auth";
import { createAiContext, type AiContext } from "./lib/posthogAi";
import { writeItemDetails, writeLessonGuide } from "./ai/studyAi";
import { lessonItemIds } from "./units";

// Study material the coach writes in the background: details on items and
// read-through notes for lessons. New lessons get it when they're created;
// older ones through the "fill in" buttons. Only missing parts are written.

const BATCH_SIZE = 8;
const MAX_ITEMS_PER_RUN = 120;

const normalize = (key: string) => key.normalize("NFC").trim().toLowerCase();

// Marks the lesson and (up to a run's worth of) its items without details as
// being written, then writes them in the background.
export async function startLessonStudy(ctx: MutationCtx, lessonId: Id<"lessons">) {
  await ctx.db.patch("lessons", lessonId, { guideStatus: "writing" });
  let queued = 0;
  for (const itemId of await lessonItemIds(ctx, lessonId)) {
    if (queued === MAX_ITEMS_PER_RUN) break;
    const item = await ctx.db.get("items", itemId);
    if (item && !item.details) {
      await ctx.db.patch("items", itemId, { detailsStatus: "writing" });
      queued++;
    }
  }
  await ctx.scheduler.runAfter(0, internal.study.writeLesson, { lessonId });
}

export const fillLesson = mutation({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    const lesson = await ctx.db.get("lessons", lessonId);
    if (lesson === null) throw new Error("Lesson not found");
    await requireProfile(ctx, lesson.profileId);
    if (lesson.guideStatus === "writing" || lesson.status) return null;
    await startLessonStudy(ctx, lessonId);
    return null;
  },
});

export const fillItem = mutation({
  args: { itemId: v.id("items") },
  handler: async (ctx, { itemId }) => {
    const item = await requireItem(ctx, itemId);
    if (item.detailsStatus === "writing") return null;
    await ctx.db.patch("items", itemId, { detailsStatus: "writing" });
    await ctx.scheduler.runAfter(0, internal.study.writeItems, { profileId: item.profileId, itemIds: [itemId] });
    return null;
  },
});

// ---- Background writing -----------------------------------------------------

export const lessonContext = internalQuery({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    const lesson = await ctx.db.get("lessons", lessonId);
    if (lesson === null) return null;
    const profile = await ctx.db.get("profiles", lesson.profileId);
    const unit = await ctx.db.get("units", lesson.unitId);
    if (profile === null || unit === null) return null;
    const items = (await Promise.all((await lessonItemIds(ctx, lessonId)).map((id) => ctx.db.get("items", id)))).filter(
      (item): item is Doc<"items"> => item !== null,
    );
    return { lesson, profile, unitTitle: unit.title, items };
  },
});

export const itemsContext = internalQuery({
  args: { profileId: v.id("profiles"), itemIds: v.array(v.id("items")) },
  handler: async (ctx, { profileId, itemIds }) => {
    const profile = await ctx.db.get("profiles", profileId);
    if (profile === null) return null;
    const items = (await Promise.all(itemIds.map((id) => ctx.db.get("items", id)))).filter(
      (item): item is Doc<"items"> => item !== null && item.profileId === profileId,
    );
    return { profile, items };
  },
});

// Writes details for some items in batches, saving each batch as it lands.
// Items the model skipped or whose batch failed are marked failed.
async function writeDetails(
  ctx: ActionCtx,
  profile: Doc<"profiles">,
  items: Doc<"items">[],
  aiContext: AiContext,
  lessonTitle?: string,
) {
  const batches = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) batches.push(items.slice(i, i + BATCH_SIZE));
  const results = await Promise.allSettled(
    batches.map(async (batch) => {
      try {
        const written = await writeItemDetails(
          {
            baseLang: profile.baseLang,
            targetLang: profile.targetLang,
            lessonTitle,
            items: batch.map(({ kind, key, text, gloss, notes }) => ({ kind, key, text, gloss, notes })),
          },
          aiContext,
        );
        const byKey = new Map(written.map(({ key, ...details }) => [normalize(key), details]));
        const entries = batch.flatMap((item) => {
          const details = byKey.get(item.key);
          return details ? [{ itemId: item._id, details }] : [];
        });
        await ctx.runMutation(internal.study.saveDetails, { entries });
        const missing = batch.filter((item) => !byKey.has(item.key)).map((item) => item._id);
        if (missing.length > 0) {
          await ctx.runMutation(internal.study.failItems, { itemIds: missing });
          throw new Error(`No details returned for ${missing.length} items`);
        }
      } catch (e) {
        await ctx.runMutation(internal.study.failItems, { itemIds: batch.map((item) => item._id) });
        throw e;
      }
    }),
  );
  return results.filter((r) => r.status === "rejected").length === 0;
}

export const writeLesson = internalAction({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    const c = await ctx.runQuery(internal.study.lessonContext, { lessonId });
    if (c === null) return null;
    const aiContext = createAiContext({ scheduler: ctx.scheduler, distinctId: c.profile.userId });
    const missing = c.items.filter((item) => !item.details && item.detailsStatus === "writing");
    const guide = async () => {
      if (c.lesson.guide) return true;
      const written = await writeLessonGuide(
        {
          baseLang: c.profile.baseLang,
          targetLang: c.profile.targetLang,
          unitTitle: c.unitTitle,
          title: c.lesson.title,
          description: c.lesson.description,
          items: c.items.map(({ kind, key, text, gloss, notes }) => ({ kind, key, text, gloss, notes })),
        },
        aiContext,
      );
      await ctx.runMutation(internal.study.saveGuide, { lessonId, guide: written });
      return true;
    };
    const [detailsOk, guideOk] = await Promise.all([
      writeDetails(ctx, c.profile, missing, aiContext, c.lesson.title),
      guide().catch(() => false),
    ]);
    await ctx.runMutation(internal.study.finishLesson, { lessonId, failed: !detailsOk || !guideOk });
    return null;
  },
});

export const writeItems = internalAction({
  args: { profileId: v.id("profiles"), itemIds: v.array(v.id("items")) },
  handler: async (ctx, { profileId, itemIds }) => {
    const c = await ctx.runQuery(internal.study.itemsContext, { profileId, itemIds });
    if (c === null) return null;
    const aiContext = createAiContext({ scheduler: ctx.scheduler, distinctId: c.profile.userId });
    await writeDetails(ctx, c.profile, c.items, aiContext);
    return null;
  },
});

export const saveDetails = internalMutation({
  args: { entries: v.array(v.object({ itemId: v.id("items"), details: itemDetailsValidator })) },
  handler: async (ctx, { entries }) => {
    for (const { itemId, details } of entries) {
      await ctx.db.patch("items", itemId, { details, detailsStatus: undefined });
    }
    return null;
  },
});

export const failItems = internalMutation({
  args: { itemIds: v.array(v.id("items")) },
  handler: async (ctx, { itemIds }) => {
    for (const itemId of itemIds) {
      const item = await ctx.db.get("items", itemId);
      if (item && !item.details) await ctx.db.patch("items", itemId, { detailsStatus: "failed" });
    }
    return null;
  },
});

export const saveGuide = internalMutation({
  args: { lessonId: v.id("lessons"), guide: lessonGuideValidator },
  handler: async (ctx, { lessonId, guide }) => {
    await ctx.db.patch("lessons", lessonId, { guide });
    return null;
  },
});

export const finishLesson = internalMutation({
  args: { lessonId: v.id("lessons"), failed: v.boolean() },
  handler: async (ctx, { lessonId, failed }) => {
    await ctx.db.patch("lessons", lessonId, { guideStatus: failed ? "failed" : undefined });
    return null;
  },
});

// Prompt check without a profile:
// npx convex run study:smokeTest '{"baseLang":"es","targetLang":"fr","items":[{"kind":"lemma","key":"aller","text":"aller","gloss":"ir"}]}'
export const smokeTest = internalAction({
  args: {
    baseLang: v.string(),
    targetLang: v.string(),
    title: v.optional(v.string()),
    items: v.array(v.object({ kind: v.string(), key: v.string(), text: v.string(), gloss: v.optional(v.string()) })),
  },
  handler: async (_ctx, { baseLang, targetLang, title, items }) => {
    const started = Date.now();
    const [details, guide] = await Promise.all([
      writeItemDetails({ baseLang, targetLang, lessonTitle: title, items }),
      title ? writeLessonGuide({ baseLang, targetLang, unitTitle: "Smoke test", title, items }) : null,
    ]);
    return { ms: Date.now() - started, details, guide };
  },
});
