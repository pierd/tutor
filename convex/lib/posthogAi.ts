// Node types only for process.env typings; this file does not run in Node.
/// <reference types="node" />

import type { Scheduler } from "convex/server";
import { internal } from "../_generated/api";

// Server-side LLM analytics. Events are sent by the scheduled
// `analytics.capture` action, so capturing only costs a scheduler call. Needs
// POSTHOG_PROJECT_TOKEN and POSTHOG_HOST in the Convex deployment env; without
// them nothing is scheduled.

const isEnabled = Boolean(process.env.POSTHOG_PROJECT_TOKEN && process.env.POSTHOG_HOST);

const aiIdentifier = (value: string) => value.replace(/[^A-Za-z0-9\-_~.@()!':|]/g, "-");

export type AiContext = {
  scheduler: Scheduler;
  distinctId: string;
  sessionId: string | null;
  traceId: string;
};

type AiUsage = {
  inputTokens?: number;
  outputTokens?: number;
};

export function createAiContext({
  scheduler,
  distinctId,
  sessionId,
  traceId = crypto.randomUUID(),
}: {
  scheduler: Scheduler;
  distinctId: string;
  sessionId?: string | null;
  traceId?: string;
}): AiContext {
  return {
    scheduler,
    distinctId,
    sessionId: sessionId ? aiIdentifier(sessionId) : null,
    traceId: aiIdentifier(traceId),
  };
}

async function capture(context: AiContext, event: string, properties: Record<string, unknown>) {
  if (!isEnabled) return;

  try {
    await context.scheduler.runAfter(0, internal.analytics.capture, {
      distinctId: context.distinctId,
      event,
      properties: JSON.stringify(properties),
    });
  } catch {
    // Analytics must not change the result of a completed AI request.
  }
}

export async function captureAiGeneration({
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
  await capture(context, "$ai_generation", {
    $ai_trace_id: context.traceId,
    $ai_session_id: context.sessionId,
    $ai_model: model,
    $ai_provider: model.split("/", 1)[0],
    $ai_input: input,
    $ai_output_choices: output,
    $ai_latency: latencyMs / 1000,
    ...(usage?.inputTokens !== undefined && { $ai_input_tokens: usage.inputTokens }),
    ...(usage?.outputTokens !== undefined && { $ai_output_tokens: usage.outputTokens }),
  });
}

export async function captureAiToolSpan({
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
  await capture(context, "$ai_span", {
    $ai_trace_id: context.traceId,
    $ai_session_id: context.sessionId,
    $ai_span_id: crypto.randomUUID(),
    $ai_span_name: name,
    $ai_parent_id: context.traceId,
    $ai_input_state: input,
    $ai_output_state: output,
    $ai_latency: latencyMs / 1000,
  });
}
