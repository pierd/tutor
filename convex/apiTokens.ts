import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { hasAccess, requireUserId, requireUserIdInAction } from "./lib/auth";

// Personal tokens that let an agent use the MCP server (convex/mcp.ts) as
// the account. The token itself is shown once; only its hash is stored.

const MAX_TOKENS = 20;
const TOKEN_PREFIX = "tutor_";

export async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const b64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return TOKEN_PREFIX + b64;
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const tokens = await ctx.db
      .query("apiTokens")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .take(MAX_TOKENS);
    return tokens.map((t) => ({
      _id: t._id,
      _creationTime: t._creationTime,
      name: t.name,
      hint: t.hint,
      lastUsedAt: t.lastUsedAt ?? null,
    }));
  },
});

// An action so the secret comes from a real random source; returns the token
// in plain text, the only time it's available.
export const create = action({
  args: { name: v.string() },
  handler: async (ctx, { name }): Promise<string> => {
    const userId = await requireUserIdInAction(ctx);
    const clean = name.trim().slice(0, 100);
    if (!clean) throw new Error("Name is required");
    const token = randomToken();
    await ctx.runMutation(internal.apiTokens.store, {
      userId,
      name: clean,
      tokenHash: await hashToken(token),
      hint: token.slice(-4),
    });
    return token;
  },
});

export const store = internalMutation({
  args: { userId: v.id("users"), name: v.string(), tokenHash: v.string(), hint: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("apiTokens")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .take(MAX_TOKENS);
    if (existing.length >= MAX_TOKENS) throw new Error("Too many tokens");
    await ctx.db.insert("apiTokens", args);
    return null;
  },
});

export const revoke = mutation({
  args: { tokenId: v.id("apiTokens") },
  handler: async (ctx, { tokenId }) => {
    const userId = await requireUserId(ctx);
    const token = await ctx.db.get("apiTokens", tokenId);
    if (token === null || token.userId !== userId) throw new Error("Token not found");
    await ctx.db.delete("apiTokens", tokenId);
    return null;
  },
});

// --- Internal: used by the MCP endpoint ---

export const byHash = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, { tokenHash }) => {
    const token = await ctx.db
      .query("apiTokens")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .unique();
    // Same gate as requireUserId: losing access also cuts off the agents.
    if (token === null || !(await hasAccess(ctx, token.userId))) return null;
    return { tokenId: token._id, userId: token.userId, lastUsedAt: token.lastUsedAt ?? null };
  },
});

export const touch = internalMutation({
  args: { tokenId: v.id("apiTokens") },
  handler: async (ctx, { tokenId }) => {
    const token = await ctx.db.get("apiTokens", tokenId);
    if (token !== null) await ctx.db.patch("apiTokens", tokenId, { lastUsedAt: Date.now() });
    return null;
  },
});
