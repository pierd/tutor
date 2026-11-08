import { internalQuery, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireUserId } from "./lib/auth";

// Learner audio: the client uploads to storage, then registers the file here
// so actions can verify ownership before transcribing it.

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const save = mutation({
  args: { storageId: v.id("_storage"), mediaType: v.string() },
  handler: async (ctx, { storageId, mediaType }) => {
    const userId = await requireUserId(ctx);
    return await ctx.db.insert("recordings", { userId, storageId, mediaType });
  },
});

export const remove = mutation({
  args: { recordingId: v.id("recordings") },
  handler: async (ctx, { recordingId }) => {
    const userId = await requireUserId(ctx);
    const recording = await ctx.db.get("recordings", recordingId);
    if (recording === null || recording.userId !== userId) return null;
    await ctx.storage.delete(recording.storageId);
    await ctx.db.delete("recordings", recordingId);
    return null;
  },
});

export const getOwned = internalQuery({
  args: { recordingId: v.id("recordings"), userId: v.id("users") },
  handler: async (ctx, { recordingId, userId }) => {
    const recording = await ctx.db.get("recordings", recordingId);
    if (recording === null || recording.userId !== userId) return null;
    return recording;
  },
});
