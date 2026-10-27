import { NexsaiMcpError } from "./errors";

/**
 * Abstraction for media storage and validation (Phase 10).
 *
 * Instagram publishing requires publicly accessible HTTPS media URLs.
 * Local filesystem paths cannot be sent directly to the Instagram Graph API.
 *
 * Future providers (Supabase Storage, Cloudinary, Vercel Blob) can implement
 * `MediaStorageProvider` to upload or resolve assets into public HTTPS URLs
 * without changing the publishing business logic or MCP tool definitions.
 */
export interface MediaStorageProvider {
  readonly name: string;
  /**
   * Validates and resolves a media source into a publicly accessible HTTPS URL
   * suitable for the Instagram Graph API.
   */
  resolvePublicHttpsUrl(sourceUrl: string): Promise<string>;
}

const PRIVATE_OR_LOCAL_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/,
  /^0\.0\.0\.0$/,
  /^\[?::1\]?$/,
  /\.local$/i,
  /\.internal$/i,
];

/**
 * Default provider that validates direct publicly accessible HTTPS URLs.
 */
export class DirectHttpsMediaProvider implements MediaStorageProvider {
  public readonly name = "DirectHttpsMediaProvider";

  public async resolvePublicHttpsUrl(sourceUrl: string): Promise<string> {
    const trimmed = sourceUrl.trim();

    // Reject local file paths or file:// URLs
    if (
      trimmed.startsWith("file://") ||
      /^[a-zA-Z]:\\/.test(trimmed) ||
      trimmed.startsWith("/")
    ) {
      throw new NexsaiMcpError({
        category: "Invalid media URL",
        message:
          "Local filesystem paths are not supported by Instagram publishing. Provide a publicly accessible HTTPS URL.",
      });
    }

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      throw new NexsaiMcpError({
        category: "Invalid media URL",
        message: "The provided image_url is not a valid URL.",
      });
    }

    if (parsed.protocol !== "https:") {
      throw new NexsaiMcpError({
        category: "Invalid media URL",
        message: `Instagram requires a publicly accessible HTTPS URL (received protocol '${parsed.protocol}').`,
      });
    }

    const hostname = parsed.hostname;
    if (
      !hostname ||
      !hostname.includes(".") ||
      PRIVATE_OR_LOCAL_HOST_PATTERNS.some((re) => re.test(hostname))
    ) {
      throw new NexsaiMcpError({
        category: "Invalid media URL",
        message: `The URL hostname '${hostname}' appears to be local or private. Instagram Graph API requires a publicly reachable HTTPS URL.`,
      });
    }

    if (parsed.username || parsed.password) {
      throw new NexsaiMcpError({
        category: "Invalid media URL",
        message: "Media URL must not contain embedded credentials.",
      });
    }

    return parsed.toString();
  }
}

export const defaultMediaStorageProvider: MediaStorageProvider =
  new DirectHttpsMediaProvider();

