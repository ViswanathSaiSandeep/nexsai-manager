/**
 * Safe structured server-side logger for NEXSAI Manager MCP.
 * NEVER logs access tokens, authorization headers, or sensitive credentials.
 */

export type LogLevel = "info" | "warn" | "error";

export interface McpLogEntry {
  timestamp: string;
  level: LogLevel;
  tool?: string;
  operation: string;
  success: boolean;
  metaStatus?: number;
  durationMs?: number;
  message?: string;
  errorType?: string;
}

const TOKEN_PATTERNS = [
  /access_token=[^&\s"']+/gi,
  /Bearer\s+[A-Za-z0-9._\-]+/gi,
  /IG[A-Za-z0-9._\-]{20,}/g,
  /EA[A-Za-z0-9._\-]{20,}/g,
];

/**
 * Redacts any potential token or secret from a string before logging or returning in errors.
 */
export function redactSecrets(input: string): string {
  let sanitized = input;
  const envToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (envToken && envToken.length > 4) {
    sanitized = sanitized.split(envToken).join("[REDACTED_TOKEN]");
  }
  const mcpSecret = process.env.MCP_API_KEY;
  if (mcpSecret && mcpSecret.length > 4) {
    sanitized = sanitized.split(mcpSecret).join("[REDACTED_KEY]");
  }
  for (const pattern of TOKEN_PATTERNS) {
    sanitized = sanitized.replace(pattern, (match) => {
      if (match.toLowerCase().startsWith("access_token=")) {
        return "access_token=[REDACTED]";
      }
      if (match.toLowerCase().startsWith("bearer ")) {
        return "Bearer [REDACTED]";
      }
      return "[REDACTED_TOKEN]";
    });
  }
  return sanitized;
}

export function logMcpOperation(entry: Omit<McpLogEntry, "timestamp">): void {
  const safeEntry: McpLogEntry = {
    timestamp: new Date().toISOString(),
    ...entry,
    message: entry.message ? redactSecrets(entry.message) : undefined,
  };

  const logLine = JSON.stringify(safeEntry);
  if (entry.level === "error") {
    console.error(`[NEXSAI-MCP] ${logLine}`);
  } else if (entry.level === "warn") {
    console.warn(`[NEXSAI-MCP] ${logLine}`);
  } else {
    console.info(`[NEXSAI-MCP] ${logLine}`);
  }
}

