import { classifyMetaApiError, NexsaiMcpError } from "../utils/errors";
import { logMcpOperation } from "../utils/logger";

export const INSTAGRAM_GRAPH_BASE_URL = "https://graph.instagram.com";
export const INSTAGRAM_API_VERSION = "v24.0";

/**
 * Retrieves the configured Instagram access token from environment variables.
 * Never hardcodes or logs the token.
 */
export function getInstagramAccessToken(): string {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN?.trim();
  if (!token) {
    throw new NexsaiMcpError({
      category: "Authentication error",
      message:
        "INSTAGRAM_ACCESS_TOKEN is not configured in environment variables.",
    });
  }
  return token;
}

export interface InstagramRequestOptions {
  /** Path such as '/me', '/me/media', or '/{id}/comments' */
  path: string;
  /** Whether to prefix with API version (default true: /v24.0/...) */
  useVersionPrefix?: boolean;
  method?: "GET" | "POST" | "DELETE";
  queryParams?: Record<string, string | number | boolean | undefined>;
  formBody?: Record<string, string | number | boolean | undefined>;
  operationName: string;
  toolName?: string;
}

/**
 * Executes a request against `https://graph.instagram.com`, handling token injection,
 * timing, safe structured logging, and error classification.
 */
export async function instagramGraphRequest<T>(
  options: InstagramRequestOptions
): Promise<T> {
  const startTime = Date.now();
  const token = getInstagramAccessToken();
  const method = options.method ?? "GET";
  const useVersion = options.useVersionPrefix ?? true;

  const normalizedPath = options.path.startsWith("/")
    ? options.path
    : `/${options.path}`;
  const versionedPath = useVersion
    ? `/${INSTAGRAM_API_VERSION}${normalizedPath}`
    : normalizedPath;

  const url = new URL(`${INSTAGRAM_GRAPH_BASE_URL}${versionedPath}`);

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
      if (value !== undefined) {
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

  let response: Response;
  let data: unknown;

  try {
    response = await fetch(url.toString(), fetchInit);
    const text = await response.text();
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }
  } catch (networkErr) {
    const durationMs = Date.now() - startTime;
    logMcpOperation({
      level: "error",
      tool: options.toolName,
      operation: options.operationName,
      success: false,
      durationMs,
      errorType: "Instagram API error",
      message:
        networkErr instanceof Error
          ? networkErr.message
          : "Network request to Instagram Graph API failed",
    });
    throw new NexsaiMcpError({
      category: "Instagram API error",
      message: `Network failure communicating with Instagram Graph API during ${options.operationName}.`,
    });
  }

  const durationMs = Date.now() - startTime;

  if (!response.ok) {
    const classifiedError = classifyMetaApiError(
      response.status,
      data,
      options.operationName
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

