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

