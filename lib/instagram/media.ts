import { instagramGraphRequest } from "./client";
import type {
  InstagramMediaItem,
  InstagramMediaListResponse,
  InstagramPaging,
} from "./types";

const MEDIA_LIST_FIELDS = [
  "id",
  "caption",
  "media_type",
  "media_product_type",
  "media_url",
  "thumbnail_url",
  "permalink",
  "timestamp",
  "username",
  "like_count",
  "comments_count",
].join(",");

const MEDIA_DETAIL_FIELDS = [
  "id",
  "caption",
  "media_type",
  "media_product_type",
  "media_url",
  "thumbnail_url",
  "permalink",
  "shortcode",
  "timestamp",
  "username",
  "like_count",
  "comments_count",
  "children{id,media_type,media_url,thumbnail_url,permalink,timestamp}",
].join(",");

export interface ListInstagramMediaParams {
  limit?: number;
  after?: string;
  before?: string;
}

interface RawMediaListResponse {
  data?: InstagramMediaItem[];
  paging?: InstagramPaging;
}

/**
 * Retrieves recent media posts from the connected Instagram account.
 * Note: Strips raw `paging.next` and `paging.previous` URLs because Meta embeds
 * `access_token=...` inside those URLs. Exposes clean `cursors` and boolean flags instead.
 */
export async function listInstagramMedia(
  params: ListInstagramMediaParams = {},
  toolName = "instagram_media"
): Promise<InstagramMediaListResponse> {
  const limit = params.limit ?? 10;

  const raw = await instagramGraphRequest<RawMediaListResponse>({
    path: "/me/media",
    method: "GET",
    queryParams: {
      fields: MEDIA_LIST_FIELDS,
      limit,
      after: params.after,
      before: params.before,
    },
    operationName: "listInstagramMedia",
    toolName,
  });

  return {
    data: raw.data ?? [],
    paging: raw.paging
      ? {
          cursors: raw.paging.cursors,
          has_next_page: Boolean(raw.paging.next),
          has_previous_page: Boolean(raw.paging.previous),
        }
      : undefined,
  };
}

/**
 * Retrieves detailed metadata for a single Instagram media object by ID,
 * including carousel child items if applicable.
 */
export async function getInstagramMediaDetails(
  mediaId: string,
  toolName = "instagram_media_details"
): Promise<InstagramMediaItem> {
  return await instagramGraphRequest<InstagramMediaItem>({
    path: `/${encodeURIComponent(mediaId)}`,
    method: "GET",
    queryParams: {
      fields: MEDIA_DETAIL_FIELDS,
    },
    operationName: "getInstagramMediaDetails",
    toolName,
  });
}

