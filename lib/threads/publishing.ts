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

/**
 * Timing configuration for the Threads container → publish pipeline.
 * Exported (mutable) so automated tests can shorten delays.
 */
export const threadsPublishTiming = {
  /** Delay between container status polls. */
  pollIntervalMs: 1500,
  /** Max time to wait for TEXT / IMAGE containers to reach FINISHED. */
  maxPollMsDefault: 30_000,
  /** Max time to wait for VIDEO / CAROUSEL containers to reach FINISHED. */
  maxPollMsVideo: 120_000,
  /**
   * Back-off delays used ONLY when threads_publish returns Meta code 24 / subcode 4279009
   * ("The requested resource does not exist") for a container we have already confirmed FINISHED.
   * Meta documents this as a propagation delay; before every retry we re-check the container
   * status so an already-PUBLISHED container is never published twice.
   */
  publishRetryDelaysMs: [2000, 4000, 8000],
};

/** Meta subcode returned when a container ID cannot (yet) be found by the publishing node. */
export const THREADS_CONTAINER_NOT_FOUND_SUBCODE = 4279009;

type ThreadsContainerStatus =
  | "IN_PROGRESS"
  | "FINISHED"
  | "PUBLISHED"
  | "ERROR"
  | "EXPIRED";

interface ContainerStatusResponse {
  id?: string;
  status?: ThreadsContainerStatus;
  error_message?: string;
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

function isContainerNotFoundError(err: unknown): err is NexsaiMcpError {
  return (
    err instanceof NexsaiMcpError &&
    (err.metaErrorSubcode === THREADS_CONTAINER_NOT_FOUND_SUBCODE ||
      err.metaErrorCode === 24)
  );
}

/**
 * Resolves the numeric Threads user ID of the account that owns THREADS_ACCESS_TOKEN.
 *
 * - Uses `GET /me?fields=id` so the container-creation and publish calls always target the
 *   same, token-owning account.
 * - If THREADS_USER_ID is configured and does NOT match the token's account, fails with a clear
 *   error instead of letting Meta return a misleading "resource does not exist".
 * - Falls back to `me` only if Meta returns no ID.
 */
export async function resolveThreadsPublishingUserId(
  toolName = "threads_publish"
): Promise<string> {
  const configured = process.env.THREADS_USER_ID?.trim();
  const configuredId = configured && configured !== "me" ? configured : undefined;

  const me = await threadsGraphRequest<{ id?: string; username?: string }>({
    path: "/me",
    method: "GET",
    queryParams: { fields: "id,username" },
    operationName: "publishThreadsPost:resolveUserId",
    toolName,
  });

  if (me.id) {
    if (configuredId && configuredId !== me.id) {
      throw new NexsaiMcpError({
        category: "Validation error",
        message: `THREADS_USER_ID (${configuredId}) does not match the Threads account that owns THREADS_ACCESS_TOKEN (${me.id}${
          me.username ? `, @${me.username}` : ""
        }). Remove THREADS_USER_ID or set it to ${me.id}.`,
      });
    }
    return me.id;
  }

  return configuredId ?? "me";
}

/**
 * Polls `GET /{creation_id}?fields=id,status,error_message` until the container is FINISHED.
 *
 * - FINISHED → returns.
 * - ERROR / EXPIRED → throws with Meta's error_message (never retried; a failed container must be recreated).
 * - PUBLISHED → throws (container was already used; publishing again would duplicate).
 * - IN_PROGRESS, or not-yet-visible (code 24 / subcode 4279009) → keeps polling until the time budget is spent.
 * - Any other error is surfaced with the stage and creation_id — never swallowed.
 */
async function waitForThreadsContainerReady(
  creationId: string,
  mediaType: ThreadsPublishMediaType | "IMAGE" | "VIDEO",
  label: string,
  toolName: string
): Promise<{ status: ThreadsContainerStatus; polls: number; waited_ms: number }> {
  const maxMs =
    mediaType === "VIDEO" || mediaType === "CAROUSEL"
      ? threadsPublishTiming.maxPollMsVideo
      : threadsPublishTiming.maxPollMsDefault;
  const start = Date.now();
  let polls = 0;
  let lastStatus: string = "UNKNOWN";

  while (true) {
    polls += 1;
    let st: ContainerStatusResponse | undefined;
    try {
      st = await threadsGraphRequest<ContainerStatusResponse>({
        path: `/${encodeURIComponent(creationId)}`,
        method: "GET",
        queryParams: { fields: "id,status,error_message" },
        operationName: `publishThreadsPost:pollContainerStatus:${label}`,
        toolName,
      });
      lastStatus = st.status ?? "UNKNOWN";
    } catch (err) {
      if (isContainerNotFoundError(err)) {
        lastStatus = "NOT_YET_VISIBLE";
      } else {
        throw new NexsaiMcpError({
          category: "Threads API error",
          message: `Threads container status check failed (stage=pollContainerStatus, ${label} creation_id=${creationId}): ${
            err instanceof Error ? err.message : String(err)
          }`,
          statusCode: err instanceof NexsaiMcpError ? err.statusCode : undefined,
          metaErrorCode: err instanceof NexsaiMcpError ? err.metaErrorCode : undefined,
          metaErrorSubcode:
            err instanceof NexsaiMcpError ? err.metaErrorSubcode : undefined,
          details: err instanceof NexsaiMcpError ? err.details : undefined,
        });
      }
    }

    const waited = Date.now() - start;

    if (st?.status === "FINISHED") {
      logMcpOperation({
        level: "info",
        tool: toolName,
        operation: `publishThreadsPost:containerReady:${label}`,
        success: true,
        message: `Container ${creationId} FINISHED after ${polls} poll(s) / ${waited}ms.`,
      });
      return { status: "FINISHED", polls, waited_ms: waited };
    }

    if (st?.status === "ERROR" || st?.status === "EXPIRED") {
      throw new NexsaiMcpError({
        category: "Threads API error",
        message: `Threads media container failed with status ${st.status} (stage=pollContainerStatus, ${label} creation_id=${creationId})${
          st.error_message ? `: ${st.error_message}` : ""
        }. The container cannot be published; fix the input (e.g. media URL) and create a new post. No retry was attempted.`,
      });
    }

    if (st?.status === "PUBLISHED") {
      throw new NexsaiMcpError({
        category: "Duplicate publish protection",
        message: `Threads container ${creationId} is already PUBLISHED. It will not be published again.`,
      });
    }

    if (waited + threadsPublishTiming.pollIntervalMs > maxMs) {
      throw new NexsaiMcpError({
        category: "Threads API error",
        message: `Threads container ${creationId} (${label}) did not reach FINISHED within ${Math.round(
          maxMs / 1000
        )}s (last status: ${lastStatus}, polls: ${polls}). Nothing was published. Try again later.`,
      });
    }

    await sleep(threadsPublishTiming.pollIntervalMs);
  }
}

/**
 * Calls `POST /{user_id}/threads_publish` with the exact creation_id.
 *
 * Retries ONLY on Meta code 24 / subcode 4279009 (container not found on the publishing node —
 * a documented propagation delay). Before each retry the container status is re-read:
 * if it is already PUBLISHED we stop (never double-publish); if ERROR/EXPIRED we fail.
 * All other errors fail immediately.
 */
async function publishThreadsContainerWithRetry(
  userId: string,
  creationId: string,
  toolName: string
): Promise<{ id: string; attempts: number }> {
  const delays = threadsPublishTiming.publishRetryDelaysMs;
  let attempt = 0;

  while (true) {
    attempt += 1;
    try {
      const publishData = await threadsGraphRequest<{ id?: string }>({
        path: `/${encodeURIComponent(userId)}/threads_publish`,
        method: "POST",
        formBody: { creation_id: creationId },
        operationName: `publishThreadsPost:publishContainer:attempt${attempt}`,
        toolName,
      });
      if (!publishData.id) {
        throw new NexsaiMcpError({
          category: "Threads API error",
          message: `Threads returned no published media ID from threads_publish (creation_id=${creationId}).`,
        });
      }
      return { id: publishData.id, attempts: attempt };
    } catch (err) {
      if (!isContainerNotFoundError(err) || attempt > delays.length) {
        const base = err instanceof Error ? err.message : String(err);
        throw new NexsaiMcpError({
          category:
            err instanceof NexsaiMcpError ? err.category : "Threads API error",
          message: `Threads publish failed (stage=publishContainer, user_id=${userId}, creation_id=${creationId}, attempts=${attempt}): ${base}${
            isContainerNotFoundError(err)
              ? " — Meta still reports the container as not found after all retries. The container was confirmed FINISHED before publishing, so this is a Meta-side propagation issue. Nothing was published; try again in a minute."
              : ""
          }`,
          statusCode: err instanceof NexsaiMcpError ? err.statusCode : undefined,
          metaErrorCode: err instanceof NexsaiMcpError ? err.metaErrorCode : undefined,
          metaErrorSubcode:
            err instanceof NexsaiMcpError ? err.metaErrorSubcode : undefined,
          details: err instanceof NexsaiMcpError ? err.details : undefined,
        });
      }

      logMcpOperation({
        level: "warn",
        tool: toolName,
        operation: "publishThreadsPost:publishContainer:retry",
        success: false,
        message: `threads_publish returned code 24/subcode ${THREADS_CONTAINER_NOT_FOUND_SUBCODE} for creation_id=${creationId} (attempt ${attempt}). Re-checking container and retrying in ${delays[attempt - 1]}ms.`,
      });

      await sleep(delays[attempt - 1]);

      // Safety: re-read the container before retrying so we never publish twice.
      const recheck = await threadsGraphRequest<ContainerStatusResponse>({
        path: `/${encodeURIComponent(creationId)}`,
        method: "GET",
        queryParams: { fields: "id,status,error_message" },
        operationName: "publishThreadsPost:recheckBeforeRetry",
        toolName,
      }).catch((recheckErr: unknown) => {
        if (isContainerNotFoundError(recheckErr)) return undefined;
        throw recheckErr;
      });

      if (recheck?.status === "PUBLISHED") {
        throw new NexsaiMcpError({
          category: "Threads API error",
          message: `Container ${creationId} now reports PUBLISHED even though threads_publish returned an error. The post was probably published; check the Threads profile before trying again. No further publish attempts were made.`,
        });
      }
      if (recheck?.status === "ERROR" || recheck?.status === "EXPIRED") {
        throw new NexsaiMcpError({
          category: "Threads API error",
          message: `Container ${creationId} moved to ${recheck.status} while publishing${
            recheck.error_message ? `: ${recheck.error_message}` : ""
          }. Nothing was published.`,
        });
      }
    }
  }
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

  let creationId: string | undefined;
  let userId = "me";

  try {
    // STEP 0 — Resolve the numeric user ID that owns the token, so create + publish target the same account.
    userId = await resolveThreadsPublishingUserId(toolName);
    const createPath = `/${encodeURIComponent(userId)}/threads`;

    if (mediaType === "CAROUSEL" && params.carousel_items) {
      const childIds: string[] = [];
      for (const item of params.carousel_items) {
        const childData = await threadsGraphRequest<{ id?: string }>({
          path: createPath,
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

      // Every child container must be FINISHED before the parent carousel can be created/published.
      for (const [index, childId] of childIds.entries()) {
        await waitForThreadsContainerReady(
          childId,
          params.carousel_items[index]?.media_type ?? "IMAGE",
          `carouselChild${index + 1}`,
          toolName
        );
      }

      const parentData = await threadsGraphRequest<{ id?: string }>({
        path: createPath,
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
        path: createPath,
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

    // STEP 1b — Poll the container until FINISHED (fails fast on ERROR/EXPIRED, never swallowed).
    const readiness = await waitForThreadsContainerReady(
      creationId,
      mediaType,
      "container",
      toolName
    );

    // STEP 2 — PUBLISH CONTAINER (exact creation_id, same user_id; bounded retry only for code 24/4279009)
    const published = await publishThreadsContainerWithRetry(
      userId,
      creationId,
      toolName
    );

    const publishedMediaId = published.id;
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
        diagnostics: {
          user_id: userId,
          container_status_before_publish: readiness.status,
          container_polls: readiness.polls,
          container_wait_ms: readiness.waited_ms,
          publish_attempts: published.attempts,
        },
        ...(permalink ? { permalink } : {}),
        ...(timestamp ? { timestamp } : {}),
      },
    };
  } catch (err) {
    logMcpOperation({
      level: "error",
      tool: toolName,
      operation: "publishThreadsPost:failed",
      success: false,
      errorType: err instanceof NexsaiMcpError ? err.category : "Threads API error",
      message: `Threads publish pipeline failed (user_id=${userId}, creation_id=${
        creationId ?? "not created"
      }, media_type=${mediaType}): ${err instanceof Error ? err.message : String(err)}`,
    });
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

