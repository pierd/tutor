import { Agent, createThread, createTool, listUIMessages, saveMessage, stepCountIs, syncStreams, vStreamArgs } from "@convex-dev/agent";
import { convexGateway } from "@convex-dev/ai-sdk-provider";
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { z } from "zod";
import { components, internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { COACH_MODEL } from "./ai/models";
import { buildLessonContent, cardSchema, cleanContent, contentRules, itemSchema } from "./ai/lessonContent";
import { guideSchema, itemDetailsSchema } from "./ai/studyAi";
import { languageLabel } from "./ai/translationAi";
import { requireItem, requireProfile } from "./lib/auth";
import { lessonOutlineValidator, seedCardValidator, seedItemValidator } from "./seeds/validators";
import { coachFocusValidator, itemDetailsValidator, lessonGuideValidator } from "./schema";
import { addLessonContent, createUnit, lessonItemIds, nextLessonOrder } from "./units";
import { captureAiGeneration, captureAiToolSpan, createAiContext } from "./lib/posthogAi";
import { startLessonStudy } from "./study";

// Coach chat: the learner and the coach shape lessons and units together.
// The coach only *proposes* (tools write to `proposals`); content is created
// when the learner accepts a proposal card in the chat.

async function requireThread(ctx: QueryCtx, threadId: string) {
  const link = await ctx.db
    .query("coachThreads")
    .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
    .unique();
  if (link === null) throw new Error("Thread not found");
  await requireProfile(ctx, link.profileId);
  return link;
}

// The profile's conversations, newest first.
export const threads = query({
  args: { profileId: v.id("profiles") },
  handler: async (ctx, { profileId }) => {
    await requireProfile(ctx, profileId);
    const links = await ctx.db
      .query("coachThreads")
      .withIndex("by_profileId", (q) => q.eq("profileId", profileId))
      .order("desc")
      .take(100);
    return links.map(({ threadId, title, focus, _creationTime }) => ({
      threadId,
      title,
      focusKind: focus?.kind,
      createdAt: _creationTime,
    }));
  },
});

// Title for a conversation about an "Ask the coach" topic, checked to be the
// profile's own.
async function focusTitle(ctx: QueryCtx, profileId: Id<"profiles">, focus: typeof coachFocusValidator.type) {
  if (focus.kind === "item") {
    const item = await requireItem(ctx, focus.itemId);
    if (item.profileId !== profileId) throw new Error("Item not found");
    return item.text;
  }
  const lesson = await ctx.db.get("lessons", focus.lessonId);
  if (lesson === null || lesson.profileId !== profileId) throw new Error("Lesson not found");
  return lesson.title;
}

const TITLE_LENGTH = 60;

// Without `threadId` starts a new conversation (about `focus`, if given).
export const send = mutation({
  args: {
    profileId: v.id("profiles"),
    threadId: v.optional(v.string()),
    prompt: v.string(),
    focus: v.optional(coachFocusValidator),
  },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx, args.profileId);
    const profileId = profile._id;
    const text = args.prompt.trim();
    if (text === "" || text.length > 4000) throw new Error("Message must be 1–4000 characters");
    let threadId = args.threadId;
    if (threadId) {
      const link = await requireThread(ctx, threadId);
      if (link.profileId !== profileId) throw new Error("Thread not found");
    } else {
      const title = args.focus
        ? await focusTitle(ctx, profileId, args.focus)
        : text.length > TITLE_LENGTH
          ? `${text.slice(0, TITLE_LENGTH - 1)}…`
          : text;
      threadId = await createThread(ctx, components.agent, { userId: profile.userId, title });
      await ctx.db.insert("coachThreads", { profileId, threadId, title, focus: args.focus });
    }
    const { messageId } = await saveMessage(ctx, components.agent, { threadId, prompt: text });
    await ctx.scheduler.runAfter(0, internal.coach.respond, { profileId, threadId, promptMessageId: messageId, prompt: text });
    return threadId;
  },
});

export const messages = query({
  args: { threadId: v.string(), paginationOpts: paginationOptsValidator, streamArgs: vStreamArgs },
  handler: async (ctx, args) => {
    await requireThread(ctx, args.threadId);
    const paginated = await listUIMessages(ctx, components.agent, args);
    const streams = await syncStreams(ctx, components.agent, args);
    return { ...paginated, streams };
  },
});

export const proposals = query({
  args: { threadId: v.string() },
  handler: async (ctx, { threadId }) => {
    await requireThread(ctx, threadId);
    return await ctx.db
      .query("proposals")
      .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
      .take(200);
  },
});

// ---- The coach agent --------------------------------------------------------

export const context = internalQuery({
  args: { profileId: v.id("profiles"), threadId: v.string() },
  handler: async (ctx, { profileId, threadId }) => {
    const profile = await ctx.db.get("profiles", profileId);
    if (profile === null) throw new Error("Profile not found");
    const units = await ctx.db
      .query("units")
      .withIndex("by_profileId_and_order", (q) => q.eq("profileId", profileId))
      .take(100);
    const curriculum = [];
    for (const unit of units) {
      const lessons = await ctx.db
        .query("lessons")
        .withIndex("by_unitId_and_order", (q) => q.eq("unitId", unit._id))
        .take(100);
      curriculum.push({
        unitId: unit._id,
        title: unit.title,
        lessons: lessons.map((l) => ({ lessonId: l._id, title: l.title })),
      });
    }
    const items = await ctx.db
      .query("items")
      .withIndex("by_profileId_and_kind_and_key", (q) => q.eq("profileId", profileId))
      .take(400);
    return {
      profile,
      curriculum,
      focus: await focusContent(ctx, profileId, threadId),
      itemCount: items.length,
      itemKeys: items.map((item) => item.key),
      knownCount: items.filter((item) => item.reps > 0).length,
    };
  },
});

// Current content of what the conversation is about, for the instructions.
async function focusContent(ctx: QueryCtx, profileId: Id<"profiles">, threadId: string) {
  const focus = (
    await ctx.db
      .query("coachThreads")
      .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
      .unique()
  )?.focus;
  if (!focus) return null;
  if (focus.kind === "item") {
    const item = await ctx.db.get("items", focus.itemId);
    if (item === null || item.profileId !== profileId) return null;
    const { kind, key, text, gloss, notes, details } = item;
    return `the item ${JSON.stringify({ kind, key, text, gloss, notes, details })}`;
  }
  const lesson = await ctx.db.get("lessons", focus.lessonId);
  if (lesson === null || lesson.profileId !== profileId) return null;
  return `the study notes of lesson "${lesson.title}" (lessonId ${lesson._id}): ${JSON.stringify(lesson.guide ?? null)}`;
}

function instructions(c: {
  profile: { baseLang: string; targetLang: string; goal?: string };
  curriculum: { unitId: string; title: string; lessons: { lessonId: string; title: string }[] }[];
  focus: string | null;
  itemCount: number;
  knownCount: number;
  itemKeys: string[];
}) {
  const base = languageLabel(c.profile.baseLang);
  const target = languageLabel(c.profile.targetLang);
  const curriculum = c.curriculum.length
    ? c.curriculum
        .map(
          (u) =>
            `- Unit "${u.title}" (unitId ${u.unitId}): ${u.lessons.map((l) => `"${l.title}" (lessonId ${l.lessonId})`).join("; ") || "no lessons"}`,
        )
        .join("\n")
    : "(no units yet)";
  return `You are the learner's language coach inside a learning app. The learner speaks ${base} and is learning ${target}.${c.profile.goal ? ` Their goal: ${c.profile.goal}.` : ""}
Always reply in ${base}. Be brief and warm.

The learner is in the driver's seat. Work iteratively with them:
- If they describe a lesson ("numbers 1–20", "ordering at a café"), propose it with proposeLesson. Ask at most one short clarifying question first, and only if really needed.
- If they ask what to learn, or for a plan toward their goal, propose a unit outline with proposeUnit (3–8 lessons), or a single next lesson.
- They can ask for changes; then make a new proposal. Proposals are shown to them as cards with Accept/Dismiss buttons. Nothing is created until they accept, so never say something was added.
- Don't repeat the proposal's contents in your text; one or two sentences about it is enough.
- Prefer extending the existing curriculum over duplicating it. Put a lesson in an existing unit (unitId) when it fits.
- The learner can also ask about a word, phrase, grammar point or a lesson's study notes. Answer their questions directly. Only if they ask you to fix or change something, or agree to your suggested fix, propose the corrected version with proposeItemFix or proposeNotesFix; it's shown as a card they can apply. Change only what needs changing and keep the rest as it was.
${c.focus ? `\nThis conversation is about ${c.focus}\n` : ""}
Current curriculum:
${curriculum}
Tracked items: ${c.itemCount} (${c.knownCount} practised). Existing item keys: ${c.itemKeys.join(", ") || "(none)"}

${contentRules(c.profile.baseLang, c.profile.targetLang)}`;
}

export const respond = internalAction({
  // `prompt` is only for analytics; optional so already-scheduled runs still validate.
  args: { profileId: v.id("profiles"), threadId: v.string(), promptMessageId: v.string(), prompt: v.optional(v.string()) },
  handler: async (ctx, { profileId, threadId, promptMessageId, prompt }) => {
    const c = await ctx.runQuery(internal.coach.context, { profileId, threadId });
    const aiContext = createAiContext({
      scheduler: ctx.scheduler,
      distinctId: c.profile.userId,
      sessionId: threadId,
      traceId: promptMessageId,
    });
    const save = (proposal: ProposalInput) =>
      ctx.runMutation(internal.coach.saveProposal, { profileId, threadId, proposal });

    const coach = new Agent(components.agent, {
      name: "Coach",
      languageModel: convexGateway(COACH_MODEL),
      instructions: instructions(c),
      stopWhen: stepCountIs(4),
      tools: {
        proposeLesson: createTool({
          description: "Propose one complete lesson (items + practice cards) for the learner to accept.",
          inputSchema: z.object({
            unitId: z.string().optional().describe("Existing unit to add the lesson to."),
            newUnitTitle: z.string().optional().describe("Title of a new unit, if no existing unit fits."),
            title: z.string(),
            description: z.string().optional().describe("One sentence, in the base language."),
            items: z.array(itemSchema).min(1).max(40),
            cards: z.array(cardSchema).min(1).max(120),
          }),
          execute: async (_ctx, input): Promise<{ proposalId: string; summary: string }> => {
            const started = Date.now();
            const { items, cards } = cleanContent(input);
            const unitId = c.curriculum.find((u) => u.unitId === input.unitId)?.unitId as Id<"units"> | undefined;
            const proposalId = await save({
              kind: "lesson",
              unitId,
              unitTitle: unitId ? undefined : (input.newUnitTitle ?? input.title),
              title: input.title,
              description: input.description,
              items,
              cards,
            });
            const output = { proposalId, summary: `Proposed lesson "${input.title}" with ${items.length} items and ${cards.length} cards.` };
            await captureAiToolSpan({
              context: aiContext,
              name: "propose_lesson",
              input,
              output,
              latencyMs: Date.now() - started,
            });
            return output;
          },
        }),
        proposeItemFix: createTool({
          description:
            "Propose a correction to an existing item's gloss, notes or study details. Give only the fields that change; details replace the old details as a whole.",
          inputSchema: z.object({
            kind: itemSchema.shape.kind,
            key: z.string().describe("The item's existing key."),
            summary: z.string().describe("What changes and why, one sentence in the base language."),
            gloss: z.string().optional(),
            notes: z.string().optional(),
            details: itemDetailsSchema.omit({ key: true }).optional(),
          }),
          execute: async (_ctx, { kind, key, ...input }): Promise<{ proposalId: string; summary: string }> => {
            const started = Date.now();
            const item: Doc<"items"> | null = await ctx.runQuery(internal.coach.findItem, { profileId, kind, key });
            if (item === null) throw new Error(`No ${kind} item with key "${key}"`);
            const proposalId = await save({ kind: "itemFix", itemId: item._id, title: item.text, ...input });
            const output = { proposalId, summary: `Proposed a fix for "${item.text}".` };
            await captureAiToolSpan({
              context: aiContext,
              name: "propose_item_fix",
              input: { kind, key, ...input },
              output,
              latencyMs: Date.now() - started,
            });
            return output;
          },
        }),
        proposeNotesFix: createTool({
          description: "Propose corrected study notes for a lesson. The notes replace the old ones as a whole.",
          inputSchema: z.object({
            lessonId: z.string(),
            summary: z.string().describe("What changes and why, one sentence in the base language."),
            guide: guideSchema,
          }),
          execute: async (_ctx, { lessonId, ...input }): Promise<{ proposalId: string; summary: string }> => {
            const started = Date.now();
            const lesson = c.curriculum.flatMap((u) => u.lessons).find((l) => l.lessonId === lessonId);
            if (!lesson) throw new Error(`No lesson with id ${lessonId}`);
            const proposalId = await save({
              kind: "guideFix",
              lessonId: lesson.lessonId as Id<"lessons">,
              title: lesson.title,
              ...input,
            });
            const output = { proposalId, summary: `Proposed new study notes for "${lesson.title}".` };
            await captureAiToolSpan({
              context: aiContext,
              name: "propose_notes_fix",
              input: { lessonId, ...input },
              output,
              latencyMs: Date.now() - started,
            });
            return output;
          },
        }),
        proposeUnit: createTool({
          description: "Propose a unit outline: an ordered list of lessons. Each lesson's content is built after the learner accepts.",
          inputSchema: z.object({
            title: z.string(),
            description: z.string().optional(),
            lessons: z
              .array(
                z.object({
                  title: z.string(),
                  description: z.string().optional(),
                  focus: z.string().describe("What exactly the lesson should cover (words, grammar, situations)."),
                }),
              )
              .min(1)
              .max(12),
          }),
          execute: async (_ctx, input): Promise<{ proposalId: string; summary: string }> => {
            const started = Date.now();
            const proposalId = await save({ kind: "unit", ...input });
            const output = { proposalId, summary: `Proposed unit "${input.title}" with ${input.lessons.length} lessons.` };
            await captureAiToolSpan({
              context: aiContext,
              name: "propose_unit",
              input,
              output,
              latencyMs: Date.now() - started,
            });
            return output;
          },
        }),
      },
    });
    const started = Date.now();
    const result = await coach.streamText(ctx, { threadId }, { promptMessageId }, { saveStreamDeltas: true });
    await result.consumeStream();
    // Latency covers all steps, including tool calls (each also has its own span).
    await captureAiGeneration({
      context: aiContext,
      model: COACH_MODEL,
      input: [{ role: "user", content: prompt ?? "" }],
      output: [{ role: "assistant", content: await result.text }],
      latencyMs: Date.now() - started,
      usage: await result.totalUsage,
    });
    return null;
  },
});

const proposalValidator = v.union(
  v.object({
    kind: v.literal("lesson"),
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
  v.object({
    kind: v.literal("itemFix"),
    itemId: v.id("items"),
    title: v.string(),
    summary: v.string(),
    gloss: v.optional(v.string()),
    notes: v.optional(v.string()),
    details: v.optional(itemDetailsValidator),
  }),
  v.object({
    kind: v.literal("guideFix"),
    lessonId: v.id("lessons"),
    title: v.string(),
    summary: v.string(),
    guide: lessonGuideValidator,
  }),
);

type ProposalInput =
  | {
      kind: "lesson";
      unitId?: Id<"units">;
      unitTitle?: string;
      title: string;
      description?: string;
      items: { kind: "lemma" | "chunk" | "grammar" | "glyph"; key: string; text: string; gloss?: string; notes?: string }[];
      cards: { itemKeys: string[]; kind: "meaning" | "form"; prompt: string; cue?: string; answer: string; accepted: string[] }[];
    }
  | { kind: "unit"; title: string; description?: string; lessons: { title: string; description?: string; focus: string }[] }
  | (typeof proposalValidator.type & { kind: "itemFix" | "guideFix" });

export const findItem = internalQuery({
  args: { profileId: v.id("profiles"), kind: seedItemValidator.fields.kind, key: v.string() },
  handler: async (ctx, { profileId, kind, key }) => {
    return await ctx.db
      .query("items")
      .withIndex("by_profileId_and_kind_and_key", (q) =>
        q.eq("profileId", profileId).eq("kind", kind).eq("key", key.normalize("NFC").trim().toLowerCase()),
      )
      .unique();
  },
});

export const saveProposal = internalMutation({
  args: { profileId: v.id("profiles"), threadId: v.string(), proposal: proposalValidator },
  handler: async (ctx, args) => {
    return await ctx.db.insert("proposals", { ...args, status: "pending" });
  },
});

// ---- Accepting proposals ----------------------------------------------------

// A note in the thread for the coach. The client translates the known ones
// (NOTES in src/coach/CoachPanel.tsx), so keep the two in sync.
async function note(ctx: MutationCtx, threadId: string, text: string) {
  await saveMessage(ctx, components.agent, { threadId, message: { role: "user", content: `[${text}]` } });
}

async function applyFix(
  ctx: MutationCtx,
  profileId: Id<"profiles">,
  p: Extract<Doc<"proposals">["proposal"], { kind: "itemFix" | "guideFix" }>,
) {
  if (p.kind === "itemFix") {
    const item = await ctx.db.get("items", p.itemId);
    if (item === null || item.profileId !== profileId) throw new Error("Item not found");
    await ctx.db.patch("items", p.itemId, {
      ...(p.gloss !== undefined && { gloss: p.gloss }),
      ...(p.notes !== undefined && { notes: p.notes }),
      ...(p.details !== undefined && { details: p.details, detailsStatus: undefined }),
    });
    return;
  }
  const lesson = await ctx.db.get("lessons", p.lessonId);
  if (lesson === null || lesson.profileId !== profileId) throw new Error("Lesson not found");
  await ctx.db.patch("lessons", p.lessonId, { guide: p.guide });
}

export const accept = mutation({
  args: { proposalId: v.id("proposals") },
  handler: async (ctx, { proposalId }) => {
    const row = await ctx.db.get("proposals", proposalId);
    if (row === null) throw new Error("Proposal not found");
    await requireProfile(ctx, row.profileId);
    if (row.status !== "pending") return row.createdLessonId ?? null;
    const p = row.proposal;
    if (p.kind === "itemFix" || p.kind === "guideFix") {
      await applyFix(ctx, row.profileId, p);
      await ctx.db.patch("proposals", proposalId, { status: "accepted" });
      await note(ctx, row.threadId, `Learner applied the fix to "${p.title}"`);
      return null;
    }
    if (p.kind === "lesson") {
      let unitId = p.unitId;
      if (unitId) {
        const unit = await ctx.db.get("units", unitId);
        if (unit === null || unit.profileId !== row.profileId) unitId = undefined;
      }
      unitId ??= await createUnit(ctx, row.profileId, { title: p.unitTitle ?? p.title });
      const lessonId = await ctx.db.insert("lessons", {
        profileId: row.profileId,
        unitId,
        title: p.title,
        description: p.description,
        order: await nextLessonOrder(ctx, unitId),
      });
      await addLessonContent(ctx, row.profileId, lessonId, p);
      await startLessonStudy(ctx, lessonId);
      await ctx.db.patch("proposals", proposalId, { status: "accepted", createdUnitId: unitId, createdLessonId: lessonId });
      await note(ctx, row.threadId, `Learner accepted the lesson "${p.title}"`);
      return lessonId;
    }
    const unitId = await createUnit(ctx, row.profileId, { title: p.title, description: p.description });
    let firstLessonId: Id<"lessons"> | null = null;
    for (const [index, lesson] of p.lessons.entries()) {
      const lessonId = await ctx.db.insert("lessons", {
        profileId: row.profileId,
        unitId,
        title: lesson.title,
        description: lesson.description,
        order: index + 1,
        status: "building",
        buildFocus: lesson.focus,
      });
      firstLessonId ??= lessonId;
      await ctx.scheduler.runAfter(0, internal.coach.buildLesson, { lessonId });
    }
    await ctx.db.patch("proposals", proposalId, {
      status: "accepted",
      createdUnitId: unitId,
      createdLessonId: firstLessonId ?? undefined,
    });
    await note(ctx, row.threadId, `Learner accepted the unit "${p.title}"; its lessons are being built`);
    return firstLessonId;
  },
});

export const dismiss = mutation({
  args: { proposalId: v.id("proposals") },
  handler: async (ctx, { proposalId }) => {
    const row = await ctx.db.get("proposals", proposalId);
    if (row === null) throw new Error("Proposal not found");
    await requireProfile(ctx, row.profileId);
    if (row.status !== "pending") return null;
    await ctx.db.patch("proposals", proposalId, { status: "dismissed" });
    await note(ctx, row.threadId, `Learner dismissed the proposal "${row.proposal.title}"`);
    return null;
  },
});

// ---- Building lessons from a unit outline -----------------------------------

export const buildContext = internalQuery({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    const lesson = await ctx.db.get("lessons", lessonId);
    if (lesson === null || lesson.status !== "building") return null;
    const profile = await ctx.db.get("profiles", lesson.profileId);
    const unit = await ctx.db.get("units", lesson.unitId);
    if (profile === null || unit === null) return null;
    const items = await ctx.db
      .query("items")
      .withIndex("by_profileId_and_kind_and_key", (q) => q.eq("profileId", profile._id))
      .take(400);
    return { lesson, profile, unitTitle: unit.title, existingKeys: items.map((item) => item.key) };
  },
});

export const buildLesson = internalAction({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    const c = await ctx.runQuery(internal.coach.buildContext, { lessonId });
    if (c === null) return null;
    try {
      const content = await buildLessonContent({
        baseLang: c.profile.baseLang,
        targetLang: c.profile.targetLang,
        goal: c.profile.goal,
        unitTitle: c.unitTitle,
        title: c.lesson.title,
        focus: c.lesson.buildFocus ?? c.lesson.description ?? c.lesson.title,
        existingKeys: c.existingKeys,
      }, createAiContext({ scheduler: ctx.scheduler, distinctId: c.profile.userId }));
      await ctx.runMutation(internal.coach.finishBuild, { lessonId, ...content });
    } catch (e) {
      await ctx.runMutation(internal.coach.failBuild, { lessonId, error: e instanceof Error ? e.message : String(e) });
    }
    return null;
  },
});

export const finishBuild = internalMutation({
  args: { lessonId: v.id("lessons"), items: v.array(seedItemValidator), cards: v.array(seedCardValidator) },
  handler: async (ctx, { lessonId, items, cards }) => {
    const lesson = await ctx.db.get("lessons", lessonId);
    if (lesson === null || lesson.status !== "building") return null;
    await addLessonContent(ctx, lesson.profileId, lessonId, { items, cards });
    await ctx.db.patch("lessons", lessonId, { status: undefined, error: undefined });
    await startLessonStudy(ctx, lessonId);
    return null;
  },
});

export const failBuild = internalMutation({
  args: { lessonId: v.id("lessons"), error: v.string() },
  handler: async (ctx, { lessonId, error }) => {
    await ctx.db.patch("lessons", lessonId, { status: "failed", error });
    return null;
  },
});

export const rebuildLesson = mutation({
  args: { lessonId: v.id("lessons") },
  handler: async (ctx, { lessonId }) => {
    const lesson = await ctx.db.get("lessons", lessonId);
    if (lesson === null) throw new Error("Lesson not found");
    await requireProfile(ctx, lesson.profileId);
    if (lesson.status !== "failed" || (await lessonItemIds(ctx, lessonId)).length > 0) return null;
    await ctx.db.patch("lessons", lessonId, { status: "building", error: undefined });
    await ctx.scheduler.runAfter(0, internal.coach.buildLesson, { lessonId });
    return null;
  },
});

// Prompt/tool check without the UI or a real profile (tools don't save):
// npx convex run coach:smokeTest '{"baseLang":"es","targetLang":"fr","prompt":"…"}'
export const smokeTest = internalAction({
  args: { baseLang: v.string(), targetLang: v.string(), prompt: v.string(), goal: v.optional(v.string()) },
  handler: async (ctx, { baseLang, targetLang, prompt, goal }) => {
    const threadId = await createThread(ctx, components.agent, { title: "smoke test" });
    const calls: { tool: string; input: unknown }[] = [];
    const coach = new Agent(components.agent, {
      name: "Coach",
      languageModel: convexGateway(COACH_MODEL),
      instructions: instructions({
        profile: { baseLang, targetLang, goal },
        curriculum: [],
        focus: null,
        itemCount: 0,
        knownCount: 0,
        itemKeys: [],
      }),
      stopWhen: stepCountIs(4),
      tools: {
        proposeLesson: createTool({
          description: "Propose one complete lesson (items + practice cards) for the learner to accept.",
          inputSchema: z.object({
            newUnitTitle: z.string().optional(),
            title: z.string(),
            description: z.string().optional(),
            items: z.array(itemSchema).min(1).max(40),
            cards: z.array(cardSchema).min(1).max(120),
          }),
          execute: async (_ctx, input): Promise<string> => {
            calls.push({ tool: "proposeLesson", input: cleanContent(input) });
            return "Proposal shown to the learner.";
          },
        }),
        proposeUnit: createTool({
          description: "Propose a unit outline.",
          inputSchema: z.object({
            title: z.string(),
            lessons: z.array(z.object({ title: z.string(), focus: z.string() })).min(1).max(12),
          }),
          execute: async (_ctx, input): Promise<string> => {
            calls.push({ tool: "proposeUnit", input });
            return "Proposal shown to the learner.";
          },
        }),
      },
    });
    const started = Date.now();
    const result = await coach.generateText(ctx, { threadId }, { prompt });
    return { ms: Date.now() - started, text: result.text, calls };
  },
});

// npx convex run coach:smokeBuild '{"baseLang":"pl","targetLang":"it","title":"…","focus":"…"}'
export const smokeBuild = internalAction({
  args: { baseLang: v.string(), targetLang: v.string(), title: v.string(), focus: v.string() },
  handler: async (_ctx, args) => {
    const started = Date.now();
    const content = await buildLessonContent({ ...args, unitTitle: "Smoke test", existingKeys: [] });
    return { ms: Date.now() - started, ...content };
  },
});
