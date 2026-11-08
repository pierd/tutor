import { getAuthUserId } from "@convex-dev/auth/server";
import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export async function requireUserId(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Not authenticated");
  return userId;
}

// Loads a profile and checks that it belongs to the signed-in user.
export async function requireProfile(ctx: QueryCtx, profileId: Id<"profiles">) {
  const userId = await requireUserId(ctx);
  const profile = await ctx.db.get("profiles", profileId);
  if (profile === null || profile.userId !== userId) {
    throw new Error("Profile not found");
  }
  return profile;
}

export async function requireItem(ctx: QueryCtx, itemId: Id<"items">) {
  const item = await ctx.db.get("items", itemId);
  if (item === null) throw new Error("Item not found");
  await requireProfile(ctx, item.profileId);
  return item;
}
