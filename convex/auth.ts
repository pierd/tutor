import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
  callbacks: {
    // A new account lands on the wishlist: let the owner know by email.
    async afterUserCreatedOrUpdated(ctx, { userId, existingUserId }) {
      if (existingUserId !== null) return;
      const user = await ctx.db.get(userId);
      const email = typeof user?.email === "string" ? user.email : null;
      await ctx.scheduler.runAfter(0, internal.notifications.wishlistSignup, { email });
    },
  },
});
