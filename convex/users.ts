import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { getCurrentUser, hasAccess, isAdmin, requireAdmin } from "./access";

export const me = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (user === null) return null;
    return {
      email: user.email ?? null,
      isAdmin: isAdmin(user),
      hasAccess: hasAccess(user),
    };
  },
});

const PAGE_SIZE = 200;

export const listWishlist = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db
      .query("users")
      .withIndex("by_approvedAt", (q) => q.eq("approvedAt", undefined))
      .take(PAGE_SIZE);
    return users
      .filter((user) => !isAdmin(user))
      .map((user) => ({
        _id: user._id,
        _creationTime: user._creationTime,
        email: user.email ?? null,
      }));
  },
});

export const listApproved = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const users = await ctx.db
      .query("users")
      .withIndex("by_approvedAt", (q) => q.gt("approvedAt", 0))
      .order("desc")
      .take(PAGE_SIZE);
    return users.map((user) => ({
      _id: user._id,
      approvedAt: user.approvedAt!,
      email: user.email ?? null,
    }));
  },
});

export const approve = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireAdmin(ctx);
    const user = await ctx.db.get("users", userId);
    if (user === null || user.approvedAt !== undefined) return null;
    await ctx.db.patch("users", userId, { approvedAt: Date.now() });
    return null;
  },
});

export const revoke = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    await requireAdmin(ctx);
    await ctx.db.patch("users", userId, { approvedAt: undefined });
    return null;
  },
});

/**
 * Bootstrap an admin from the CLI:
 *   npx convex run users:makeAdmin '{"email":"you@example.com"}'
 */
export const makeAdmin = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .unique();
    if (user === null) throw new Error(`No user with email ${email}`);
    await ctx.db.patch("users", user._id, { role: "admin" });
    return null;
  },
});
