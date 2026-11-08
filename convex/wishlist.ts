import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { hasAccess, isAdmin, requireAdmin } from "./lib/auth";

// Signing up puts a user on the wishlist; an admin approves them here.
// All real work is gated server-side by requireUserId / requireUserIdInAction.

export const status = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get("users", userId);
    if (user === null) return null;
    return { userId, email: user.email ?? null, hasAccess: await hasAccess(ctx, userId) };
  },
});

// For actions, which can't read the database directly.
export const checkAccess = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => await hasAccess(ctx, userId),
});

const LIST_LIMIT = 200;

export const waiting = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db
      .query("users")
      .withIndex("by_approvedAt", (q) => q.eq("approvedAt", undefined))
      .take(LIST_LIMIT);
    const result = [];
    for (const user of users) {
      if (await isAdmin(ctx, user._id)) continue;
      result.push({ _id: user._id, email: user.email ?? null, date: user._creationTime });
    }
    return result;
  },
});

export const approved = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db
      .query("users")
      .withIndex("by_approvedAt", (q) => q.gt("approvedAt", 0))
      .order("desc")
      .take(LIST_LIMIT);
    return users.map((user) => ({ _id: user._id, email: user.email ?? null, date: user.approvedAt ?? 0 }));
  },
});

export const approve = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireAdmin(ctx);
    const user = await ctx.db.get("users", userId);
    if (user !== null && user.approvedAt === undefined) {
      await ctx.db.patch("users", userId, { approvedAt: Date.now() });
    }
    return null;
  },
});

export const revoke = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireAdmin(ctx);
    const user = await ctx.db.get("users", userId);
    if (user !== null) await ctx.db.patch("users", userId, { approvedAt: undefined });
    return null;
  },
});
