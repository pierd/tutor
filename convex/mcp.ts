import { ConvexError } from "convex/values";
import { z } from "zod";
import { httpAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { cardSchema, itemSchema } from "./ai/lessonContent";
import { guideSchema, itemDetailsSchema } from "./ai/studyAi";
import { hashToken } from "./apiTokens";
import { defineTool, handleBody, type ServerInfo, type Tool } from "./lib/mcpProtocol";

// MCP server at <CONVEX_SITE_URL>/mcp, so the learner's own AI assistant can
// do what the coach does, and edit what's there. Requests carry a personal
// token (`Authorization: Bearer tutor_...`, made on the AI agents page).
// Everything runs as the token's owner: the user id always comes from the
// token, never from the agent. Data access is in convex/mcpData.ts.
//
// The coach proposes and the learner accepts a card; here the assistant's
// conversation plays that role, so the tools apply changes directly.

// --- Tools ---

type ToolCtx = { ctx: ActionCtx; userId: Id<"users"> };

const result = (data: Record<string, unknown>, note = "") => ({ text: JSON.stringify(data) + note, data });

const id = z.string().min(1);
const profileId = id.optional().describe("From list_profiles. Defaults to the profile active in the app.");
const lessonId = id.describe("Lesson id, from get_curriculum.");
const unitId = id.describe("Unit id, from get_curriculum.");
const itemId = id.describe("Item id, from list_items or get_lesson.");
const cardId = id.describe("Card id, from list_cards or get_item.");
const title = z.string().trim().min(1).max(200);
const limit = z.number().int().min(1).max(500).default(100);
const offset = z.number().int().min(0).default(0);
const search = z.string().optional().describe("Case-insensitive text to look for.");
const details = itemDetailsSchema.omit({ key: true });

const more = (data: { total: number; offset: number }, shown: number) => {
  const left = data.total - data.offset - shown;
  return left > 0 ? `\n\n${left} more: raise offset.` : "";
};

const READ = { readOnlyHint: true };
const ADD = { readOnlyHint: false, destructiveHint: false, idempotentHint: false };
// Edits overwrite what was there.
const EDIT = { readOnlyHint: false, destructiveHint: true, idempotentHint: true };

const tools: Tool<ToolCtx>[] = [
  defineTool({
    name: "list_profiles",
    title: "List profiles",
    description:
      "The learner's profiles. Each is one language pair (baseLang → targetLang) with its own curriculum and progress. `active` is the one open in the app.",
    input: z.object({}),
    annotations: READ,
    run: async ({ ctx, userId }: ToolCtx) => {
      return result({ profiles: await ctx.runQuery(internal.mcpData.listProfiles, { userId }) });
    },
  }),
  defineTool({
    name: "get_curriculum",
    title: "Get curriculum",
    description:
      "A profile's goal, its units and lessons (with ids), item counts, and the rules for writing lesson content. Read this before creating anything.",
    input: z.object({ profileId }),
    annotations: READ,
    run: async ({ ctx, userId }: ToolCtx, args) => {
      return result(await ctx.runQuery(internal.mcpData.curriculum, { userId, ...args, now: Date.now() }));
    },
  }),
  defineTool({
    name: "get_lesson",
    title: "Get lesson",
    description:
      "A lesson with its study notes (guide) and items. Its flashcards are in list_cards.",
    input: z.object({ lessonId }),
    annotations: READ,
    run: async ({ ctx, userId }: ToolCtx, args) => {
      return result(await ctx.runQuery(internal.mcpData.getLesson, { userId, ...args }));
    },
  }),
  defineTool({
    name: "list_items",
    title: "List items",
    description:
      "The items being learned (words, phrases, grammar points, characters) with progress, for a lesson or the whole profile.",
    input: z.object({
      profileId,
      lessonId: lessonId.optional(),
      kind: itemSchema.shape.kind.optional(),
      search,
      dueOnly: z.boolean().default(false).describe("Only items due for review now."),
      limit,
      offset,
    }),
    annotations: READ,
    run: async ({ ctx, userId }: ToolCtx, args) => {
      const data = await ctx.runQuery(internal.mcpData.listItems, { userId, ...args, now: Date.now() });
      return result(data, more(data, data.items.length));
    },
  }),
  defineTool({
    name: "get_item",
    title: "Get item",
    description:
      "One item in full: study details, the lessons it's in and its flashcards.",
    input: z.object({ itemId }),
    annotations: READ,
    run: async ({ ctx, userId }: ToolCtx, args) => {
      return result(await ctx.runQuery(internal.mcpData.getItem, { userId, ...args }));
    },
  }),
  defineTool({
    name: "list_cards",
    title: "List flashcards",
    description:
      "Flashcards of a lesson, an item or the whole profile.",
    input: z.object({
      profileId,
      lessonId: lessonId.optional(),
      itemId: itemId.optional(),
      search,
      limit,
      offset,
    }),
    annotations: READ,
    run: async ({ ctx, userId }: ToolCtx, args) => {
      const data = await ctx.runQuery(internal.mcpData.listCards, { userId, ...args });
      return result(data, more(data, data.cards.length));
    },
  }),
  defineTool({
    name: "list_mistakes",
    title: "List recurring mistakes",
    description:
      "The learner's recurring error patterns, most frequent first. Useful for deciding what to teach next.",
    input: z.object({ profileId, limit: z.number().int().min(1).max(200).default(50) }),
    annotations: READ,
    run: async ({ ctx, userId }: ToolCtx, args) => {
      return result({ mistakes: await ctx.runQuery(internal.mcpData.listMistakes, { userId, ...args }) });
    },
  }),
  defineTool({
    name: "create_lesson",
    title: "Create lesson",
    description:
      "Create a complete lesson (items + flashcards) in an existing unit (unitId) or a new one (newUnitTitle). Follow contentRules from get_curriculum. Items that already exist (same kind and key) are reused with their progress. Agree on the content with the learner first.",
    input: z.object({
      profileId,
      unitId: unitId.optional(),
      newUnitTitle: title.optional(),
      title,
      description: z.string().optional().describe("One sentence, in the base language."),
      items: z.array(itemSchema).min(1).max(40),
      cards: z.array(cardSchema).min(1).max(120),
      guide: guideSchema.optional().describe("Study notes, in the base language."),
      fillStudyMaterial: z
        .boolean()
        .default(true)
        .describe("Let Tutor's AI write missing study notes and item details in the background. Set false if you'll write them."),
    }),
    annotations: ADD,
    run: async ({ ctx, userId }: ToolCtx, args) => {
      return result(await ctx.runMutation(internal.mcpData.createLesson, { userId, ...args }));
    },
  }),
  defineTool({
    name: "create_unit",
    title: "Create unit",
    description:
      "Create a unit. Lessons given as an outline are written by Tutor's AI in the background (check their status with get_curriculum). Leave lessons empty to write them yourself with create_lesson. Agree on the outline with the learner first.",
    input: z.object({
      profileId,
      title,
      description: z.string().optional(),
      lessons: z
        .array(
          z.object({
            title,
            description: z.string().optional(),
            focus: z.string().min(1).describe("What exactly the lesson should cover (words, grammar, situations)."),
          }),
        )
        .max(12)
        .default([]),
    }),
    annotations: ADD,
    run: async ({ ctx, userId }: ToolCtx, args) => {
      return result(await ctx.runMutation(internal.mcpData.createUnit, { userId, ...args }));
    },
  }),
  defineTool({
    name: "add_to_lesson",
    title: "Add to lesson",
    description:
      "Add items and/or flashcards to an existing lesson. Cards refer by key to items given here or already in the lesson. Existing items are linked unchanged; identical cards are skipped.",
    input: z.object({
      lessonId,
      items: z.array(itemSchema).max(40).default([]),
      cards: z.array(cardSchema).max(120).default([]),
    }),
    annotations: ADD,
    run: async ({ ctx, userId }: ToolCtx, args) => {
      return result(await ctx.runMutation(internal.mcpData.addToLesson, { userId, ...args }));
    },
  }),
  defineTool({
    name: "add_cards",
    title: "Add flashcards",
    description:
      "Add flashcards to existing items. Follow contentRules from get_curriculum. Identical cards are skipped.",
    input: z.object({
      cards: z
        .array(
          cardSchema.omit({ itemKeys: true }).extend({
            itemIds: z.array(itemId).min(1).max(10).describe("Items the card exercises, the main one first."),
            accepted: z.array(z.string()).default([]).describe("Other acceptable answers."),
          }),
        )
        .min(1)
        .max(100),
    }),
    annotations: ADD,
    run: async ({ ctx, userId }: ToolCtx, args) => {
      return result(await ctx.runMutation(internal.mcpData.addCards, { userId, ...args }));
    },
  }),
  defineTool({
    name: "update_cards",
    title: "Update flashcards",
    description:
      "Improve flashcards: only the fields given change. If answer changes, the old answer stops being accepted unless you list it in accepted.",
    input: z.object({
      cards: z
        .array(
          z.object({
            cardId,
            prompt: z.string().optional().describe("A form card keeps exactly one ___ gap."),
            cue: z.string().optional().describe('"" removes it.'),
            answer: z.string().optional(),
            accepted: z.array(z.string()).optional().describe("Replaces all accepted answers; answer is always included."),
            itemIds: z.array(itemId).min(1).max(10).optional(),
          }),
        )
        .min(1)
        .max(100),
    }),
    annotations: EDIT,
    run: async ({ ctx, userId }: ToolCtx, args) => {
      return result({ updated: await ctx.runMutation(internal.mcpData.updateCards, { userId, ...args }) });
    },
  }),
  defineTool({
    name: "delete_cards",
    title: "Delete flashcards",
    description:
      "Permanently delete flashcards. Progress is kept on their items. Confirm with the learner first.",
    input: z.object({ cardIds: z.array(cardId).min(1).max(100) }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    run: async ({ ctx, userId }: ToolCtx, args) => {
      return result({ deleted: await ctx.runMutation(internal.mcpData.deleteCards, { userId, ...args }) });
    },
  }),
  defineTool({
    name: "update_items",
    title: "Update items",
    description:
      "Correct items: only the fields given change (\"\" clears gloss or notes). details replace the old details as a whole, so read them with get_item first. suspended: true takes an item and its cards out of practice, false brings it back. Progress is never changed.",
    input: z.object({
      items: z
        .array(
          z.object({
            itemId,
            text: z.string().optional().describe("Display form in the target language."),
            gloss: z.string().optional().describe("Meaning in the base language."),
            notes: z.string().optional(),
            details: details.optional(),
            suspended: z.boolean().optional(),
          }),
        )
        .min(1)
        .max(50),
    }),
    annotations: EDIT,
    run: async ({ ctx, userId }: ToolCtx, args) => {
      return result({ updated: await ctx.runMutation(internal.mcpData.updateItems, { userId, ...args }) });
    },
  }),
  defineTool({
    name: "update_lesson",
    title: "Update lesson",
    description:
      "Change a lesson's title, description (\"\" clears it) or study notes, or move it to the end of another unit. guide replaces the old notes as a whole, so read them with get_lesson first.",
    input: z.object({
      lessonId,
      title: title.optional(),
      description: z.string().optional(),
      guide: guideSchema.optional(),
      unitId: unitId.optional(),
    }),
    annotations: EDIT,
    run: async ({ ctx, userId }: ToolCtx, args) => {
      await ctx.runMutation(internal.mcpData.updateLesson, { userId, ...args });
      return { text: "Lesson updated." };
    },
  }),
  defineTool({
    name: "update_unit",
    title: "Update unit",
    description:
      "Change a unit's title or description (\"\" clears it).",
    input: z.object({
      unitId,
      title: title.optional(),
      description: z.string().optional(),
    }),
    annotations: EDIT,
    run: async ({ ctx, userId }: ToolCtx, args) => {
      await ctx.runMutation(internal.mcpData.updateUnit, { userId, ...args });
      return { text: "Unit updated." };
    },
  }),
  defineTool({
    name: "remove_from_lesson",
    title: "Remove from lesson",
    description:
      "Take items out of a lesson. They keep their progress and cards and stay in the profile; add_to_lesson puts them back.",
    input: z.object({ lessonId, itemIds: z.array(itemId).min(1).max(100) }),
    annotations: EDIT,
    run: async ({ ctx, userId }: ToolCtx, args) => {
      return result({ removed: await ctx.runMutation(internal.mcpData.removeFromLesson, { userId, ...args }) });
    },
  }),
  defineTool({
    name: "fill_study_material",
    title: "Fill in study material",
    description:
      "Let Tutor's AI write study material in the background: a lesson's missing notes and item details, or one item's details (rewritten if it has some).",
    input: z.object({ lessonId: lessonId.optional(), itemId: itemId.optional() }),
    annotations: EDIT,
    run: async ({ ctx, userId }: ToolCtx, args) => {
      const started = await ctx.runMutation(internal.mcpData.fillStudyMaterial, { userId, ...args });
      return { text: started ? "Started; check back in a minute." : "Already being written, or the lesson isn't built yet." };
    },
  }),
  defineTool({
    name: "rebuild_lesson",
    title: "Retry building a lesson",
    description:
      "Retry a lesson whose status is \"failed\".",
    input: z.object({ lessonId }),
    annotations: { ...ADD, idempotentHint: true },
    run: async ({ ctx, userId }: ToolCtx, args) => {
      const started = await ctx.runMutation(internal.mcpData.rebuildLesson, { userId, ...args });
      return { text: started ? "Building again; check its status with get_lesson." : "Nothing to retry: the lesson hasn't failed." };
    },
  }),
];

const SERVER: ServerInfo = {
  name: "tutor",
  title: "Tutor",
  version: "1.0.0",
  instructions:
    "Tutor is a language-learning app; act as the learner's coach. A profile is one language pair. Its units contain lessons, lessons contain items (words, phrases, grammar points, characters) and items have flashcards. Start with get_curriculum. The learner is in the driver's seat: propose new lessons, units and changes in the conversation and create or change them only once they agree. Explain in the profile's base language. Prefer extending existing units and reusing existing items over duplicating them.",
};

function describeError(e: unknown) {
  if (e instanceof ConvexError && typeof e.data === "string") return e.data;
  console.error(e);
  return "Internal error";
}

// --- HTTP ---

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Expose-Headers": "WWW-Authenticate",
};

function respond(status: number, body?: unknown, headers: Record<string, string> = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { ...CORS, ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
  });
}

// Touching lastUsedAt on every call would mean a write per request.
const TOUCH_EVERY_MS = 60 * 60 * 1000;

// The token comes in the Authorization header or, for clients that can't send
// headers (ChatGPT, claude.ai connectors), in the URL: /mcp/t/<token>.
function presentedToken(req: Request) {
  const header = req.headers.get("Authorization")?.match(/^Bearer\s+(\S+)$/i);
  if (header) return header[1];
  const path = new URL(req.url).pathname.match(/^\/mcp\/t\/([A-Za-z0-9_-]+)\/?$/);
  return path?.[1] ?? null;
}

async function authenticate(ctx: ActionCtx, req: Request) {
  const presented = presentedToken(req);
  if (!presented) return null;
  const token = await ctx.runQuery(internal.apiTokens.byHash, { tokenHash: await hashToken(presented) });
  if (token === null) return null;
  if (token.lastUsedAt === null || Date.now() - token.lastUsedAt > TOUCH_EVERY_MS) {
    await ctx.runMutation(internal.apiTokens.touch, { tokenId: token.tokenId });
  }
  return token.userId;
}

export const post = httpAction(async (ctx, req) => {
  const userId = await authenticate(ctx, req);
  if (userId === null) {
    return respond(
      401,
      { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Missing or invalid token. Create one on the Tutor AI agents page." } },
      { "WWW-Authenticate": 'Bearer realm="tutor"' },
    );
  }
  const { status, json: body } = await handleBody(await req.text(), { ctx, userId }, SERVER, tools, describeError);
  return respond(status, body);
});

// No server-initiated stream and no sessions: GET and DELETE aren't offered.
export const notAllowed = httpAction(async () => respond(405, undefined, { Allow: "POST, OPTIONS" }));

export const preflight = httpAction(async () => respond(204));
