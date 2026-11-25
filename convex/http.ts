import { httpRouter } from "convex/server";
import { auth } from "./auth";
import * as mcp from "./mcp";

const http = httpRouter();

auth.addHttpRoutes(http);

// MCP server for agents (see convex/mcp.ts): /mcp with a bearer token, or
// /mcp/t/<token> for clients that can't send headers.
for (const route of [{ path: "/mcp" }, { pathPrefix: "/mcp/t/" }]) {
  http.route({ ...route, method: "POST", handler: mcp.post });
  http.route({ ...route, method: "GET", handler: mcp.notAllowed });
  http.route({ ...route, method: "DELETE", handler: mcp.notAllowed });
  http.route({ ...route, method: "OPTIONS", handler: mcp.preflight });
}

export default http;
