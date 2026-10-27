/**
 * TypeScript definitions for the Instagram Graph API (Instagram Login / graph.instagram.com).
 *
 * Modular social provider architecture:
 * Social Platform
 * ├── Instagram (implemented in lib/instagram/*)
 * └── Threads   (future provider, intentionally not implemented yet)
 */

export interface InstagramProfile {
  id: string;
  user_id?: string;
  username: string;
  name?: string;
  account_type?: "BUSINESS" | "MEDIA_CREATOR" | "PERSONAL" | string;
  profile_picture_url?: string;
  biography?: string;
  website?: string;
  followers_count?: number;
  follows_count?: number;
  media_count?: number;
}

export interface InstagramPagingCursors {
  before?: string;
  after?: string;
}

export interface InstagramPaging {
  cursors?: InstagramPagingCursors;
  next?: string;
  previous?: string;
}

export interface InstagramMediaChild {
  id: string;
  media_type?: "IMAGE" | "VIDEO" | string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
}

export interface InstagramMediaItem {
  id: string;
  caption?: string;
  media_type: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM" | string;
  media_product_type?: "FEED" | "REELS" | "STORY" | "AD" | string;
  media_url?: string;
  thumbnail_url?: string;
  permalink: string;
  shortcode?: string;
  timestamp: string;
  username?: string;
  like_count?: number;
  comments_count?: number;
  is_shared_to_feed?: boolean;
  children?: {
    data: InstagramMediaChild[];
  };
}

export interface InstagramMediaListResponse {
  data: InstagramMediaItem[];
  paging?: {
    cursors?: InstagramPagingCursors;
    has_next_page: boolean;
    has_previous_page: boolean;
  };
}

export interface InstagramPublishPreviewResult {
  published: false;
  confirm_required: true;
  preview: {
    image_url: string;
    caption: string;
    caption_length: number;
    hashtag_count: number;
  };
  message: string;
}

export interface InstagramPublishSuccessResult {
  success: true;
  published: true;
  message: string;
  media_id: string;
  creation_id: string;
  permalink?: string;
  timestamp?: string;
}

export type InstagramPublishResult =
  | InstagramPublishPreviewResult
  | InstagramPublishSuccessResult;

export interface InstagramCommentAuthor {
  id?: string;
  username?: string;
}

export interface InstagramCommentReplyItem {
  id: string;
  text: string;
  timestamp: string;
  username?: string;
  from?: InstagramCommentAuthor;
  like_count?: number;
  hidden?: boolean;
}

export interface InstagramCommentItem {
  id: string;
  text: string;
  timestamp: string;
  username?: string;
  from?: InstagramCommentAuthor;
  like_count?: number;
  hidden?: boolean;
  parent_id?: string;
  replies?: {
    data: InstagramCommentReplyItem[];
  };
}

export interface InstagramCommentsListResponse {
  media_id: string;
  count: number;
  comments: InstagramCommentItem[];
  paging?: {
    cursors?: InstagramPagingCursors;
    has_next_page: boolean;
    has_previous_page: boolean;
  };
}

export interface InstagramCommentReplyPreviewResult {
  posted: false;
  confirm_required: true;
  preview: {
    comment_id: string;
    message: string;
    message_length: number;
  };
  message: string;
}

export interface InstagramCommentReplySuccessResult {
  success: true;
  posted: true;
  comment_id: string;
  reply_id: string;
  message: string;
}

export type InstagramCommentReplyResult =
  | InstagramCommentReplyPreviewResult
  | InstagramCommentReplySuccessResult;

export interface InstagramCommentModerationPreviewResult {
  executed: false;
  confirm_required: true;
  action: "hide" | "unhide" | "delete";
  comment_id: string;
  message: string;
}

export interface InstagramCommentModerationSuccessResult {
  success: true;
  executed: true;
  action: "hide" | "unhide" | "delete";
  comment_id: string;
  message: string;
}

export type InstagramCommentModerationResult =
  | InstagramCommentModerationPreviewResult
  | InstagramCommentModerationSuccessResult;

export interface InstagramInsightValuePoint {
  value: number | Record<string, number>;
  end_time?: string;
}

export interface InstagramRawInsightMetric {
  id: string;
  name: string;
  period: string;
  title?: string;
  description?: string;
  values?: InstagramInsightValuePoint[];
  total_value?: {
    value: number;
  };
}

export interface InstagramMediaInsightsResult {
  media_id: string;
  media_type?: string;
  media_product_type?: string;
  permalink?: string;
  timestamp?: string;
  metrics: Record<string, number | null>;
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

export interface InstagramAccountInsightsResult {
  period: "day" | "week" | "days_28";
  metric_type: "total_value" | "time_series";
  since?: string;
  until?: string;
  summary_metrics: Record<string, number | null>;
  metrics: Array<{
    name: string;
    period: string;
    total_value?: number;
    values?: InstagramInsightValuePoint[];
    title?: string;
    description?: string;
  }>;
  unavailable_metrics: Array<{
    metric: string;
    reason: string;
  }>;
}

