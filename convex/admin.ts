import { getAuthUserId } from "@convex-dev/auth/server";
import { internalMutation, internalQuery, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { isAdmin } from "./lib/auth";

export const me = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    return { isAdmin: userId !== null && (await isAdmin(ctx, userId)) };
  },
});

// For actions, which can't read the database directly.
export const checkAdmin = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => await isAdmin(ctx, userId),
});

async function userByEmail(ctx: MutationCtx, email: string) {
  const user = await ctx.db
    .query("users")
    .withIndex("email", (q) => q.eq("email", email.trim()))
    .unique();
  if (user === null) throw new Error(`No account with email ${email}; sign up first`);
  return user;
}

// Granted to an existing account only: sign-up has no email verification, so
// granting by email in advance would let anyone claim it.
export const grant = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const user = await userByEmail(ctx, email);
    if (!(await isAdmin(ctx, user._id))) {
      await ctx.db.insert("roles", { userId: user._id, role: "admin" });
    }
    return null;
  },
});

export const revoke = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const user = await userByEmail(ctx, email);
    const roles = await ctx.db
      .query("roles")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .take(10);
    for (const role of roles) await ctx.db.delete("roles", role._id);
    return null;
  },
});
