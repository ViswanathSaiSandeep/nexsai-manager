import { threadsGraphRequest } from "./client";
import type {
  ThreadsMediaItem,
  ThreadsMediaListResponse,
  ThreadsPaging,
} from "./types";
import { upsertMediaRecord } from "../database/store";

export const THREADS_MEDIA_FIELDS = [
  "id",
  "media_product_type",
  "media_type",
  "media_url",
  "permalink",
  "owner",
  "username",
  "text",
  "timestamp",
  "shortcode",
  "thumbnail_url",
  "is_quote_post",
  "topic_tag",
  "link_attachment_url",
].join(",");

export const THREADS_MEDIA_DETAILS_FIELDS = `${THREADS_MEDIA_FIELDS},children`;

export interface ListThreadsMediaParams {
  limit?: number;
  after?: string;
  before?: string;
  since?: number;
  until?: number;
}

/**
 * Retrieves published Threads posts for the authenticated user (`GET /v1.0/me/threads`).
 * Strips raw `paging.next` and `paging.previous` URLs because Meta embeds `access_token=...` in them.
 */
export async function listThreadsMedia(
  params: ListThreadsMediaParams = {},
  toolName = "threads_media"
): Promise<ThreadsMediaListResponse> {
  const limit = Math.min(Math.max(params.limit ?? 10, 1), 50);

  const raw = await threadsGraphRequest<{
    data?: ThreadsMediaItem[];
    paging?: ThreadsPaging;
  }>({
    path: "/me/threads",
    method: "GET",
    queryParams: {
      fields: THREADS_MEDIA_FIELDS,
      limit,
      ...(params.after ? { after: params.after } : {}),
      ...(params.before ? { before: params.before } : {}),
      ...(params.since ? { since: params.since } : {}),
      ...(params.until ? { until: params.until } : {}),
    },
    operationName: "listThreadsMedia",
    toolName,
  });

  const items = raw.data ?? [];

  // Sync retrieved items into persistent NEXSAI database
  for (const item of items) {
    await upsertMediaRecord({
      platform: "threads",
      platform_media_id: item.id,
      media_type: item.media_type,
      media_product_type: item.media_product_type ?? "THREADS",
      caption: item.text ?? "",
      permalink: item.permalink,
      media_url: item.media_url,
      topic_tag: item.topic_tag,
      link_attachment_url: item.link_attachment_url,
      is_quote_post: item.is_quote_post,
      published_at: item.timestamp,
    }).catch(() => null);
  }

  return {
    data: items,
    paging: {
      ...(raw.paging?.cursors ? { cursors: raw.paging.cursors } : {}),
      has_next_page: Boolean(raw.paging?.next || raw.paging?.cursors?.after),
      has_previous_page: Boolean(
        raw.paging?.previous || raw.paging?.cursors?.before
      ),
    },
  };
}

/**
 * Retrieves full metadata and carousel children for a specific Threads post (`GET /v1.0/{media_id}`).
 */
export async function getThreadsMediaDetails(
  mediaId: string,
  toolName = "threads_media_details"
): Promise<ThreadsMediaItem> {
  const item = await threadsGraphRequest<ThreadsMediaItem>({
    path: `/${encodeURIComponent(mediaId)}`,
    method: "GET",
    queryParams: {
      fields: THREADS_MEDIA_DETAILS_FIELDS,
    },
    operationName: "getThreadsMediaDetails",
    toolName,
  });

  await upsertMediaRecord({
    platform: "threads",
    platform_media_id: item.id,
    media_type: item.media_type,
    media_product_type: item.media_product_type ?? "THREADS",
    caption: item.text ?? "",
    permalink: item.permalink,
    media_url: item.media_url,
    topic_tag: item.topic_tag,
    link_attachment_url: item.link_attachment_url,
    is_quote_post: item.is_quote_post,
    published_at: item.timestamp,
  }).catch(() => null);

  return item;
}

