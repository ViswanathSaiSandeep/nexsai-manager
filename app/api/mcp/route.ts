import { timingSafeEqual } from "crypto";
import { createMcpHandler } from "mcp-handler";
import { registerNexsaiTools } from "../../../lib/mcp/tools";
import { registerNexsaiResources } from "../../../lib/mcp/resources";
import { registerNexsaiPrompts } from "../../../lib/mcp/prompts";
import { logMcpOperation } from "../../../lib/utils/logger";

const mcpHandler = createMcpHandler(
  (server) => {
    registerNexsaiTools(server);
    registerNexsaiResources(server);
    registerNexsaiPrompts(server);
  },
  {
    serverInfo: {
      name: "nexsai-manager",
      version: "2.0.0",
    },
  }
);

function constantTimeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Verifies optional MCP endpoint bearer/header authentication when `MCP_API_KEY` is configured.
 * - If `MCP_API_KEY` is set in environment variables (strongly recommended on Vercel production),
 *   requests must supply `Authorization: Bearer <MCP_API_KEY>` or `x-mcp-api-key: <MCP_API_KEY>`.
 * - If `MCP_API_KEY` is not set (default for local development), requests are allowed through.
 */
function verifyMcpEndpointAuth(request: Request): Response | null {
  const expectedKey = process.env.MCP_API_KEY?.trim();
  if (!expectedKey) {
    return null;
  }

  const authHeader = request.headers.get("authorization");
  const bearerToken = authHeader?.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : undefined;
  const headerKey = request.headers.get("x-mcp-api-key")?.trim();

  const provided = bearerToken || headerKey;

  if (!provided || !constantTimeCompare(provided, expectedKey)) {
    logMcpOperation({
      level: "warn",
      operation: "mcpEndpointAuth",
      success: false,
      errorType: "Authentication error",
      message: "Rejected unauthorized request to /api/mcp (missing or invalid MCP_API_KEY).",
    });

    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32001,
          message:
            "Unauthorized: Valid MCP_API_KEY required via 'Authorization: Bearer <key>' or 'x-mcp-api-key' header.",
        },
        id: null,
      }),
      {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "WWW-Authenticate": 'Bearer realm="nexsai-manager-mcp"',
        },
      }
    );
  }

  return null;
}

async function handleMcpRequest(request: Request): Promise<Response> {
  const authErrorResponse = verifyMcpEndpointAuth(request);
  if (authErrorResponse) {
    return authErrorResponse;
  }
  return mcpHandler(request);
}

export { handleMcpRequest as GET, handleMcpRequest as POST, handleMcpRequest as DELETE };
