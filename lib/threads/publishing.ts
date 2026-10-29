import { threadsGraphRequest } from "./client";
import type {
  ThreadsCarouselItemInput,
  ThreadsPublishMediaType,
  ThreadsPublishResult,
  ThreadsReplyControl,
} from "./types";
import {
  defaultMediaStorageProvider,
  type MediaStorageProvider,
} from "../utils/media-storage";
import {
  checkPublishSafetyGuard,
  recordSuccessfulPublish,
} from "../utils/rate-limit";
import {
  computeContentHash,
  loadDatabaseState,
  updateContentPlanStatus,
  upsertMediaRecord,
} from "../database/store";
import { NexsaiMcpError } from "../utils/errors";
import { logMcpOperation } from "../utils/logger";

export const THREADS_MAX_TEXT_LENGTH = 500;
export const THREADS_MAX_CAROUSEL_ITEMS = 20;
export const THREADS_MIN_CAROUSEL_ITEMS = 2;

export interface PublishThreadsPostParams {
  media_type?: ThreadsPublishMediaType;
  text?: string;
  image_url?: string;
  video_url?: string;
  carousel_items?: ThreadsCarouselItemInput[];
  link_attachment?: string;
  topic_tag?: string;
  alt_text?: string;
  reply_control?: ThreadsReplyControl;
  reply_to_id?: string;
  quote_post_id?: string;
  confirm?: boolean;
  force_duplicate?: boolean;
  plan_id?: string;
  storageProvider?: MediaStorageProvider;
}

export function validateThreadsTopicTag(tag: string): string {
  const cleaned = tag.replace(/^#/, "").trim();
  if (!cleaned || cleaned.length > 50) {
    throw new NexsaiMcpError({
      category: "Validation error",
      message: "Threads topic_tag must be between 1 and 50 characters.",
    });
  }
  if (/[.&]/.test(cleaned)) {
    throw new NexsaiMcpError({
      category: "Validation error",
      message:
        "Threads topic_tag cannot contain periods ('.') or ampersands ('&') per official Meta Threads API rules.",
    });
  }
  return cleaned;
}

export function formatThreadsPublishPreviewText(params: {
  mediaType: ThreadsPublishMediaType;
  text: string;
  imageUrl?: string;
  videoUrl?: string;
  carouselCount?: number;
  linkAttachment?: string;
  topicTag?: string;
  replyControl?: string;
  duplicateWarning?: string;
}): string {
  const lines = [
    "PUBLISH PREVIEW (THREADS)",
    "(Publishing preview)",
    "",
    `Platform: Threads (@nexsaicommunity)`,
    `Format: ${params.mediaType}${
      params.carouselCount ? ` (${params.carouselCount} items)` : ""
    }`,
    `Text (${params.text.length}/${THREADS_MAX_TEXT_LENGTH} chars): ${
      params.text || "(none)"
    }`,
    ...(params.imageUrl ? [`Image URL: ${params.imageUrl}`] : []),
    ...(params.videoUrl ? [`Video URL: ${params.videoUrl}`] : []),
    ...(params.linkAttachment ? [`Link Attachment: ${params.linkAttachment}`] : []),
    ...(params.topicTag ? [`Topic Tag: ${params.topicTag}`] : []),
    ...(params.replyControl ? [`Reply Control: ${params.replyControl}`] : []),
    ...(params.duplicateWarning ? ["", params.duplicateWarning] : []),
    "",
    "No post was published.",
    "",
    "Set confirm=true to publish.",
  ];
  return lines.join("\n");
}

/**
 * Publishes a post to the connected Threads account (`POST /v1.0/me/threads` -> `POST /v1.0/me/threads_publish`).
 *
 * Official capabilities supported:
 * - TEXT posts (with optional `link_attachment`)
 * - IMAGE posts (with optional `alt_text`)
 * - VIDEO posts (with optional `alt_text` and container status verification)
 * - CAROUSEL posts (2 to 20 IMAGE/VIDEO items)
 * - `topic_tag`, `reply_control`, `reply_to_id`, `quote_post_id`
 *
 * Safety:
 * - Requires `confirm: true` to execute; `confirm: false` returns a formatted preview without calling Meta.
 * - Checks persistent content-hash duplicate detection and in-memory rate guard.
 */
export async function publishThreadsPost(
  params: PublishThreadsPostParams,
  toolName = "threads_publish"
): Promise<{
  result: ThreadsPublishResult;
  formattedPreview?: string;
}> {
  const storage = params.storageProvider ?? defaultMediaStorageProvider;
  const text = (params.text ?? "").trim();

  if (text.length > THREADS_MAX_TEXT_LENGTH) {
    throw new NexsaiMcpError({
      category: "Validation error",
      message: `Threads post text length (${text.length}) exceeds the official Meta Threads API limit of ${THREADS_MAX_TEXT_LENGTH} characters.`,
    });
  }

  // Infer or validate media_type
  const mediaType: ThreadsPublishMediaType =
    params.media_type ??
    (params.carousel_items && params.carousel_items.length > 0
      ? "CAROUSEL"
      : params.video_url
      ? "VIDEO"
      : params.image_url
      ? "IMAGE"
      : "TEXT");

  let validatedImageUrl: string | undefined;
  let validatedVideoUrl: string | undefined;
  let validatedLinkAttachment: string | undefined;
  let validatedTopicTag: string | undefined;

  if (params.topic_tag) {
    validatedTopicTag = validateThreadsTopicTag(params.topic_tag);
  }

  if (params.link_attachment) {
    if (mediaType !== "TEXT") {
      throw new NexsaiMcpError({
        category: "Validation error",
        message:
          "Official Threads API supports `link_attachment` parameter only on TEXT posts. For IMAGE/VIDEO/CAROUSEL posts, include the URL directly in `text`.",
      });
    }
    const trimmedLink = params.link_attachment.trim();
    if (!trimmedLink.startsWith("https://")) {
      throw new NexsaiMcpError({
        category: "Validation error",
        message: "link_attachment must be a valid HTTPS URL (https://...).",
      });
    }
    validatedLinkAttachment = trimmedLink;
  }

  if (mediaType === "TEXT" && !text && !params.quote_post_id) {
    throw new NexsaiMcpError({
      category: "Validation error",
      message: "A TEXT Threads post requires non-empty `text` (up to 500 characters).",
    });
  }

  if (mediaType === "IMAGE") {
    if (!params.image_url) {
      throw new NexsaiMcpError({
        category: "Validation error",
        message: "media_type='IMAGE' requires a valid HTTPS `image_url`.",
      });
    }
    validatedImageUrl = await storage.resolvePublicHttpsUrl(params.image_url);
  }

  if (mediaType === "VIDEO") {
    if (!params.video_url) {
      throw new NexsaiMcpError({
        category: "Validation error",
        message: "media_type='VIDEO' requires a valid HTTPS `video_url`.",
      });
    }
    validatedVideoUrl = await storage.resolvePublicHttpsUrl(params.video_url);
  }

  if (mediaType === "CAROUSEL") {
    const items = params.carousel_items ?? [];
    if (
      items.length < THREADS_MIN_CAROUSEL_ITEMS ||
      items.length > THREADS_MAX_CAROUSEL_ITEMS
    ) {
      throw new NexsaiMcpError({
        category: "Validation error",
        message: `Threads CAROUSEL requires between ${THREADS_MIN_CAROUSEL_ITEMS} and ${THREADS_MAX_CAROUSEL_ITEMS} items in carousel_items (got ${items.length}).`,
      });
    }
    for (const item of items) {
      if (item.media_type === "IMAGE") {
        if (!item.image_url) {
          throw new NexsaiMcpError({
            category: "Validation error",
            message: "Each IMAGE carousel item requires an HTTPS image_url.",
          });
        }
        await storage.resolvePublicHttpsUrl(item.image_url);
      } else if (item.media_type === "VIDEO") {
        if (!item.video_url) {
          throw new NexsaiMcpError({
            category: "Validation error",
            message: "Each VIDEO carousel item requires an HTTPS video_url.",
          });
        }
        await storage.resolvePublicHttpsUrl(item.video_url);
      }
    }
  }

  const primaryMediaUrl =
    validatedImageUrl ??
    validatedVideoUrl ??
    params.carousel_items?.[0]?.image_url ??
    params.carousel_items?.[0]?.video_url ??
    validatedLinkAttachment ??
    "threads_text";

  const candidateHash = computeContentHash(text, `threads:${primaryMediaUrl}`);
  const dbState = await loadDatabaseState().catch(() => null);
  const historicalDuplicate = dbState?.media.find(
    (m) =>
      m.platform === "threads" &&
      (m.content_hash === candidateHash ||
        (text.length > 15 &&
          m.caption.trim().toLowerCase() === text.toLowerCase()))
  );

  const duplicateWarningText = historicalDuplicate
    ? [
        "Possible duplicate Threads post detected.",
        `Existing post: ${historicalDuplicate.platform_media_id} (${historicalDuplicate.permalink}) published at ${historicalDuplicate.published_at}`,
        "Do you want to continue?",
      ].join("\n")
    : undefined;

  const confirm = params.confirm === true;

  if (!confirm) {
    const previewText = formatThreadsPublishPreviewText({
      mediaType,
      text,
      imageUrl: validatedImageUrl,
      videoUrl: validatedVideoUrl,
      carouselCount: params.carousel_items?.length,
      linkAttachment: validatedLinkAttachment,
      topicTag: validatedTopicTag,
      replyControl: params.reply_control,
      duplicateWarning: duplicateWarningText,
    });

    logMcpOperation({
      level: "info",
      tool: toolName,
      operation: "publishThreadsPost:preview",
      success: true,
      message:
        "Returned Threads publishing preview (confirm=false). No post published.",
    });

    return {
      result: {
        published: false,
        confirm_required: true,
        preview: {
          platform: "threads",
          media_type: mediaType,
          ...(text ? { text } : {}),
          text_length: text.length,
          ...(validatedImageUrl ? { image_url: validatedImageUrl } : {}),
          ...(validatedVideoUrl ? { video_url: validatedVideoUrl } : {}),
          ...(params.carousel_items
            ? { carousel_items: params.carousel_items }
            : {}),
          ...(validatedLinkAttachment
            ? { link_attachment: validatedLinkAttachment }
            : {}),
          ...(validatedTopicTag ? { topic_tag: validatedTopicTag } : {}),
          ...(params.alt_text ? { alt_text: params.alt_text } : {}),
          ...(params.reply_control
            ? { reply_control: params.reply_control }
            : {}),
          ...(params.reply_to_id ? { reply_to_id: params.reply_to_id } : {}),
          ...(params.quote_post_id
            ? { quote_post_id: params.quote_post_id }
            : {}),
          ...(historicalDuplicate
            ? {
                possible_duplicate: {
                  media_id: historicalDuplicate.platform_media_id,
                  permalink: historicalDuplicate.permalink,
                  published_at: historicalDuplicate.published_at,
                },
              }
            : {}),
        },
        message: previewText,
      },
      formattedPreview: previewText,
    };
  }

  if (historicalDuplicate && !params.force_duplicate) {
    throw new NexsaiMcpError({
      category: "DUPLICATE_CONTENT",
      message: `${duplicateWarningText} Pass force_duplicate=true along with confirm=true if you intentionally want to re-publish this Threads post.`,
    });
  }

  checkPublishSafetyGuard(`threads:${primaryMediaUrl}`, text || mediaType);

  let creationId: string;

  try {
    if (mediaType === "CAROUSEL" && params.carousel_items) {
      const childIds: string[] = [];
      for (const item of params.carousel_items) {
        const childData = await threadsGraphRequest<{ id?: string }>({
          path: "/me/threads",
          method: "POST",
          formBody: {
            media_type: item.media_type,
            is_carousel_item: true,
            ...(item.image_url ? { image_url: item.image_url } : {}),
            ...(item.video_url ? { video_url: item.video_url } : {}),
            ...(item.alt_text ? { alt_text: item.alt_text } : {}),
          },
          operationName: "publishThreadsPost:createCarouselItem",
          toolName,
        });
        if (!childData.id) {
          throw new NexsaiMcpError({
            category: "Threads API error",
            message: "Threads did not return a child container ID for carousel item.",
          });
        }
        childIds.push(childData.id);
      }

      const parentData = await threadsGraphRequest<{ id?: string }>({
        path: "/me/threads",
        method: "POST",
        formBody: {
          media_type: "CAROUSEL",
          children: childIds.join(","),
          ...(text ? { text } : {}),
          ...(validatedTopicTag ? { topic_tag: validatedTopicTag } : {}),
          ...(params.reply_control ? { reply_control: params.reply_control } : {}),
          ...(params.reply_to_id ? { reply_to_id: params.reply_to_id } : {}),
          ...(params.quote_post_id ? { quote_post_id: params.quote_post_id } : {}),
        },
        operationName: "publishThreadsPost:createCarouselContainer",
        toolName,
      });

      if (!parentData.id) {
        throw new NexsaiMcpError({
          category: "Threads API error",
          message: "Threads did not return a creation container ID for CAROUSEL.",
        });
      }
      creationId = parentData.id;
    } else {
      const containerData = await threadsGraphRequest<{ id?: string }>({
        path: "/me/threads",
        method: "POST",
        formBody: {
          media_type: mediaType,
          ...(text ? { text } : {}),
          ...(validatedImageUrl ? { image_url: validatedImageUrl } : {}),
          ...(validatedVideoUrl ? { video_url: validatedVideoUrl } : {}),
          ...(validatedLinkAttachment
            ? { link_attachment: validatedLinkAttachment }
            : {}),
          ...(validatedTopicTag ? { topic_tag: validatedTopicTag } : {}),
          ...(params.alt_text ? { alt_text: params.alt_text } : {}),
          ...(params.reply_control ? { reply_control: params.reply_control } : {}),
          ...(params.reply_to_id ? { reply_to_id: params.reply_to_id } : {}),
          ...(params.quote_post_id ? { quote_post_id: params.quote_post_id } : {}),
        },
        operationName: "publishThreadsPost:createContainer",
        toolName,
      });

      if (!containerData.id) {
        throw new NexsaiMcpError({
          category: "Threads API error",
          message:
            "Threads did not return a creation container ID when creating the post container.",
        });
      }
      creationId = containerData.id;
    }

    // Check container status if VIDEO or CAROUSEL (or verify not ERROR)
    const statusCheck = await threadsGraphRequest<{
      id?: string;
      status?: "IN_PROGRESS" | "FINISHED" | "PUBLISHED" | "ERROR" | "EXPIRED";
      error_message?: string;
    }>({
      path: `/${encodeURIComponent(creationId)}`,
      method: "GET",
      queryParams: {
        fields: "id,status,error_message",
      },
      operationName: "publishThreadsPost:checkContainerStatus",
      toolName,
    }).catch(() => null);

    if (statusCheck?.status === "ERROR" || statusCheck?.status === "EXPIRED") {
      throw new NexsaiMcpError({
        category: "Threads API error",
        message: `Threads media container failed with status ${statusCheck.status}${
          statusCheck.error_message ? `: ${statusCheck.error_message}` : ""
        }.`,
      });
    }

    // STEP 2 — PUBLISH CONTAINER
    const publishData = await threadsGraphRequest<{ id?: string }>({
      path: "/me/threads_publish",
      method: "POST",
      formBody: {
        creation_id: creationId,
      },
      operationName: "publishThreadsPost:publishContainer",
      toolName,
    });

    if (!publishData.id) {
      throw new NexsaiMcpError({
        category: "Threads API error",
        message:
          "Threads did not return a published media ID after calling threads_publish.",
      });
    }

    const publishedMediaId = publishData.id;
    recordSuccessfulPublish(
      `threads:${primaryMediaUrl}`,
      text || mediaType,
      publishedMediaId
    );

    // STEP 3 — Fetch permalink if available
    let permalink: string | undefined;
    let timestamp: string | undefined;
    try {
      const details = await threadsGraphRequest<{
        permalink?: string;
        timestamp?: string;
      }>({
        path: `/${encodeURIComponent(publishedMediaId)}`,
        method: "GET",
        queryParams: {
          fields: "id,permalink,timestamp",
        },
        operationName: "publishThreadsPost:fetchPermalink",
        toolName,
      });
      permalink = details.permalink;
      timestamp = details.timestamp;
    } catch {
      // Non-fatal
    }

    const readMediaType =
      mediaType === "TEXT"
        ? "TEXT_POST"
        : mediaType === "CAROUSEL"
        ? "CAROUSEL_ALBUM"
        : mediaType;

    await upsertMediaRecord({
      platform: "threads",
      platform_media_id: publishedMediaId,
      media_type: readMediaType,
      media_product_type: "THREADS",
      caption: text,
      permalink:
        permalink ?? `https://www.threads.com/@nexsaicommunity/post/${publishedMediaId}`,
      media_url: validatedImageUrl ?? validatedVideoUrl,
      topic_tag: validatedTopicTag,
      link_attachment_url: validatedLinkAttachment,
      published_at: timestamp ?? new Date().toISOString(),
    }).catch(() => null);

    if (params.plan_id) {
      await updateContentPlanStatus(
        params.plan_id,
        "PUBLISHED",
        {
          published_threads_id: publishedMediaId,
          published_threads_permalink: permalink,
        },
        {
          timestamp: new Date().toISOString(),
          platform: "threads",
          success: true,
          media_id: publishedMediaId,
          creation_id: creationId,
          permalink,
        }
      ).catch(() => null);
    }

    return {
      result: {
        success: true,
        published: true,
        platform: "threads",
        message: "Threads post published successfully.",
        media_id: publishedMediaId,
        creation_id: creationId,
        media_type: mediaType,
        ...(permalink ? { permalink } : {}),
        ...(timestamp ? { timestamp } : {}),
      },
    };
  } catch (err) {
    if (params.plan_id) {
      await updateContentPlanStatus(
        params.plan_id,
        "APPROVED",
        {},
        {
          timestamp: new Date().toISOString(),
          platform: "threads",
          success: false,
          error_message: err instanceof Error ? err.message : String(err),
          retryable: true,
        }
      ).catch(() => null);
    }
    throw err;
  }
}

