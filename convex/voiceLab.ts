import { getAuthUserId } from "@convex-dev/auth/server";
import { action, internalAction, internalMutation } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { speak as synthesize, transcribe as transcribeAudio, type Transcript } from "./ai/voice";
import { STT_MODELS } from "./lib/voices";

// Admin-only page for comparing speech models on a real voice. Lessons call
// convex/ai/voice.ts directly; uploads go through convex/recordings.ts.

async function requireAdminInAction(ctx: ActionCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Not authenticated");
  if (!(await ctx.runQuery(internal.admin.checkAdmin, { userId }))) throw new Error("Admins only");
  return userId;
}

type ModelResult =
  | ({ model: string; ok: true; ms: number } & Transcript)
  | { model: string; ok: false; ms: number; error: string };

export const transcribe = action({
  args: {
    recordingId: v.id("recordings"),
    models: v.array(v.string()),
    language: v.optional(v.string()),
  },
  handler: async (ctx, { recordingId, models, language }): Promise<ModelResult[]> => {
    const userId = await requireAdminInAction(ctx);
    if (models.length === 0 || models.length > 8) throw new Error("Pick 1–8 models");
    const recording = await ctx.runQuery(internal.recordings.getOwned, { recordingId, userId });
    if (recording === null) throw new Error("Recording not found");
    const blob = await ctx.storage.get(recording.storageId);
    if (blob === null) throw new Error("Recording file missing");
    const audio = await blob.arrayBuffer();

    return await Promise.all(
      models.map(async (model): Promise<ModelResult> => {
        const started = Date.now();
        try {
          const transcript = await transcribeAudio(audio, recording.mediaType, { model, language });
          return { model, ok: true, ms: Date.now() - started, ...transcript };
        } catch (e) {
          return { model, ok: false, ms: Date.now() - started, error: e instanceof Error ? e.message : String(e) };
        }
      }),
    );
  },
});

export const speak = action({
  args: { text: v.string(), model: v.string(), voice: v.string(), speed: v.optional(v.number()) },
  handler: async (ctx, { text, model, voice, speed }): Promise<{ url: string; ms: number }> => {
    await requireAdminInAction(ctx);
    if (text.trim() === "" || text.length > 500) throw new Error("Text must be 1–500 characters");
    const started = Date.now();
    const audio = await synthesize(text, { model, voice, speed });
    const ms = Date.now() - started;
    // Lab audio is throwaway: store it so the browser can fetch it, and delete it later.
    const storageId = await ctx.storage.store(audio);
    await ctx.scheduler.runAfter(60 * 60 * 1000, internal.voiceLab.deleteFile, { storageId });
    const url = await ctx.storage.getUrl(storageId);
    if (url === null) throw new Error("Stored audio missing");
    return { url, ms };
  },
});

export const deleteFile = internalMutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    await ctx.storage.delete(storageId);
    return null;
  },
});

// Gateway check without a microphone: TTS a sentence, then transcribe it with
// each model. Run: npx convex run voiceLab:smokeTest '{"text":"…","language":"fr"}'
export const smokeTest = internalAction({
  args: {
    text: v.string(),
    language: v.string(),
    ttsModel: v.optional(v.string()),
    voice: v.optional(v.string()),
    models: v.optional(v.array(v.string())),
  },
  handler: async (_ctx, args) => {
    const started = Date.now();
    const audio = await synthesize(args.text, {
      model: args.ttsModel ?? "hexgrad/kokoro-82m",
      voice: args.voice ?? "ff_siwis",
    });
    const ttsMs = Date.now() - started;
    const models = args.models ?? STT_MODELS;
    const results = await Promise.all(
      models.map(async (model) => {
        const t0 = Date.now();
        try {
          const { text, words, costUsd, rawJson } = await transcribeAudio(await audio.arrayBuffer(), audio.type, {
            model,
            language: args.language,
          });
          return { model, ms: Date.now() - t0, text, costUsd, words: words?.slice(0, 3) ?? null, rawJson };
        } catch (e) {
          return { model, ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) };
        }
      }),
    );
    return { ttsMs, audioBytes: audio.size, results };
  },
});
