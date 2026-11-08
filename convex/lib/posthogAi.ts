// Node types only for process.env typings; this file does not run in Node.
/// <reference types="node" />

import { PostHog } from "posthog-node/edge";

// Server-side LLM analytics. The edge build runs in Convex's default runtime
// (the Node build needs node:* modules). Needs POSTHOG_PROJECT_TOKEN and
// POSTHOG_HOST in the Convex deployment env; without them nothing is sent.

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
        requestTimeout: 2000,
        fetchRetryCount: 0,
      })
    : null;

const aiIdentifier = (value: string) => value.replace(/[^A-Za-z0-9\-_~.@()!':|]/g, "-");

export type AiContext = {
  distinctId: string;
  sessionId: string | null;
  traceId: string;
};

type AiUsage = {
  inputTokens?: number;
  outputTokens?: number;
};

export function createAiContext({
  distinctId,
  sessionId,
  traceId = crypto.randomUUID(),
}: {
  distinctId: string;
  sessionId?: string | null;
  traceId?: string;
}): AiContext {
  return {
    distinctId,
    sessionId: sessionId ? aiIdentifier(sessionId) : null,
    traceId: aiIdentifier(traceId),
  };
}

export function captureAiGeneration({
  context,
  model,
  input,
  output,
  latencyMs,
  usage,
}: {
  context: AiContext;
  model: string;
  input: { role: "system" | "user" | "assistant"; content: string }[];
  output: { role: "assistant"; content: string }[];
  latencyMs: number;
  usage?: AiUsage;
}) {
  if (!posthog) return;

  try {
    posthog.capture({
      distinctId: context.distinctId,
      event: "$ai_generation",
      properties: {
        $ai_trace_id: context.traceId,
        $ai_session_id: context.sessionId,
        $ai_model: model,
        $ai_provider: model.split("/", 1)[0],
        $ai_input: input,
        $ai_output_choices: output,
        $ai_latency: latencyMs / 1000,
        ...(usage?.inputTokens !== undefined && { $ai_input_tokens: usage.inputTokens }),
        ...(usage?.outputTokens !== undefined && { $ai_output_tokens: usage.outputTokens }),
      },
    });

    // Not awaited so analytics never delays the learner; an event can be lost
    // if the action finishes before the request goes out.
    void posthog.flush().catch(() => undefined);
  } catch {
    // Analytics must not change the result of a completed AI request.
  }
}

export function captureAiToolSpan({
  context,
  name,
  input,
  output,
  latencyMs,
}: {
  context: AiContext;
  name: string;
  input: unknown;
  output: unknown;
  latencyMs: number;
}) {
  if (!posthog) return;

  try {
    posthog.capture({
      distinctId: context.distinctId,
      event: "$ai_span",
      properties: {
        $ai_trace_id: context.traceId,
        $ai_session_id: context.sessionId,
        $ai_span_id: crypto.randomUUID(),
        $ai_span_name: name,
        $ai_parent_id: context.traceId,
        $ai_input_state: input,
        $ai_output_state: output,
        $ai_latency: latencyMs / 1000,
      },
    });

    void posthog.flush().catch(() => undefined);
  } catch {
    // Analytics must not change the result of a completed tool run.
  }
}
