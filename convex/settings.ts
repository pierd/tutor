import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { uiLocaleValidator } from "./lib/languages";
import { requireUserId } from "./lib/auth";

export async function getUserSettings(ctx: QueryCtx, userId: Id<"users">) {
  return await ctx.db
    .query("userSettings")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
}

export async function patchUserSettings(
  ctx: MutationCtx,
  userId: Id<"users">,
  patch: { activeProfileId?: Id<"profiles">; uiLocale?: "en" | "es" | "pl" },
) {
  const existing = await getUserSettings(ctx, userId);
  if (existing) {
    await ctx.db.patch("userSettings", existing._id, patch);
  } else {
    await ctx.db.insert("userSettings", { userId, ...patch });
  }
}

export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const settings = await getUserSettings(ctx, userId);
    return { uiLocale: settings?.uiLocale ?? null };
  },
});

export const setUiLocale = mutation({
  args: { uiLocale: uiLocaleValidator },
  handler: async (ctx, { uiLocale }) => {
    const userId = await requireUserId(ctx);
    await patchUserSettings(ctx, userId, { uiLocale });
    return null;
  },
});
