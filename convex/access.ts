import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

export function isAdmin(user: Doc<"users">) {
  return user.role === "admin";
}

export function hasAccess(user: Doc<"users">) {
  return isAdmin(user) || user.approvedAt !== undefined;
}

export async function getCurrentUser(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return null;
  return await ctx.db.get("users", userId);
}

/**
 * Use in every function that does real (costly) work: only approved users
 * and admins get past this. Users still on the wishlist are rejected.
 */
export async function requireApprovedUser(ctx: QueryCtx | MutationCtx) {
  const user = await getCurrentUser(ctx);
  if (user === null) throw new ConvexError("Not signed in");
  if (!hasAccess(user)) throw new ConvexError("You're still on the wishlist");
  return user;
}

export async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const user = await getCurrentUser(ctx);
  if (user === null || !isAdmin(user)) throw new ConvexError("Admins only");
  return user;
}
