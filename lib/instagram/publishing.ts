import { instagramGraphRequest } from "./client";
import type { InstagramPublishResult } from "./types";
import {
  defaultMediaStorageProvider,
  type MediaStorageProvider,
} from "../utils/media-storage";
import {
  checkPublishSafetyGuard,
  recordSuccessfulPublish,
} from "../utils/rate-limit";
import { NexsaiMcpError } from "../utils/errors";
import { logMcpOperation } from "../utils/logger";

export const INSTAGRAM_MAX_CAPTION_LENGTH = 2200;
export const INSTAGRAM_MAX_HASHTAGS = 30;

export interface PublishInstagramImageParams {
  image_url: string;
  caption: string;
  confirm?: boolean;
  storageProvider?: MediaStorageProvider;
}

export function countHashtags(caption: string): number {
  const matches = caption.match(/#[\p{L}\p{N}_]+/gu);
  return matches ? matches.length : 0;
}

export function formatPublishPreviewText(
  imageUrl: string,
  caption: string
): string {
  return [
    "Publishing preview",
    "",
    `Image: ${imageUrl}`,
    `Caption: ${caption}`,
    "",
    "No post was published.",
    "",
    "Set confirm=true to publish.",
  ].join("\n");
}

/**
 * Publishes an image post to the connected Instagram account.
 *
 * SAFETY:
 * - If `confirm` is false or omitted, NO API call is made to Meta.
 *   Returns a clear preview instructing the caller to set `confirm=true`.
 * - Validates HTTPS URL via MediaStorageProvider.
 * - Enforces caption length (<= 2200 chars) and hashtag limit (<= 30).
 * - Protects against rapid duplicate publishing.
 */
export async function publishInstagramPost(
  params: PublishInstagramImageParams,
  toolName = "instagram_publish"
): Promise<{
  result: InstagramPublishResult;
  formattedPreview?: string;
}> {
  const storage = params.storageProvider ?? defaultMediaStorageProvider;
  const validatedImageUrl = await storage.resolvePublicHttpsUrl(
    params.image_url
  );

  const caption = params.caption;
  if (caption.length > INSTAGRAM_MAX_CAPTION_LENGTH) {
    throw new NexsaiMcpError({
      category: "Validation error",
      message: `Caption length (${caption.length}) exceeds Instagram maximum of ${INSTAGRAM_MAX_CAPTION_LENGTH} characters.`,
    });
  }

  const hashtagCount = countHashtags(caption);
  if (hashtagCount > INSTAGRAM_MAX_HASHTAGS) {
    throw new NexsaiMcpError({
      category: "Validation error",
      message: `Caption contains ${hashtagCount} hashtags, exceeding Instagram maximum of ${INSTAGRAM_MAX_HASHTAGS} hashtags.`,
    });
  }

  const confirm = params.confirm === true;

  if (!confirm) {
    const previewText = formatPublishPreviewText(validatedImageUrl, caption);
    logMcpOperation({
      level: "info",
      tool: toolName,
      operation: "publishInstagramPost:preview",
      success: true,
      message: "Returned publishing preview (confirm=false). No post published.",
    });

    return {
      result: {
        published: false,
        confirm_required: true,
        preview: {
          image_url: validatedImageUrl,
          caption,
          caption_length: caption.length,
          hashtag_count: hashtagCount,
        },
        message: previewText,
      },
      formattedPreview: previewText,
    };
  }

  // Check duplicate / rate-limit guard before executing actual publish
  checkPublishSafetyGuard(validatedImageUrl, caption);

  // STEP 1 — CREATE MEDIA CONTAINER (Preserving working endpoint & form body)
  const createData = await instagramGraphRequest<{ id?: string }>({
    path: "/me/media",
    useVersionPrefix: false, // Preserves exact working https://graph.instagram.com/me/media endpoint
    method: "POST",
    formBody: {
      image_url: validatedImageUrl,
      caption,
    },
    operationName: "publishInstagramPost:createContainer",
    toolName,
  });

  if (!createData.id) {
    throw new NexsaiMcpError({
      category: "Instagram API error",
      message:
        "Instagram did not return a creation container ID when creating the media container.",
    });
  }

  const creationId = createData.id;

  // STEP 2 — PUBLISH MEDIA CONTAINER (Preserving working endpoint & form body)
  const publishData = await instagramGraphRequest<{ id?: string }>({
    path: "/me/media_publish",
    useVersionPrefix: false, // Preserves exact working https://graph.instagram.com/me/media_publish endpoint
    method: "POST",
    formBody: {
      creation_id: creationId,
    },
    operationName: "publishInstagramPost:publishContainer",
    toolName,
  });

  if (!publishData.id) {
    throw new NexsaiMcpError({
      category: "Instagram API error",
      message:
        "Instagram did not return a published media ID after media_publish.",
    });
  }

  const publishedMediaId = publishData.id;
  recordSuccessfulPublish(validatedImageUrl, caption, publishedMediaId);

  // STEP 3 — Fetch permalink if available (non-fatal if permalink lookup fails)
  let permalink: string | undefined;
  let timestamp: string | undefined;
  try {
    const details = await instagramGraphRequest<{
      permalink?: string;
      timestamp?: string;
    }>({
      path: `/${encodeURIComponent(publishedMediaId)}`,
      method: "GET",
      queryParams: {
        fields: "id,permalink,timestamp",
      },
      operationName: "publishInstagramPost:fetchPermalink",
      toolName,
    });
    permalink = details.permalink;
    timestamp = details.timestamp;
  } catch {
    // Non-fatal: still return published media_id and creation_id
  }

  return {
    result: {
      success: true,
      published: true,
      message: "Instagram post published successfully.",
      media_id: publishedMediaId,
      creation_id: creationId,
      ...(permalink ? { permalink } : {}),
      ...(timestamp ? { timestamp } : {}),
    },
  };
}

