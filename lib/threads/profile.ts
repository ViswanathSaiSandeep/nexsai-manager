import {
  getThreadsAccessToken,
  hasThreadsAccessToken,
  THREADS_API_VERSION,
  THREADS_GRAPH_BASE_URL,
  threadsGraphRequest,
} from "./client";
import type {
  ThreadsAccountStatusResult,
  ThreadsCapabilityEntry,
  ThreadsProfile,
  ThreadsPublishingQuota,
} from "./types";
import { upsertAccountRecord } from "../database/store";

export const THREADS_PROFILE_FIELDS =
  "id,username,name,threads_profile_picture_url,threads_biography,is_verified";

/**
 * Retrieves the authenticated user's Threads profile (`GET /v1.0/me`)
 * and enriches `followers_count` from `threads_insights` if authorized.
 */
export async function getThreadsProfile(
  toolName = "threads_profile"
): Promise<ThreadsProfile> {
  const rawProfile = await threadsGraphRequest<ThreadsProfile>({
    path: "/me",
    method: "GET",
    queryParams: {
      fields: THREADS_PROFILE_FIELDS,
    },
    operationName: "getThreadsProfile",
    toolName,
  });

  // Attempt to retrieve followers_count from /me/threads_insights (non-fatal if insights permission is absent)
  let followersCount: number | undefined;
  try {
    const followersRes = await threadsGraphRequest<{
      data?: Array<{
        name: string;
        total_value?: { value?: number };
        values?: Array<{ value?: number }>;
      }>;
    }>({
      path: "/me/threads_insights",
      method: "GET",
      queryParams: {
        metric: "followers_count",
      },
      operationName: "getThreadsProfile:followersCount",
      toolName,
    });
    const fMetric = followersRes.data?.find((m) => m.name === "followers_count");
    if (typeof fMetric?.total_value?.value === "number") {
      followersCount = fMetric.total_value.value;
    } else if (typeof fMetric?.values?.[0]?.value === "number") {
      followersCount = fMetric.values[0].value;
    }
  } catch {
    // Non-fatal: followers_count is optional if threads_manage_insights is missing
  }

  const profile: ThreadsProfile = {
    id: rawProfile.id,
    username: rawProfile.username,
    ...(rawProfile.name ? { name: rawProfile.name } : {}),
    ...(rawProfile.threads_profile_picture_url
      ? { threads_profile_picture_url: rawProfile.threads_profile_picture_url }
      : {}),
    ...(rawProfile.threads_biography
      ? { threads_biography: rawProfile.threads_biography }
      : {}),
    ...(rawProfile.is_verified !== undefined
      ? { is_verified: rawProfile.is_verified }
      : {}),
    ...(followersCount !== undefined ? { followers_count: followersCount } : {}),
  };

  await upsertAccountRecord({
    platform: "threads",
    platform_user_id: profile.id,
    username: profile.username,
    name: profile.name,
    account_type: profile.is_verified ? "VERIFIED_THREADS" : "THREADS_PUBLIC",
    is_verified: profile.is_verified,
    followers_count: profile.followers_count,
    biography: profile.threads_biography,
    profile_picture_url: profile.threads_profile_picture_url,
  }).catch(() => null);

  return profile;
}

/**
 * Retrieves the authenticated Threads user's current 24-hour publishing and reply quota usage.
 * Endpoint: `GET /v1.0/me/threads_publishing_limit?fields=quota_usage,config,reply_quota_usage,reply_config`
 */
export async function getThreadsPublishingLimit(
  toolName = "threads_account_status"
): Promise<ThreadsPublishingQuota | null> {
  try {
    const res = await threadsGraphRequest<{ data?: ThreadsPublishingQuota[] }>({
      path: "/me/threads_publishing_limit",
      method: "GET",
      queryParams: {
        fields: "quota_usage,config,reply_quota_usage,reply_config",
      },
      operationName: "getThreadsPublishingLimit",
      toolName,
    });
    return res.data?.[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Inspects Threads connection status, publishing quota, and verifies which official Meta Threads API v1.0
 * capabilities are Supported, Conditional, or Unavailable on the currently configured token.
 */
export async function getThreadsAccountStatus(
  toolName = "threads_account_status"
): Promise<ThreadsAccountStatusResult> {
  const tokenConfigured = hasThreadsAccessToken();
  if (!tokenConfigured) {
    return {
      connected: false,
      token_configured: false,
      api_version: THREADS_API_VERSION,
      api_base_url: THREADS_GRAPH_BASE_URL,
      capabilities: buildCapabilityMatrix({
        basicOk: false,
        publishQuotaOk: false,
        insightsOk: false,
        repliesOk: false,
        keywordSearchOk: false,
        mentionsOk: false,
      }),
      error:
        "THREADS_ACCESS_TOKEN is not configured in environment variables. Set THREADS_ACCESS_TOKEN in .env.local or Vercel.",
    };
  }

  // Ensure token is non-empty
  getThreadsAccessToken();

  let profile: ThreadsProfile | undefined;
  let basicOk = false;
  let topError: string | undefined;

  try {
    profile = await getThreadsProfile(toolName);
    basicOk = true;
  } catch (err) {
    topError = err instanceof Error ? err.message : String(err);
  }

  if (!basicOk) {
    return {
      connected: false,
      token_configured: true,
      api_version: THREADS_API_VERSION,
      api_base_url: THREADS_GRAPH_BASE_URL,
      capabilities: buildCapabilityMatrix({
        basicOk: false,
        publishQuotaOk: false,
        insightsOk: false,
        repliesOk: false,
        keywordSearchOk: false,
        mentionsOk: false,
      }),
      error: topError ?? "Failed to authenticate with Threads Graph API.",
    };
  }

  const [publishingLimit, keywordProbe, mentionsProbe] = await Promise.all([
    getThreadsPublishingLimit(toolName),
    threadsGraphRequest<{ data?: unknown[] }>({
      path: "/keyword_search",
      method: "GET",
      queryParams: { q: "NEXSAI", limit: 1 },
      operationName: "probeKeywordSearchScope",
      toolName,
    })
      .then(() => true)
      .catch(() => false),
    threadsGraphRequest<{ data?: unknown[] }>({
      path: "/me/mentions",
      method: "GET",
      queryParams: { fields: "id,text", limit: 1 },
      operationName: "probeMentionsScope",
      toolName,
    })
      .then(() => true)
      .catch(() => false),
  ]);

  const publishQuotaOk = publishingLimit !== null;
  const insightsOk = typeof profile?.followers_count === "number";
  const repliesOk = Boolean(
    publishingLimit?.reply_config || publishingLimit !== null
  );

  return {
    connected: true,
    token_configured: true,
    api_version: THREADS_API_VERSION,
    api_base_url: THREADS_GRAPH_BASE_URL,
    profile,
    ...(publishingLimit ? { publishing_limit: publishingLimit } : {}),
    capabilities: buildCapabilityMatrix({
      basicOk,
      publishQuotaOk,
      insightsOk,
      repliesOk,
      keywordSearchOk: keywordProbe,
      mentionsOk: mentionsProbe,
    }),
  };
}

function buildCapabilityMatrix(flags: {
  basicOk: boolean;
  publishQuotaOk: boolean;
  insightsOk: boolean;
  repliesOk: boolean;
  keywordSearchOk: boolean;
  mentionsOk: boolean;
}): ThreadsCapabilityEntry[] {
  return [
    {
      capability: "Profile & Published Posts Retrieval",
      status: "Supported",
      endpoint: "GET /v1.0/me & GET /v1.0/me/threads",
      required_permission: "threads_basic",
      authorized_on_current_token: flags.basicOk,
      notes:
        "Retrieves authenticated user ID, username, bio, verification badge, and published TEXT/IMAGE/VIDEO/CAROUSEL posts.",
      documentation_url: "https://developers.facebook.com/docs/threads/threads-profiles",
    },
    {
      capability: "Publishing Posts (TEXT, IMAGE, VIDEO, CAROUSEL, Topic Tags, Link Attachments)",
      status: "Supported",
      endpoint: "POST /v1.0/me/threads & POST /v1.0/me/threads_publish",
      required_permission: "threads_content_publish",
      authorized_on_current_token: flags.publishQuotaOk,
      notes:
        "2-step container creation and publishing flow (up to 500 characters, 250 posts / 24h rolling quota). Gated by confirm=true.",
      documentation_url: "https://developers.facebook.com/docs/threads/posts",
    },
    {
      capability: "Publishing Quota & Rate-Limit Inspection",
      status: "Supported",
      endpoint: "GET /v1.0/me/threads_publishing_limit",
      required_permission: "threads_basic, threads_content_publish",
      authorized_on_current_token: flags.publishQuotaOk,
      notes:
        "Returns 24-hour rolling post quota (250/day) and reply quota (1,000/day).",
      documentation_url: "https://developers.facebook.com/docs/threads/troubleshooting#publishing-does-not-work",
    },
    {
      capability: "Post & Account Insights (Views, Likes, Replies, Reposts, Quotes, Shares, Followers)",
      status: "Supported",
      endpoint: "GET /v1.0/{media-id}/insights & GET /v1.0/me/threads_insights",
      required_permission: "threads_manage_insights",
      authorized_on_current_token: flags.insightsOk,
      notes:
        "Retrieves lifetime post metrics and account-level views, engagement totals, and follower count.",
      documentation_url: "https://developers.facebook.com/docs/threads/insights",
    },
    {
      capability: "Replies, Conversations & Reply Visibility Moderation",
      status: "Supported",
      endpoint:
        "GET /v1.0/{media-id}/replies, GET /v1.0/{media-id}/conversation, POST /v1.0/{reply-id}/manage_reply",
      required_permission: "threads_read_replies, threads_manage_replies",
      authorized_on_current_token: flags.repliesOk,
      notes:
        "Fetches top-level replies, flat conversation threads, posts replies, and hides/unhides replies (with confirm=true).",
      documentation_url: "https://developers.facebook.com/docs/threads/reply-management",
    },
    {
      capability: "Pending Reply Approval Queue",
      status: "Conditional",
      endpoint:
        "GET /v1.0/{media-id}/pending_replies & POST /v1.0/{reply-id}/manage_pending_reply",
      required_permission: "threads_read_replies, threads_manage_replies",
      authorized_on_current_token: flags.repliesOk,
      notes:
        "Conditional: Only available on media posts that were explicitly published with reply approvals enabled (enable_reply_approvals=true).",
      documentation_url: "https://developers.facebook.com/docs/threads/reply-moderation",
    },
    {
      capability: "Keyword & Topic Tag Search",
      status: "Conditional",
      endpoint: "GET /v1.0/keyword_search",
      required_permission: "threads_keyword_search",
      authorized_on_current_token: flags.keywordSearchOk,
      notes: flags.keywordSearchOk
        ? "Authorized on current token (2,200 queries / 24h limit)."
        : "Conditional: Requires adding the 'threads_keyword_search' permission in Meta App Dashboard (Use Cases -> Threads API) and regenerating the token. Falls back to searching own Threads + NEXSAI research feed when unauthorized.",
      documentation_url: "https://developers.facebook.com/docs/threads/keyword-search",
    },
    {
      capability: "Mentions Retrieval",
      status: "Conditional",
      endpoint: "GET /v1.0/me/mentions",
      required_permission: "threads_manage_mentions",
      authorized_on_current_token: flags.mentionsOk,
      notes: flags.mentionsOk
        ? "Authorized on current token."
        : "Conditional: Requires adding the 'threads_manage_mentions' permission in Meta App Dashboard and regenerating the token.",
      documentation_url: "https://developers.facebook.com/docs/threads/mentions",
    },
    {
      capability: "Post Deletion via API",
      status: "Conditional",
      endpoint: "DELETE /v1.0/{threads-media-id}",
      required_permission: "threads_delete",
      authorized_on_current_token: false,
      notes:
        "Requires explicit 'threads_delete' scope (capped at 100 deletes/day); omitted from automated tools to prevent irreversible accidental post deletion.",
      documentation_url: "https://developers.facebook.com/docs/threads/posts#delete-posts",
    },
    {
      capability: "Private Messages / Threads DMs",
      status: "Unavailable",
      endpoint: "N/A",
      required_permission: "N/A",
      authorized_on_current_token: false,
      notes:
        "Unavailable: The official Meta Threads API v1.0 does not expose private direct messaging endpoints.",
      documentation_url: "https://developers.facebook.com/docs/threads",
    },
  ];
}

