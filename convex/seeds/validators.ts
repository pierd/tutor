import { v } from "convex/values";

// Convex validators matching seeds/types.ts, for storing proposed content.

export const seedItemValidator = v.object({
  kind: v.union(v.literal("lemma"), v.literal("chunk"), v.literal("grammar"), v.literal("glyph")),
  key: v.string(),
  text: v.string(),
  gloss: v.optional(v.string()),
  notes: v.optional(v.string()),
});

export const seedCardValidator = v.object({
  itemKeys: v.array(v.string()),
  kind: v.union(v.literal("meaning"), v.literal("form")),
  prompt: v.string(),
  cue: v.optional(v.string()),
  answer: v.string(),
  accepted: v.array(v.string()),
});

export const lessonOutlineValidator = v.object({
  title: v.string(),
  description: v.optional(v.string()),
  // What the lesson should cover, for the background lesson builder.
  focus: v.string(),
});
