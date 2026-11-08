import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireProfile, requireUserId } from "./lib/auth";
import { isBaseLanguage, isTargetLanguage } from "./lib/languages";
import { getUserSettings, patchUserSettings } from "./settings";

const MAX_PROFILES = 50;

function validateFields(fields: { name?: string; baseLang?: string; targetLang?: string }) {
  if (fields.name !== undefined && fields.name.trim() === "") {
    throw new Error("Name is required");
  }
  if (fields.baseLang !== undefined && !isBaseLanguage(fields.baseLang)) {
    throw new Error(`Unsupported base language: ${fields.baseLang}`);
  }
  if (fields.targetLang !== undefined && !isTargetLanguage(fields.targetLang)) {
    throw new Error(`Unsupported target language: ${fields.targetLang}`);
  }
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    return await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(MAX_PROFILES);
  },
});

// The profile the user last switched to, or their first one.
export const getActive = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const settings = await getUserSettings(ctx, userId);
    if (settings?.activeProfileId) {
      const profile = await ctx.db.get("profiles", settings.activeProfileId);
      if (profile !== null && profile.userId === userId) return profile;
    }
    return await ctx.db
      .query("profiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    baseLang: v.string(),
    targetLang: v.string(),
    goal: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    validateFields(args);
    if (args.baseLang === args.targetLang) {
      throw new Error("Base and target language must differ");
    }
    const profileId = await ctx.db.insert("profiles", {
      userId,
      name: args.name.trim(),
      baseLang: args.baseLang,
      targetLang: args.targetLang,
      goal: args.goal?.trim() || undefined,
    });
    await patchUserSettings(ctx, userId, { activeProfileId: profileId });
    return profileId;
  },
});

export const update = mutation({
  args: {
    profileId: v.id("profiles"),
    name: v.optional(v.string()),
    goal: v.optional(v.string()),
  },
  handler: async (ctx, { profileId, name, goal }) => {
    await requireProfile(ctx, profileId);
    validateFields({ name });
    await ctx.db.patch("profiles", profileId, {
      ...(name !== undefined && { name: name.trim() }),
      ...(goal !== undefined && { goal: goal.trim() || undefined }),
    });
    return null;
  },
});

export const setActive = mutation({
  args: { profileId: v.id("profiles") },
  handler: async (ctx, { profileId }) => {
    const profile = await requireProfile(ctx, profileId);
    await patchUserSettings(ctx, profile.userId, { activeProfileId: profileId });
    return null;
  },
});
