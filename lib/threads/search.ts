import { threadsGraphRequest } from "./client";
import { listThreadsMedia, THREADS_MEDIA_FIELDS } from "./media";
import type { ThreadsMediaItem, ThreadsPaging } from "./types";
import { executeNexsaiResearch } from "../research/search";
import { classifyInstagramPost } from "../analytics/metrics";
import { NexsaiMcpError } from "../utils/errors";

export interface ThreadsSearchParams {
  query: string;
  search_type?: "TOP" | "RECENT";
  search_mode?: "KEYWORD" | "TAG";
  limit?: number;
  after?: string;
}

/**
 * Searches Threads for relevant AI, developer tools, and tech discussions (`GET /v1.0/keyword_search`).
 *
 * Official Capability Classification: **Conditional**
 * - Requires the `threads_keyword_search` permission enabled on the Meta App and User Token (capped at 2,200 queries / 24h).
 * - If the current token does not yet have `threads_keyword_search` granted (HTTP 403 / Meta error code 10),
 *   this function honestly reports the exact `Conditional` permission status and falls back to searching the
 *   authenticated account's own published Threads history + the NEXSAI multi-source research engine.
 */
export async function searchThreadsDiscussions(
  params: ThreadsSearchParams,
  toolName = "threads_search"
) {
  const query = params.query.trim();
  const limit = Math.min(Math.max(params.limit ?? 10, 1), 25);
  const searchType = params.search_type ?? "TOP";
  const searchMode = params.search_mode ?? "KEYWORD";

  try {
    const raw = await threadsGraphRequest<{
      data?: ThreadsMediaItem[];
      paging?: ThreadsPaging;
    }>({
      path: "/keyword_search",
      method: "GET",
      queryParams: {
        q: query,
        search_type: searchType,
        search_mode: searchMode,
        fields: THREADS_MEDIA_FIELDS,
        limit,
        ...(params.after ? { after: params.after } : {}),
      },
      operationName: "searchThreadsDiscussions",
      toolName,
    });

    const items = (raw.data ?? []).map((item) => {
      const classification = classifyInstagramPost({
        media_id: item.id,
        caption: item.text,
        media_type: item.media_type,
      });
      return {
        ...item,
        nexsai_classification: {
          content_pillar: classification.content_pillar,
          topic: classification.topic,
          hook_type: classification.hook_type,
        },
      };
    });

    return {
      query,
      search_type: searchType,
      search_mode: searchMode,
      capability_status: "Supported" as const,
      keyword_search_authorized: true,
      count: items.length,
      results: items,
      paging: {
        ...(raw.paging?.cursors ? { cursors: raw.paging.cursors } : {}),
        has_next_page: Boolean(raw.paging?.next || raw.paging?.cursors?.after),
      },
    };
  } catch (err) {
    if (
      err instanceof NexsaiMcpError &&
      (err.category === "Permission error" || err.metaErrorCode === 10)
    ) {
      // Honest conditional fallback: search own Threads posts + NEXSAI tech research
      const [ownThreads, techResearch] = await Promise.all([
        listThreadsMedia({ limit: 25 }, toolName).catch(() => ({ data: [] })),
        executeNexsaiResearch({ topic: query, limit: 5 }, toolName).catch(
          () => ({ opportunities: [] })
        ),
      ]);

      const queryWords = query
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 1);

      const matchingOwnThreads = ownThreads.data.filter((post) => {
        const textLower = `${post.text ?? ""} ${post.topic_tag ?? ""}`.toLowerCase();
        return queryWords.some((w) => textLower.includes(w));
      });

      return {
        query,
        search_type: searchType,
        search_mode: searchMode,
        capability_status: "Conditional" as const,
        keyword_search_authorized: false,
        permission_blocker: {
          missing_permission: "threads_keyword_search",
          meta_error_code: err.metaErrorCode ?? 10,
          explanation:
            "Public `GET /v1.0/keyword_search` returned HTTP 403 (code 10: Application does not have permission for this action). To unlock global Threads keyword search, enable `threads_keyword_search` in Meta App Dashboard -> Use cases -> Access the Threads API -> Permissions, and regenerate THREADS_ACCESS_TOKEN.",
          documentation_url:
            "https://developers.facebook.com/docs/threads/keyword-search",
        },
        own_matching_threads: {
          count: matchingOwnThreads.length,
          posts: matchingOwnThreads.slice(0, limit),
        },
        related_nexsai_research_opportunities: techResearch.opportunities,
      };
    }
    throw err;
  }
}

/**
 * Retrieves Threads posts and replies where the authenticated user is mentioned (`GET /v1.0/me/mentions`).
 *
 * Official Capability Classification: **Conditional**
 * - Requires the `threads_manage_mentions` permission enabled in Meta App Dashboard.
 * - If not granted on the current token (HTTP 403 / code 10), returns a clear, non-deceptive Conditional status object.
 */
export async function getThreadsMentions(
  params: {
    limit?: number;
    after?: string;
    before?: string;
  } = {},
  toolName = "threads_mentions"
) {
  const limit = Math.min(Math.max(params.limit ?? 10, 1), 50);

  try {
    const raw = await threadsGraphRequest<{
      data?: ThreadsMediaItem[];
      paging?: ThreadsPaging;
    }>({
      path: "/me/mentions",
      method: "GET",
      queryParams: {
        fields: THREADS_MEDIA_FIELDS,
        limit,
        ...(params.after ? { after: params.after } : {}),
        ...(params.before ? { before: params.before } : {}),
      },
      operationName: "getThreadsMentions",
      toolName,
    });

    const items = raw.data ?? [];
    return {
      capability_status: "Supported" as const,
      mentions_authorized: true,
      count: items.length,
      mentions: items,
      paging: {
        ...(raw.paging?.cursors ? { cursors: raw.paging.cursors } : {}),
        has_next_page: Boolean(raw.paging?.next || raw.paging?.cursors?.after),
        has_previous_page: Boolean(
          raw.paging?.previous || raw.paging?.cursors?.before
        ),
      },
    };
  } catch (err) {
    if (
      err instanceof NexsaiMcpError &&
      (err.category === "Permission error" || err.metaErrorCode === 10)
    ) {
      return {
        capability_status: "Conditional" as const,
        mentions_authorized: false,
        count: 0,
        mentions: [],
        permission_blocker: {
          missing_permission: "threads_manage_mentions",
          meta_error_code: err.metaErrorCode ?? 10,
          explanation:
            "`GET /v1.0/me/mentions` returned HTTP 403 (code 10: Application does not have permission for this action). Enable `threads_manage_mentions` in Meta App Dashboard -> Use cases -> Access the Threads API -> Permissions, and regenerate THREADS_ACCESS_TOKEN.",
          documentation_url:
            "https://developers.facebook.com/docs/threads/mentions",
        },
      };
    }
    throw err;
  }
}

