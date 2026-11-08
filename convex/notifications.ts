// Node types only for process.env typings; this file does not run in Node.
/// <reference types="node" />

import { v } from "convex/values";
import { internalAction } from "./_generated/server";

// Emails the owner when someone joins the wishlist, sent from the
// tutor@lessismore.studio alias through Forward Email's API. Needs
// FORWARD_EMAIL_PASSWORD (the alias's generated password) and NOTIFY_EMAIL (the
// recipient) in the Convex deployment env; without them nothing is sent.

const FROM = "tutor@lessismore.studio";

export const wishlistSignup = internalAction({
  args: { email: v.union(v.string(), v.null()) },
  handler: async (_ctx, { email }) => {
    const password = process.env.FORWARD_EMAIL_PASSWORD;
    const to = process.env.NOTIFY_EMAIL;
    if (!password || !to) return null;
    const who = email ?? "Someone (no email)";
    const siteUrl = process.env.SITE_URL;
    const response = await fetch("https://api.forwardemail.net/v1/emails", {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${FROM}:${password}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        from: `Tutor <${FROM}>`,
        to,
        subject: `Wishlist: ${who} signed up`,
        text: `${who} joined the Tutor wishlist.${siteUrl ? `\n\nApprove them under Wishlist: ${siteUrl}` : ""}`,
      }),
    });
    if (!response.ok) {
      throw new Error(`Forward Email ${response.status}: ${await response.text()}`);
    }
    return null;
  },
});
