import { z } from "zod";

/**
 * Shared Zod validation schemas for NEXSAI Manager MCP tools.
 */

export const instagramIdSchema = z
  .string()
  .trim()
  .regex(/^\d{5,30}$/, {
    message:
      "Must be a valid numeric Instagram Graph ID (5 to 30 digits, e.g. '18075909602467119').",
  });

export const paginationCursorSchema = z
  .string()
  .trim()
  .min(1, "Pagination cursor cannot be empty.")
  .max(512, "Pagination cursor is too long.");

export const instagramMediaListInputSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe(
      "Number of media posts to retrieve (1 to 50, defaults to 10)."
    ),
  after: paginationCursorSchema
    .optional()
    .describe(
      "Pagination cursor (`paging.cursors.after`) to fetch the next page of media posts."
    ),
  before: paginationCursorSchema
    .optional()
    .describe(
      "Pagination cursor (`paging.cursors.before`) to fetch the previous page of media posts."
    ),
});

export const instagramMediaDetailsInputSchema = z.object({
  media_id: instagramIdSchema.describe(
    "Numeric Instagram Media ID to inspect (e.g. '18075909602467119')."
  ),
});

export const instagramPublishInputSchema = z.object({
  image_url: z
    .string()
    .trim()
    .url("image_url must be a valid URL.")
    .refine((val) => val.startsWith("https://"), {
      message: "image_url must use the HTTPS protocol (https://...).",
    })
    .describe(
      "Publicly accessible HTTPS URL of the JPEG/PNG image to publish."
    ),
  caption: z
    .string()
    .min(1, "Caption cannot be empty.")
    .max(2200, "Instagram captions cannot exceed 2,200 characters.")
    .describe(
      "Instagram post caption (max 2,200 characters and max 30 hashtags)."
    ),
  confirm: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Safety confirmation flag. Set to false (default) to generate a safe preview without publishing. Set to true ONLY after the user explicitly confirms they want to publish the post live."
    ),
  force_duplicate: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Optional override if a historical duplicate post was detected and the user explicitly confirmed they want to re-publish anyway."
    ),
  plan_id: z
    .string()
    .trim()
    .optional()
    .describe(
      "Optional content plan ID from `nexsai_create_content` to mark as PUBLISHED once live."
    ),
});

export const instagramCommentsInputSchema = z.object({
  media_id: instagramIdSchema.describe(
    "Numeric Instagram Media ID whose comments should be retrieved."
  ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Maximum number of comments to return (1 to 50, default 25)."),
  after: paginationCursorSchema
    .optional()
    .describe("Pagination cursor (`after`) for the next page of comments."),
  before: paginationCursorSchema
    .optional()
    .describe("Pagination cursor (`before`) for the previous page of comments."),
});

export const instagramCommentReplyInputSchema = z.object({
  comment_id: instagramIdSchema.describe(
    "Numeric Instagram Comment ID to reply to."
  ),
  message: z
    .string()
    .trim()
    .min(1, "Reply message cannot be empty.")
    .max(2200, "Reply message cannot exceed 2,200 characters.")
    .describe("The text content of the reply to post (max 2,200 characters)."),
  confirm: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Safety confirmation flag. When false (default), returns a preview without posting. Set to true ONLY when confirmed by the user."
    ),
});

export const instagramHideCommentInputSchema = z.object({
  comment_id: instagramIdSchema.describe(
    "Numeric Instagram Comment ID to hide or unhide."
  ),
  hide: z
    .boolean()
    .optional()
    .default(true)
    .describe("Set to true (default) to hide the comment, or false to unhide it."),
  confirm: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Safety confirmation flag. Must be true to execute the moderation change; false returns a preview."
    ),
});

export const instagramDeleteCommentInputSchema = z.object({
  comment_id: instagramIdSchema.describe(
    "Numeric Instagram Comment ID to permanently delete."
  ),
  confirm: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Safety confirmation flag for destructive deletion. Must be explicitly set to true to permanently delete the comment; false returns a preview."
    ),
});

export const instagramMediaInsightsInputSchema = z.object({
  media_id: instagramIdSchema.describe(
    "Numeric Instagram Media ID to retrieve performance insights for."
  ),
  metrics: z
    .array(z.string().trim().min(1))
    .optional()
    .describe(
      "Optional list of metrics to query. Defaults to all supported v24.0 metrics: ['views', 'reach', 'saved', 'shares', 'likes', 'comments', 'total_interactions']. Note: Meta deprecated 'impressions' in v22.0+ in favor of 'views'."
    ),
});

export const instagramAccountInsightsInputSchema = z.object({
  period: z
    .enum(["day", "week", "days_28"])
    .optional()
    .default("day")
    .describe(
      "Aggregation period for account insights ('day', 'week', or 'days_28'). Defaults to 'day'."
    ),
  metric_type: z
    .enum(["total_value", "time_series"])
    .optional()
    .default("total_value")
    .describe(
      "Use 'total_value' (default) for aggregated metrics (views, reach, accounts_engaged, total_interactions, likes, comments, saves, shares, profile_links_taps), or 'time_series' for daily reach points."
    ),
  metrics: z
    .array(z.string().trim().min(1))
    .optional()
    .describe(
      "Optional specific account metrics to request. Omit to request the full default set for the selected metric_type."
    ),
  since: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Optional Unix timestamp (seconds) for start of insights window."),
  until: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Optional Unix timestamp (seconds) for end of insights window."),
});

export const instagramAnalyzeContentInputSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(25)
    .optional()
    .default(10)
    .describe(
      "Number of recent Instagram posts to fetch and analyze with insights (1 to 25, defaults to 10)."
    ),
});

export const contentPillarEnumSchema = z.enum([
  "ai_tools_productivity",
  "tech_explained",
  "ai_news_breakthroughs",
  "developer_workflows",
  "gadgets_hardware",
]);

export const nexsaiResearchInputSchema = z.object({
  topic: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .default("AI tools LLM models developer tech")
    .describe(
      "Topic or keywords to research across tech & AI sources (e.g., 'Claude MCP', 'Android 16 AI', 'open source LLM')."
    ),
  time_range: z
    .enum(["24h", "7d", "30d"])
    .optional()
    .default("7d")
    .describe("Freshness window for discovered stories ('24h', '7d', or '30d')."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(15)
    .optional()
    .default(6)
    .describe("Maximum number of scored opportunities to return (1 to 15)."),
});

export const nexsaiFindOpportunitiesInputSchema = z.object({
  focus_topic: z
    .string()
    .trim()
    .optional()
    .describe(
      "Optional topic focus to combine with historical performance and content pillar gaps."
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .default(5)
    .describe("Number of ranked content opportunities to return (1 to 10, default 5)."),
});

export const nexsaiCompetitorAnalysisInputSchema = z.object({
  focus_category: z
    .string()
    .trim()
    .optional()
    .describe("Optional competitor category filter (e.g., 'AI News', 'Hardware')."),
  add_or_update_competitor: z
    .object({
      handle: z.string().trim().min(2),
      name: z.string().trim().min(2),
      category: z.string().trim().min(2),
      typical_formats: z.array(z.string().trim()),
      core_topics: z.array(z.string().trim()),
      strengths: z.array(z.string().trim()),
      differentiation_gap_for_nexsai: z.string().trim().min(5),
    })
    .optional()
    .describe(
      "Optional competitor profile to add or update in NEXSAI persistent memory."
    ),
});

export const nexsaiStrategyInputSchema = z.object({
  goal: z
    .enum(["reach", "saves", "engagement", "followers", "balanced"])
    .optional()
    .default("balanced")
    .describe(
      "Primary strategic objective for this week ('reach', 'saves', 'engagement', 'followers', or 'balanced')."
    ),
});

export const nexsaiPlanWeekInputSchema = z.object({
  focus_theme: z
    .string()
    .trim()
    .optional()
    .describe("Optional weekly theme or focus topic."),
  save_as_drafts: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      "When true (default), saves the 7 planned days as DRAFT items in the NEXSAI content calendar."
    ),
});

export const nexsaiCreateContentInputSchema = z.object({
  plan_id: z
    .string()
    .trim()
    .optional()
    .describe("Optional existing content plan ID to update."),
  platform: z
    .enum(["instagram", "threads", "both"])
    .optional()
    .default("instagram")
    .describe(
      "Target platform for this content plan ('instagram', 'threads', or 'both')."
    ),
  campaign: z
    .string()
    .trim()
    .optional()
    .describe("Optional campaign name to group related posts across platforms."),
  topic: z
    .string()
    .trim()
    .min(2)
    .max(300)
    .describe("Topic or title of the post."),
  content_pillar: contentPillarEnumSchema
    .optional()
    .default("ai_tools_productivity")
    .describe("Target NEXSAI content pillar."),
  format: z
    .enum(["IMAGE", "CAROUSEL_ALBUM", "REELS", "TEXT", "VIDEO", "CAROUSEL"])
    .optional()
    .default("CAROUSEL_ALBUM")
    .describe(
      "Post format ('CAROUSEL_ALBUM', 'IMAGE', 'REELS', 'TEXT', 'VIDEO', or 'CAROUSEL')."
    ),
  goal: z
    .enum(["reach", "saves", "engagement", "followers", "education"])
    .optional()
    .default("saves")
    .describe("Primary goal for this content piece."),
  hook: z
    .string()
    .trim()
    .optional()
    .describe("Scroll-stopping opening hook line."),
  headline: z
    .string()
    .trim()
    .optional()
    .describe("Visual slide 1 headline."),
  caption: z
    .string()
    .max(2200)
    .optional()
    .describe("Full draft Instagram caption (max 2,200 characters)."),
  threads_text: z
    .string()
    .max(500)
    .optional()
    .describe("Threads-native post text (max 500 characters)."),
  threads_topic_tag: z
    .string()
    .trim()
    .max(50)
    .optional()
    .describe("Optional Threads topic tag (1-50 chars, no periods or ampersands)."),
  cta: z.string().trim().optional().describe("Call-to-action line."),
  hashtags: z
    .array(z.string().trim())
    .optional()
    .describe("List of hashtags (recommended 5–8 tags)."),
  visual_brief: z
    .string()
    .trim()
    .optional()
    .describe("Visual concept & design direction."),
  carousel_slides: z
    .array(z.string().trim())
    .optional()
    .describe("Slide-by-slide outline for carousel posts."),
  image_url: z
    .string()
    .trim()
    .url()
    .optional()
    .describe("Optional publicly accessible HTTPS image URL when ready."),
  scheduled_time: z
    .string()
    .trim()
    .optional()
    .describe("Optional ISO-8601 target publish time."),
  status: z
    .enum(["DRAFT", "REVIEW", "APPROVED", "SCHEDULED", "PUBLISHED", "ANALYZING", "ARCHIVED"])
    .optional()
    .default("DRAFT")
    .describe(
      "Approval workflow state: DRAFT -> REVIEW -> APPROVED -> SCHEDULED -> PUBLISHED -> ANALYZING."
    ),
});

export const nexsaiAnalyzePostInputSchema = z.object({
  media_id: instagramIdSchema.describe(
    "Numeric Instagram Media ID to benchmark against account, format, and pillar averages."
  ),
});

export const nexsaiCreateExperimentInputSchema = z.object({
  platform: z
    .enum(["instagram", "threads"])
    .optional()
    .default("instagram")
    .describe("Social platform for this experiment ('instagram' or 'threads')."),
  name: z
    .string()
    .trim()
    .min(3)
    .max(150)
    .describe("Experiment name (e.g., 'Numbered Hook vs Curiosity Question Hook')."),
  variable: z
    .enum([
      "hook_style",
      "format",
      "pillar",
      "cta_variation",
      "posting_time",
      "caption_length",
      "topic_angle",
    ])
    .describe("Single variable being tested."),
  hypothesis: z
    .string()
    .trim()
    .min(5)
    .describe("Clear testable hypothesis."),
  variant_a: z.string().trim().min(2).describe("Description of Variant A (baseline)."),
  variant_b: z.string().trim().min(2).describe("Description of Variant B (challenger)."),
  success_metric: z
    .enum(["engagement_rate_pct", "save_rate_pct", "share_rate_pct", "reach", "views"])
    .optional()
    .default("engagement_rate_pct")
    .describe("Primary metric used to evaluate the experiment."),
  variant_a_media_ids: z
    .array(instagramIdSchema)
    .optional()
    .describe("Optional list of Instagram Media IDs assigned to Variant A."),
  variant_b_media_ids: z
    .array(instagramIdSchema)
    .optional()
    .describe("Optional list of Instagram Media IDs assigned to Variant B."),
});

export const nexsaiAnalyzeExperimentInputSchema = z.object({
  experiment_id: z
    .string()
    .trim()
    .optional()
    .describe(
      "Experiment ID to evaluate (omit to evaluate the most recent active experiment)."
    ),
  variant_a_media_ids: z
    .array(instagramIdSchema)
    .optional()
    .describe("Optional override of Media IDs for Variant A."),
  variant_b_media_ids: z
    .array(instagramIdSchema)
    .optional()
    .describe("Optional override of Media IDs for Variant B."),
});

export const nexsaiRecommendInputSchema = z.object({
  goal: z
    .enum(["reach", "saves", "engagement", "followers", "balanced"])
    .optional()
    .default("balanced")
    .describe("Optional strategic goal to weight the recommendation engine."),
});

export const nexsaiBrandConfigInputSchema = z.object({
  action: z
    .enum(["get", "update"])
    .optional()
    .default("get")
    .describe("Use 'get' to read current brand memory or 'update' to modify fields."),
  positioning: z.string().trim().optional(),
  mission: z.string().trim().optional(),
  target_audience: z.array(z.string().trim()).optional(),
  cta_preferences: z.array(z.string().trim()).optional(),
  default_hashtags: z.array(z.string().trim()).optional(),
  signature_series: z.array(z.string().trim()).optional(),
  topics_to_avoid: z.array(z.string().trim()).optional(),
  posts_per_week: z.number().int().min(1).max(21).optional(),
  confirm: z
    .boolean()
    .optional()
    .default(false)
    .describe("Required (confirm=true) when action='update' to persist brand memory changes."),
});

// ============================================================
// V3 — THREADS API & CROSS-PLATFORM ZOD SCHEMAS
// ============================================================

export const threadsIdSchema = z
  .string()
  .trim()
  .regex(/^\d{5,30}$/, {
    message:
      "Must be a valid numeric Threads Graph ID (5 to 30 digits, e.g. '17869695210660667').",
  });

export const threadsMediaListInputSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe("Number of Threads posts to retrieve (1 to 50, defaults to 10)."),
  after: paginationCursorSchema
    .optional()
    .describe("Pagination cursor (`after`) to fetch the next page of Threads posts."),
  before: paginationCursorSchema
    .optional()
    .describe("Pagination cursor (`before`) to fetch the previous page of Threads posts."),
  since: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Optional Unix timestamp (seconds) start filter."),
  until: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Optional Unix timestamp (seconds) end filter."),
});

export const threadsMediaDetailsInputSchema = z.object({
  media_id: threadsIdSchema.describe(
    "Numeric Threads Media ID to inspect (e.g. '17869695210660667')."
  ),
});

export const threadsPublishInputSchema = z.object({
  media_type: z
    .enum(["TEXT", "IMAGE", "VIDEO", "CAROUSEL"])
    .optional()
    .describe(
      "Threads container format: 'TEXT', 'IMAGE', 'VIDEO', or 'CAROUSEL'. Automatically inferred if omitted."
    ),
  text: z
    .string()
    .max(500, "Threads post text cannot exceed 500 characters.")
    .optional()
    .describe(
      "Post text content (up to 500 characters per official Meta Threads API limits)."
    ),
  image_url: z
    .string()
    .trim()
    .url()
    .refine((v) => v.startsWith("https://"), {
      message: "image_url must use HTTPS (https://...).",
    })
    .optional()
    .describe("Publicly accessible HTTPS image URL (required when media_type='IMAGE')."),
  video_url: z
    .string()
    .trim()
    .url()
    .refine((v) => v.startsWith("https://"), {
      message: "video_url must use HTTPS (https://...).",
    })
    .optional()
    .describe("Publicly accessible HTTPS video URL (required when media_type='VIDEO')."),
  carousel_items: z
    .array(
      z.object({
        media_type: z.enum(["IMAGE", "VIDEO"]),
        image_url: z.string().trim().url().optional(),
        video_url: z.string().trim().url().optional(),
        alt_text: z.string().trim().max(1000).optional(),
      })
    )
    .min(2)
    .max(20)
    .optional()
    .describe(
      "2 to 20 IMAGE/VIDEO items when publishing a CAROUSEL Threads post."
    ),
  link_attachment: z
    .string()
    .trim()
    .url()
    .refine((v) => v.startsWith("https://"), {
      message: "link_attachment must use HTTPS (https://...).",
    })
    .optional()
    .describe(
      "Optional HTTPS URL link attachment (officially supported on TEXT posts only)."
    ),
  topic_tag: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .optional()
    .describe(
      "Optional Threads topic tag (1–50 characters, cannot contain periods '.' or ampersands '&')."
    ),
  alt_text: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .describe("Optional accessibility alt text for IMAGE or VIDEO posts."),
  reply_control: z
    .enum([
      "everyone",
      "accounts_you_follow",
      "mentioned_only",
      "parent_post_author_only",
      "followers_only",
    ])
    .optional()
    .describe("Optional reply permission setting for who can reply to this Threads post."),
  reply_to_id: threadsIdSchema
    .optional()
    .describe("Optional Threads post/reply ID if publishing a reply."),
  quote_post_id: threadsIdSchema
    .optional()
    .describe("Optional Threads post ID to quote."),
  confirm: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Safety confirmation flag. Defaults to false (returns a PUBLISH PREVIEW without publishing). Set to true ONLY after explicit human confirmation."
    ),
  force_duplicate: z
    .boolean()
    .optional()
    .default(false)
    .describe("Set to true only if overriding a historical duplicate warning."),
  plan_id: z
    .string()
    .trim()
    .optional()
    .describe("Optional content plan ID from `nexsai_create_content` to update once published."),
});

export const threadsReadRepliesInputSchema = z.object({
  media_id: threadsIdSchema.describe(
    "Numeric Threads Media ID whose replies or conversation thread should be retrieved."
  ),
  reverse: z
    .boolean()
    .optional()
    .describe("Optional sort order flag (`true` for chronological, `false` for reverse)."),
  after: paginationCursorSchema.optional(),
  before: paginationCursorSchema.optional(),
});

export const threadsReplyInputSchema = z.object({
  reply_to_id: threadsIdSchema.describe(
    "Numeric Threads Media ID or Reply ID to reply to."
  ),
  text: z
    .string()
    .trim()
    .min(1, "Reply text cannot be empty.")
    .max(500, "Threads reply text cannot exceed 500 characters.")
    .describe("Text of the reply (max 500 characters)."),
  confirm: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Safety confirmation flag. When false (default), returns a preview without posting. Set to true ONLY when confirmed by the user."
    ),
});

export const threadsManageReplyInputSchema = z.object({
  reply_id: threadsIdSchema.describe(
    "Numeric Threads Reply ID to hide or unhide."
  ),
  hide: z
    .boolean()
    .optional()
    .default(true)
    .describe("Set to true (default) to hide the reply, or false to unhide it."),
  confirm: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Safety confirmation flag. Must be true to execute the moderation change; false returns a preview."
    ),
});

export const threadsPendingRepliesInputSchema = z.object({
  media_id: threadsIdSchema
    .optional()
    .describe(
      "Numeric Threads Media ID to list pending replies on (Conditional: requires reply approvals enabled on that post)."
    ),
  reply_id: threadsIdSchema
    .optional()
    .describe("Optional pending Threads Reply ID to approve or ignore."),
  approve: z
    .boolean()
    .optional()
    .describe("When reply_id is provided, set true to approve or false to ignore."),
  confirm: z
    .boolean()
    .optional()
    .default(false)
    .describe("Required (confirm=true) when approving or ignoring a pending reply."),
  after: paginationCursorSchema.optional(),
  before: paginationCursorSchema.optional(),
});

export const threadsSearchInputSchema = z.object({
  query: z
    .string()
    .trim()
    .min(1)
    .max(150)
    .describe("Keyword or topic tag to search on Threads (e.g. 'Claude MCP', 'AI agents')."),
  search_type: z
    .enum(["TOP", "RECENT"])
    .optional()
    .default("TOP")
    .describe("Sort order for keyword search results ('TOP' or 'RECENT')."),
  search_mode: z
    .enum(["KEYWORD", "TAG"])
    .optional()
    .default("KEYWORD")
    .describe("Search mode ('KEYWORD' for full text or 'TAG' for topic tags)."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(25)
    .optional()
    .default(10)
    .describe("Maximum results to return (1 to 25, default 10)."),
  after: paginationCursorSchema.optional(),
});

export const threadsMentionsInputSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .default(10)
    .describe("Maximum mentions to retrieve (1 to 50, default 10)."),
  after: paginationCursorSchema.optional(),
  before: paginationCursorSchema.optional(),
});

export const threadsMediaInsightsInputSchema = z.object({
  media_id: threadsIdSchema.describe(
    "Numeric Threads Media ID to retrieve performance insights for."
  ),
  metrics: z
    .array(z.string().trim().min(1))
    .optional()
    .describe(
      "Optional list of metrics. Defaults to ['views', 'likes', 'replies', 'reposts', 'quotes', 'shares']."
    ),
});

export const threadsAccountInsightsInputSchema = z.object({
  metrics: z
    .array(z.string().trim().min(1))
    .optional()
    .describe(
      "Optional list of account metrics. Defaults to ['views', 'likes', 'replies', 'reposts', 'quotes', 'followers_count']."
    ),
  since: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Optional Unix timestamp (seconds, >= 1712991600) for start of insights window."),
  until: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Optional Unix timestamp (seconds) for end of insights window."),
});

export const nexsaiThreadsAnalyzeInputSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(25)
    .optional()
    .default(10)
    .describe("Number of recent Threads posts to analyze with insights (1 to 25, default 10)."),
});

export const nexsaiThreadsRecommendInputSchema = z.object({
  focus_topic: z
    .string()
    .trim()
    .optional()
    .describe("Optional AI/tech topic focus for Threads-native recommendations."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(10)
    .optional()
    .default(5)
    .describe("Number of ranked Threads content opportunities to return (1 to 10, default 5)."),
});

export const nexsaiCrossPlatformPublishInputSchema = z.object({
  platforms: z
    .array(z.enum(["instagram", "threads"]))
    .min(1)
    .describe("Target platforms to publish to (e.g. ['instagram', 'threads'])."),
  image_url: z
    .string()
    .trim()
    .url()
    .refine((v) => v.startsWith("https://"), {
      message: "image_url must use HTTPS (https://...).",
    })
    .optional()
    .describe("Publicly accessible HTTPS image URL (required when 'instagram' is included)."),
  instagram_caption: z
    .string()
    .max(2200)
    .optional()
    .describe("Instagram-optimized caption (up to 2,200 characters)."),
  threads_text: z
    .string()
    .max(500)
    .optional()
    .describe(
      "Threads-native post text (up to 500 characters). If omitted, automatically adapted from instagram_caption."
    ),
  threads_topic_tag: z
    .string()
    .trim()
    .max(50)
    .optional()
    .describe("Optional Threads topic tag (1–50 chars, no periods or ampersands)."),
  threads_link_attachment: z
    .string()
    .trim()
    .url()
    .optional()
    .describe("Optional HTTPS link attachment for Threads TEXT posts."),
  plan_id: z
    .string()
    .trim()
    .optional()
    .describe("Optional content plan ID from `nexsai_create_content` for idempotent tracking."),
  confirm: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Safety confirmation flag. Defaults to false (returns a side-by-side multi-platform preview without publishing). Set to true ONLY after explicit human confirmation."
    ),
  force_duplicate: z
    .boolean()
    .optional()
    .default(false)
    .describe("Set to true only if overriding duplicate content detection."),
});


