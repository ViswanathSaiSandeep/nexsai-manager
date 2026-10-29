import { classifyMetaApiError, NexsaiMcpError } from "../utils/errors";
import { logMcpOperation } from "../utils/logger";

export const THREADS_GRAPH_BASE_URL = "https://graph.threads.net";
export const THREADS_API_VERSION = "v1.0";

/**
 * Checks whether a Threads access token is configured in server environment variables.
 * Never returns or logs the secret token.
 */
export function hasThreadsAccessToken(): boolean {
  return Boolean(process.env.THREADS_ACCESS_TOKEN?.trim());
}

/**
 * Retrieves the configured Threads access token from environment variables.
 * Never reuses INSTAGRAM_ACCESS_TOKEN as a Threads token.
 * Never hardcodes or logs the token.
 */
export function getThreadsAccessToken(): string {
  const token = process.env.THREADS_ACCESS_TOKEN?.trim();
  if (!token) {
    throw new NexsaiMcpError({
      category: "Authentication error",
      message:
        "THREADS_ACCESS_TOKEN is not configured in environment variables. Add THREADS_ACCESS_TOKEN in .env.local or Vercel Environment Variables.",
    });
  }
  return token;
}

export interface ThreadsRequestOptions {
  /** Path such as '/me', '/me/threads', '/{id}/insights', or '/keyword_search' */
  path: string;
  /** Whether to prefix with API version (default true: /v1.0/...) */
  useVersionPrefix?: boolean;
  method?: "GET" | "POST" | "DELETE";
  queryParams?: Record<string, string | number | boolean | undefined>;
  formBody?: Record<string, string | number | boolean | undefined>;
  operationName: string;
  toolName?: string;
  /** Timeout in milliseconds (default 12000ms) */
  timeoutMs?: number;
}

/**
 * Executes a request against `https://graph.threads.net/v1.0`, handling token injection,
 * bounded retry ONLY for idempotent GET requests on transient 5xx/network failures,
 * timing, safe structured logging, and error classification.
 */
export async function threadsGraphRequest<T>(
  options: ThreadsRequestOptions
): Promise<T> {
  const startTime = Date.now();
  const token = getThreadsAccessToken();
  const method = options.method ?? "GET";
  const useVersion = options.useVersionPrefix ?? true;
  const timeoutMs = options.timeoutMs ?? 12000;

  const normalizedPath = options.path.startsWith("/")
    ? options.path
    : `/${options.path}`;
  const versionedPath = useVersion
    ? `/${THREADS_API_VERSION}${normalizedPath}`
    : normalizedPath;

  const url = new URL(`${THREADS_GRAPH_BASE_URL}${versionedPath}`);

  if (options.queryParams) {
    for (const [key, value] of Object.entries(options.queryParams)) {
      if (value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  let fetchInit: RequestInit = {
    method,
    cache: "no-store",
  };

  if (method === "POST" && options.formBody) {
    const bodyParams = new URLSearchParams();
    for (const [key, value] of Object.entries(options.formBody)) {
      if (value !== undefined && value !== "") {
        bodyParams.set(key, String(value));
      }
    }
    bodyParams.set("access_token", token);
    fetchInit = {
      ...fetchInit,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: bodyParams.toString(),
    };
  } else {
    url.searchParams.set("access_token", token);
  }

  // Only retry idempotent GET requests (never retry non-idempotent POST publishing calls)
  const maxAttempts = method === "GET" ? 2 : 1;
  let lastNetworkErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response: Response;
    let data: unknown;

    try {
      response = await fetch(url.toString(), {
        ...fetchInit,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await response.text();
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text };
      }
    } catch (networkErr) {
      lastNetworkErr = networkErr;
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 300 * attempt));
        continue;
      }
      const durationMs = Date.now() - startTime;
      logMcpOperation({
        level: "error",
        tool: options.toolName,
        operation: options.operationName,
        success: false,
        durationMs,
        errorType: "Threads API error",
        message:
          lastNetworkErr instanceof Error
            ? lastNetworkErr.message
            : "Network request to Threads Graph API failed",
      });
      throw new NexsaiMcpError({
        category: "Threads API error",
        message: `Network failure communicating with Threads Graph API during ${options.operationName}.`,
      });
    }

    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      // Do not retry 4xx client/permission/auth errors
      const classifiedError = classifyMetaApiError(
        response.status,
        data,
        options.operationName,
        "Threads"
      );
      logMcpOperation({
        level: "error",
        tool: options.toolName,
        operation: options.operationName,
        success: false,
        metaStatus: response.status,
        durationMs,
        errorType: classifiedError.category,
        message: classifiedError.message,
      });
      throw classifiedError;
    }

    logMcpOperation({
      level: "info",
      tool: options.toolName,
      operation: options.operationName,
      success: true,
      metaStatus: response.status,
      durationMs,
    });

    return data as T;
  }

  throw new NexsaiMcpError({
    category: "Threads API error",
    message: `Unexpected termination in Threads Graph API request (${options.operationName}).`,
  });
}

/**
 * Refreshes a long-lived Threads User Access Token (`th_refresh_token`).
 * Official endpoint: `GET https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=...`
 * Long-lived tokens are valid for 60 days and can be refreshed after at least 24 hours.
 */
export async function refreshThreadsLongLivedToken(toolName = "threads_account_status"): Promise<{
  token_type: string;
  expires_in_seconds: number;
  expires_in_days: number;
  refreshed: boolean;
}> {
  const data = await threadsGraphRequest<{
    access_token?: string;
    token_type?: string;
    expires_in?: number;
  }>({
    path: "/refresh_access_token",
    useVersionPrefix: false,
    method: "GET",
    queryParams: {
      grant_type: "th_refresh_token",
    },
    operationName: "refreshThreadsLongLivedToken",
    toolName,
  });

  const expiresIn = data.expires_in ?? 5184000;
  return {
    token_type: data.token_type ?? "bearer",
    expires_in_seconds: expiresIn,
    expires_in_days: Math.round((expiresIn / 86400) * 10) / 10,
    refreshed: Boolean(data.access_token),
  };
}

