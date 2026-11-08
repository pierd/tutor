import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

const schema = defineSchema({
  ...authTables,
  // Extends the Convex Auth `users` table with access-control fields.
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    // Set when an admin lets the user in. Missing = still on the wishlist.
    approvedAt: v.optional(v.number()),
    role: v.optional(v.literal("admin")),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_approvedAt", ["approvedAt"]),
});

export default schema;
