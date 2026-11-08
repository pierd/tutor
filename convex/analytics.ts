// Node types only for process.env typings; this file does not run in Node.
/// <reference types="node" />

import { PostHog } from "posthog-node/edge";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";

// Sends server-side analytics events. Scheduled by lib/posthogAi so the
// request runs in its own action: a fire-and-forget fetch in the caller can be
// dropped when that function returns, and awaiting it there would make the
// learner wait on PostHog. The edge build runs in Convex's default runtime
// (the Node build needs node:* modules).

const posthogProjectToken = process.env.POSTHOG_PROJECT_TOKEN;
const posthogHost = process.env.POSTHOG_HOST;

const posthog =
  posthogProjectToken && posthogHost
    ? new PostHog(posthogProjectToken, {
        host: posthogHost,
        privacyMode: false,
        enableExceptionAutocapture: false,
        flushAt: 1,
        flushInterval: 0,
        requestTimeout: 5000,
      })
    : null;

export const capture = internalAction({
  // Properties travel as JSON: Convex values can't have `$`-prefixed keys.
  args: { distinctId: v.string(), event: v.string(), properties: v.string() },
  handler: async (_ctx, { distinctId, event, properties }) => {
    if (!posthog) return null;
    await posthog.captureImmediate({ distinctId, event, properties: JSON.parse(properties) });
    return null;
  },
});
