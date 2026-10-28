import { redactSecrets } from "./logger";

export type ErrorCategory =
  | "AUTHENTICATION_ERROR"
  | "PERMISSION_ERROR"
  | "VALIDATION_ERROR"
  | "RATE_LIMIT_ERROR"
  | "API_ERROR"
  | "NOT_FOUND"
  | "DUPLICATE_CONTENT"
  | "UNSUPPORTED_OPERATION"
  | "CONFIRMATION_REQUIRED"
  | "Authentication error"
  | "Permission error"
  | "Invalid media URL"
  | "Instagram API error"
  | "Rate limit error"
  | "Validation error"
  | "Unsupported operation"
  | "Duplicate publish protection";

const STANDARD_CODE_MAP: Record<ErrorCategory, string> = {
  AUTHENTICATION_ERROR: "AUTHENTICATION_ERROR",
  "Authentication error": "AUTHENTICATION_ERROR",
  PERMISSION_ERROR: "PERMISSION_ERROR",
  "Permission error": "PERMISSION_ERROR",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  "Validation error": "VALIDATION_ERROR",
  "Invalid media URL": "VALIDATION_ERROR",
  RATE_LIMIT_ERROR: "RATE_LIMIT_ERROR",
  "Rate limit error": "RATE_LIMIT_ERROR",
  API_ERROR: "API_ERROR",
  "Instagram API error": "API_ERROR",
  NOT_FOUND: "NOT_FOUND",
  DUPLICATE_CONTENT: "DUPLICATE_CONTENT",
  "Duplicate publish protection": "DUPLICATE_CONTENT",
  UNSUPPORTED_OPERATION: "UNSUPPORTED_OPERATION",
  "Unsupported operation": "UNSUPPORTED_OPERATION",
  CONFIRMATION_REQUIRED: "CONFIRMATION_REQUIRED",
};

export class NexsaiMcpError extends Error {
  public readonly category: ErrorCategory;
  public readonly statusCode?: number;
  public readonly metaErrorCode?: number;
  public readonly metaErrorSubcode?: number;
  public readonly details?: string;

  constructor(options: {
    category: ErrorCategory;
    message: string;
    statusCode?: number;
    metaErrorCode?: number;
    metaErrorSubcode?: number;
    details?: string;
  }) {
    super(redactSecrets(options.message));
    this.name = "NexsaiMcpError";
    this.category = options.category;
    this.statusCode = options.statusCode;
    this.metaErrorCode = options.metaErrorCode;
    this.metaErrorSubcode = options.metaErrorSubcode;
    this.details = options.details ? redactSecrets(options.details) : undefined;
  }

  public toStructuredResponse() {
    return {
      success: false,
      error: {
        code: STANDARD_CODE_MAP[this.category] ?? "API_ERROR",
        category: this.category,
        message: this.message,
        ...(this.statusCode !== undefined ? { http_status: this.statusCode } : {}),
        ...(this.metaErrorCode !== undefined ? { meta_code: this.metaErrorCode } : {}),
        ...(this.metaErrorSubcode !== undefined ? { meta_subcode: this.metaErrorSubcode } : {}),
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

interface MetaGraphErrorPayload {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

/**
 * Classifies an error response from the Meta / Instagram Graph API into a safe, Claude-understandable NexsaiMcpError.
 */
export function classifyMetaApiError(
  status: number,
  payload: unknown,
  fallbackContext: string
): NexsaiMcpError {
  const errObj =
    typeof payload === "object" && payload !== null && "error" in payload
      ? (payload as MetaGraphErrorPayload).error
      : undefined;

  const code = errObj?.code;
  const subcode = errObj?.error_subcode;
  const rawMessage = errObj?.message || `HTTP ${status} during ${fallbackContext}`;
  const safeMessage = redactSecrets(rawMessage);

  // Authentication errors (e.g. code 190 = OAuthException invalid/expired token)
  if (status === 401 || code === 190 || code === 102) {
    return new NexsaiMcpError({
      category: "Authentication error",
      message: `Instagram authentication failed: ${safeMessage}. Check that INSTAGRAM_ACCESS_TOKEN is valid and not expired.`,
      statusCode: status,
      metaErrorCode: code,
      metaErrorSubcode: subcode,
    });
  }

  // Permission errors (e.g. code 10, 200-299, or 403)
  if (status === 403 || code === 10 || (code !== undefined && code >= 200 && code < 300)) {
    return new NexsaiMcpError({
      category: "Permission error",
      message: `Instagram permission denied: ${safeMessage}. Ensure your Meta App and access token have the required Instagram scopes configured.`,
      statusCode: status,
      metaErrorCode: code,
      metaErrorSubcode: subcode,
    });
  }

  // Rate limit errors (code 4, 17, 32, 613, or HTTP 429)
  if (status === 429 || code === 4 || code === 17 || code === 32 || code === 613) {
    return new NexsaiMcpError({
      category: "Rate limit error",
      message: `Instagram API rate limit reached: ${safeMessage}. Please wait before retrying.`,
      statusCode: status,
      metaErrorCode: code,
      metaErrorSubcode: subcode,
    });
  }

  // Invalid media URL during container creation (code 9004 or message mentioning media URL / image)
  if (
    code === 9004 ||
    /media url|image_url|download|aspect ratio|format/i.test(safeMessage)
  ) {
    return new NexsaiMcpError({
      category: "Invalid media URL",
      message: `Instagram rejected the media URL: ${safeMessage}`,
      statusCode: status,
      metaErrorCode: code,
      metaErrorSubcode: subcode,
    });
  }

  // Unsupported operation or deprecated metric (code 100 often indicates unsupported field/metric or non-existent node)
  if (
    code === 100 &&
    /metric|unsupported|deprecated|not supported|cannot be loaded/i.test(safeMessage)
  ) {
    return new NexsaiMcpError({
      category: "Unsupported operation",
      message: `Instagram API reported an unsupported parameter, metric, or node: ${safeMessage}`,
      statusCode: status,
      metaErrorCode: code,
      metaErrorSubcode: subcode,
    });
  }

  return new NexsaiMcpError({
    category: "Instagram API error",
    message: `Instagram API error during ${fallbackContext}: ${safeMessage}`,
    statusCode: status,
    metaErrorCode: code,
    metaErrorSubcode: subcode,
  });
}

/**
 * Formats any caught error into a safe MCP tool error response without leaking stack traces or tokens.
 */
export function formatToolError(error: unknown, toolName: string) {
  if (error instanceof NexsaiMcpError) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(error.toStructuredResponse(), null, 2),
        },
      ],
      isError: true,
    };
  }

  const rawMsg = error instanceof Error ? error.message : String(error);
  const safeMsg = redactSecrets(rawMsg);

  const fallbackError = new NexsaiMcpError({
    category: "Instagram API error",
    message: `Error in ${toolName}: ${safeMsg}`,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(fallbackError.toStructuredResponse(), null, 2),
      },
    ],
    isError: true,
  };
}

