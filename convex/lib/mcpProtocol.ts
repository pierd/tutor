// A minimal Model Context Protocol server over Streamable HTTP: stateless,
// tools only, every request answered with a single JSON response (no SSE).
// https://modelcontextprotocol.io/specification/2025-06-18/basic/transports

import { z } from "zod";

export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

export type ToolResult = { text: string; data?: unknown; isError?: boolean };

export type Tool<Ctx> = {
  name: string;
  title: string;
  description: string;
  input: z.ZodObject;
  annotations: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean };
  run: (ctx: Ctx, args: never) => Promise<ToolResult>;
};

// Keeps each tool's `run` typed by its own input schema.
export function defineTool<Ctx, S extends z.ZodObject>(tool: {
  name: string;
  title: string;
  description: string;
  input: S;
  annotations: Tool<Ctx>["annotations"];
  run: (ctx: Ctx, args: z.output<S>) => Promise<ToolResult>;
}): Tool<Ctx> {
  return tool as unknown as Tool<Ctx>;
}

export type ServerInfo = { name: string; title: string; version: string; instructions: string };

type JsonRpcId = string | number;
type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: JsonRpcId | null; result: unknown }
  | { jsonrpc: "2.0"; id: JsonRpcId | null; error: { code: number; message: string; data?: unknown } };

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function inputSchema(schema: z.ZodObject) {
  const json = z.toJSONSchema(schema, { io: "input" }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

// Handles one parsed JSON-RPC message. Returns null for notifications and
// responses, which get no reply.
export async function handleMessage<Ctx>(
  message: unknown,
  ctx: Ctx,
  server: ServerInfo,
  tools: Tool<Ctx>[],
  describeError: (e: unknown) => string,
): Promise<JsonRpcResponse | null> {
  if (!isObject(message) || message.jsonrpc !== "2.0") {
    return { jsonrpc: "2.0", id: null, error: { code: INVALID_REQUEST, message: "Not a JSON-RPC 2.0 message" } };
  }
  const id = message.id;
  if (id === undefined || typeof message.method !== "string") return null;
  if (typeof id !== "string" && typeof id !== "number") {
    return { jsonrpc: "2.0", id: null, error: { code: INVALID_REQUEST, message: "Invalid id" } };
  }
  const params = isObject(message.params) ? message.params : {};
  const ok = (result: unknown): JsonRpcResponse => ({ jsonrpc: "2.0", id, result });
  const err = (code: number, msg: string): JsonRpcResponse => ({ jsonrpc: "2.0", id, error: { code, message: msg } });

  switch (message.method) {
    case "initialize": {
      const requested = params.protocolVersion;
      const protocolVersion =
        typeof requested === "string" && SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
          ? requested
          : SUPPORTED_PROTOCOL_VERSIONS[0];
      return ok({
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: server.name, title: server.title, version: server.version },
        instructions: server.instructions,
      });
    }
    case "ping":
      return ok({});
    case "tools/list":
      return ok({
        tools: tools.map((t) => ({
          name: t.name,
          title: t.title,
          description: t.description,
          inputSchema: inputSchema(t.input),
          annotations: { title: t.title, openWorldHint: false, ...t.annotations },
        })),
      });
    case "tools/call": {
      const tool = tools.find((t) => t.name === params.name);
      if (!tool) return err(INVALID_PARAMS, `Unknown tool: ${String(params.name)}`);
      const parsed = tool.input.safeParse(params.arguments ?? {});
      if (!parsed.success) {
        return ok({
          content: [{ type: "text", text: `Invalid arguments: ${z.prettifyError(parsed.error)}` }],
          isError: true,
        });
      }
      try {
        const result = await tool.run(ctx, parsed.data as never);
        return ok({
          content: [{ type: "text", text: result.text }],
          ...(isObject(result.data) ? { structuredContent: result.data } : {}),
          ...(result.isError ? { isError: true } : {}),
        });
      } catch (e) {
        return ok({ content: [{ type: "text", text: describeError(e) }], isError: true });
      }
    }
    default:
      return err(METHOD_NOT_FOUND, `Method not found: ${message.method}`);
  }
}

// Handles a POSTed body: one message, or a batch (older protocol versions).
export async function handleBody<Ctx>(
  body: string,
  ctx: Ctx,
  server: ServerInfo,
  tools: Tool<Ctx>[],
  describeError: (e: unknown) => string,
): Promise<{ status: number; json?: unknown }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { status: 400, json: { jsonrpc: "2.0", id: null, error: { code: PARSE_ERROR, message: "Parse error" } } };
  }
  try {
    if (Array.isArray(parsed)) {
      const replies = await Promise.all(parsed.map((m) => handleMessage(m, ctx, server, tools, describeError)));
      const out = replies.filter((r) => r !== null);
      return out.length ? { status: 200, json: out } : { status: 202 };
    }
    const reply = await handleMessage(parsed, ctx, server, tools, describeError);
    return reply ? { status: 200, json: reply } : { status: 202 };
  } catch (e) {
    return {
      status: 500,
      json: { jsonrpc: "2.0", id: null, error: { code: INTERNAL_ERROR, message: describeError(e) } },
    };
  }
}
