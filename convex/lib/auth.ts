import { getAuthUserId } from "@convex-dev/auth/server";
import type { ActionCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";

// Signed in, but possibly still on the wishlist. Only for the few functions a
// waiting user needs (wishlist status, UI locale).
export async function requireSignedInUserId(ctx: QueryCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Not authenticated");
  return userId;
}

// Signed in and let in from the wishlist (or an admin). Everything that does
// real work goes through this, directly or via requireProfile/requireItem.
export async function requireUserId(ctx: QueryCtx) {
  const userId = await requireSignedInUserId(ctx);
  if (!(await hasAccess(ctx, userId))) throw new Error("Still on the wishlist");
  return userId;
}

// Actions can't read the database: same check as requireUserId via a query.
export async function requireUserIdInAction(ctx: ActionCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Not authenticated");
  const allowed: boolean = await ctx.runQuery(internal.wishlist.checkAccess, { userId });
  if (!allowed) throw new Error("Still on the wishlist");
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

export async function isAdmin(ctx: QueryCtx, userId: Id<"users">) {
  const role = await ctx.db
    .query("roles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .first();
  return role?.role === "admin";
}

export async function hasAccess(ctx: QueryCtx, userId: Id<"users">) {
  const user = await ctx.db.get("users", userId);
  if (user === null) return false;
  return user.approvedAt !== undefined || (await isAdmin(ctx, userId));
}

export async function requireAdmin(ctx: QueryCtx) {
  const userId = await requireSignedInUserId(ctx);
  if (!(await isAdmin(ctx, userId))) throw new Error("Admins only");
  return userId;
}
