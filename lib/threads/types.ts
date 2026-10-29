/**
 * TypeScript definitions for the Official Meta Threads Graph API v1.0 (`https://graph.threads.net/v1.0`).
 */

export type CapabilityStatus = "Supported" | "Conditional" | "Unavailable";

export interface ThreadsCapabilityEntry {
  capability: string;
  status: CapabilityStatus;
  endpoint: string;
  required_permission: string;
  authorized_on_current_token: boolean;
  notes: string;
  documentation_url: string;
}

export interface ThreadsProfile {
  id: string;
  username: string;
  name?: string;
  threads_profile_picture_url?: string;
  threads_biography?: string;
  is_verified?: boolean;
  followers_count?: number;
}

export interface ThreadsPublishingQuota {
  quota_usage: number;
  config: {
    quota_total: number;
    quota_duration: number;
  };
  reply_quota_usage?: number;
  reply_config?: {
    quota_total: number;
    quota_duration: number;
  };
}

export interface ThreadsAccountStatusResult {
  connected: boolean;
  token_configured: boolean;
  api_version: string;
  api_base_url: string;
  profile?: ThreadsProfile;
  publishing_limit?: ThreadsPublishingQuota;
  capabilities: ThreadsCapabilityEntry[];
  error?: string;
}

export interface ThreadsPagingCursors {
  before?: string;
  after?: string;
}

export interface ThreadsPaging {
  cursors?: ThreadsPagingCursors;
  next?: string;
  previous?: string;
}

export interface ThreadsMediaChild {
  id: string;
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
}

export interface ThreadsMediaItem {
  id: string;
  media_product_type?: "THREADS" | string;
  media_type:
    | "TEXT_POST"
    | "IMAGE"
    | "VIDEO"
    | "CAROUSEL_ALBUM"
    | "AUDIO"
    | "REPOST_FACADE"
    | string;
  media_url?: string;
  permalink: string;
  owner?: { id: string };
  username?: string;
  text?: string;
  timestamp: string;
  shortcode?: string;
  thumbnail_url?: string;
  is_quote_post?: boolean;
  topic_tag?: string;
  link_attachment_url?: string;
  children?: {
    data: ThreadsMediaChild[];
  };
}

export interface ThreadsMediaListResponse {
  data: ThreadsMediaItem[];
  paging?: {
    cursors?: ThreadsPagingCursors;
    has_next_page: boolean;
    has_previous_page: boolean;
  };
}

export type ThreadsPublishMediaType = "TEXT" | "IMAGE" | "VIDEO" | "CAROUSEL";

export type ThreadsReplyControl =
  | "everyone"
  | "accounts_you_follow"
  | "mentioned_only"
  | "parent_post_author_only"
  | "followers_only";

export interface ThreadsCarouselItemInput {
  media_type: "IMAGE" | "VIDEO";
  image_url?: string;
  video_url?: string;
  alt_text?: string;
}

export interface ThreadsPublishPreviewResult {
  published: false;
  confirm_required: true;
  preview: {
    platform: "threads";
    media_type: ThreadsPublishMediaType;
    text?: string;
    text_length: number;
    image_url?: string;
    video_url?: string;
    carousel_items?: ThreadsCarouselItemInput[];
    link_attachment?: string;
    topic_tag?: string;
    alt_text?: string;
    reply_control?: ThreadsReplyControl;
    reply_to_id?: string;
    quote_post_id?: string;
    possible_duplicate?: {
      media_id: string;
      permalink: string;
      published_at: string;
    };
  };
  message: string;
}

export interface ThreadsPublishSuccessResult {
  success: true;
  published: true;
  platform: "threads";
  message: string;
  media_id: string;
  creation_id: string;
  media_type: ThreadsPublishMediaType;
  permalink?: string;
  timestamp?: string;
  /** Non-secret pipeline diagnostics (user ID, container status, poll/attempt counts). */
  diagnostics?: {
    user_id: string;
    container_status_before_publish: string;
    container_polls: number;
    container_wait_ms: number;
    publish_attempts: number;
  };
}

export type ThreadsPublishResult =
  | ThreadsPublishPreviewResult
  | ThreadsPublishSuccessResult;

export interface ThreadsReplyItem {
  id: string;
  text?: string;
  username?: string;
  timestamp: string;
  media_type?: string;
  permalink?: string;
  hide_status?: "NOT_HUSHED" | "UNHUSHED" | "HIDDEN" | "COVERED" | "BLOCKED" | "RESTRICTED" | string;
  has_replies?: boolean;
  root_post?: { id: string };
  replied_to?: { id: string };
  is_reply?: boolean;
  is_reply_owned_by_me?: boolean;
}

export interface ThreadsRepliesListResponse {
  media_id: string;
  mode: "replies" | "conversation" | "pending_replies";
  count: number;
  replies: ThreadsReplyItem[];
  paging?: {
    cursors?: ThreadsPagingCursors;
    has_next_page: boolean;
    has_previous_page: boolean;
  };
  conditional_note?: string;
}

export interface ThreadsInsightValuePoint {
  value: number | Record<string, number>;
  end_time?: string;
}

export interface ThreadsRawInsightMetric {
  id?: string;
  name: string;
  period: string;
  title?: string;
  description?: string;
  values?: ThreadsInsightValuePoint[];
  total_value?: {
    value: number;
  };
}

export interface ThreadsMediaInsightsResult {
  media_id: string;
  media_type?: string;
  permalink?: string;
  timestamp?: string;
  text_preview?: string;
  metrics: {
    views: number | null;
    likes: number | null;
    replies: number | null;
    reposts: number | null;
    quotes: number | null;
    shares: number | null;
    total_interactions: number | null;
  };
  metric_details: Array<{
    name: string;
    value: number | null;
    period: string;
    title?: string;
    description?: string;
  }>;
  unavailable_metrics: Array<{
    metric: string;
    reason: string;
  }>;
}

export interface ThreadsAccountInsightsResult {
  since?: number;
  until?: number;
  summary_metrics: {
    views: number | null;
    likes: number | null;
    replies: number | null;
    reposts: number | null;
    quotes: number | null;
    followers_count: number | null;
  };
  metrics: Array<{
    name: string;
    period: string;
    total_value?: number;
    values?: ThreadsInsightValuePoint[];
    title?: string;
    description?: string;
  }>;
  unavailable_metrics: Array<{
    metric: string;
    reason: string;
  }>;
}

