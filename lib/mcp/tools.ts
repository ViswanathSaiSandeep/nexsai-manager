import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  analyzeInstagramContent,
  deleteInstagramComment,
  getInstagramAccountInsights,
  getInstagramComments,
  getInstagramMediaDetails,
  getInstagramMediaInsights,
  getInstagramProfile,
  INSTAGRAM_API_VERSION,
  listInstagramMedia,
  moderateHideInstagramComment,
  publishInstagramPost,
  replyToInstagramComment,
} from "../instagram";
import {
  instagramAccountInsightsInputSchema,
  instagramAnalyzeContentInputSchema,
  instagramCommentReplyInputSchema,
  instagramCommentsInputSchema,
  instagramDeleteCommentInputSchema,
  instagramHideCommentInputSchema,
  instagramMediaDetailsInputSchema,
  instagramMediaInsightsInputSchema,
  instagramMediaListInputSchema,
  instagramPublishInputSchema,
} from "./validation";
import { formatToolError } from "../utils/errors";
import { logMcpOperation } from "../utils/logger";

/**
 * Registers all NEXSAI Manager MCP tools on the provided `McpServer` instance.
 *
 * Separation of concerns:
 * - This module defines MCP tool names, descriptions, Zod schemas, and output formatting.
 * - All Meta / Instagram Graph API calls and business rules live in `lib/instagram/*`.
 */
export function registerNexsaiTools(server: McpServer): void {
  // ============================================================
  // TOOL 1 — NEXSAI SERVER STATUS (Read-Only)
  // ============================================================
  server.registerTool(
    "nexsai_status",
    {
      description:
        "Check the operational status, configured platform providers, and environment readiness of the NEXSAI Manager MCP server. Use this tool first to verify the server is online and that INSTAGRAM_ACCESS_TOKEN is configured.",
      inputSchema: z.object({}),
    },
    async () => {
      const hasInstagramToken = Boolean(
        process.env.INSTAGRAM_ACCESS_TOKEN?.trim()
      );
      logMcpOperation({
        level: "info",
        tool: "nexsai_status",
        operation: "statusCheck",
        success: true,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                status: "online",
                message:
                  "NEXSAI Manager is online and ready to manage social media.",
                server: "nexsai-manager",
                version: "1.0.0",
                platforms: {
                  instagram: {
                    enabled: true,
                    token_configured: hasInstagramToken,
                    api_version: INSTAGRAM_API_VERSION,
                  },
                  threads: {
                    enabled: false,
                    note: "Threads provider architecture is reserved for future activation.",
                  },
                },
                safety: {
                  write_confirmation_required: true,
                  duplicate_publish_protection: true,
                },
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // ============================================================
  // TOOL 2 — INSTAGRAM PROFILE (Read-Only)
  // ============================================================
  server.registerTool(
    "instagram_profile",
    {
      description:
        "Retrieve structured profile information for the connected Instagram account (@nexsaicommunity), including Instagram user ID, username, display name, account type, biography, website, profile picture URL, followers count, following count, and total published media count.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const profile = await getInstagramProfile("instagram_profile");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(profile, null, 2),
            },
          ],
        };
      } catch (error) {
        return formatToolError(error, "instagram_profile");
      }
    }
  );

  // ============================================================
  // TOOL 3 — INSTAGRAM MEDIA LIST (Read-Only)
  // ============================================================
  server.registerTool(
    "instagram_media",
    {
      description:
        "Retrieve recent media posts from the connected Instagram account, including media ID, caption, media_type (IMAGE, VIDEO, CAROUSEL_ALBUM), media_product_type (FEED, REELS), media_url, permalink, timestamp, like_count, comments_count, and safe pagination cursors (limit, after, before).",
      inputSchema: instagramMediaListInputSchema,
    },
    async (args) => {
      try {
        const media = await listInstagramMedia(args, "instagram_media");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(media, null, 2),
            },
          ],
        };
      } catch (error) {
        return formatToolError(error, "instagram_media");
      }
    }
  );

  // ============================================================
  // TOOL 4 — INSTAGRAM MEDIA DETAILS (Read-Only)
  // ============================================================
  server.registerTool(
    "instagram_media_details",
    {
      description:
        "Retrieve comprehensive details for a single Instagram media post by its numeric media_id, including full caption, media_type, media_product_type, media_url, thumbnail_url, permalink, shortcode, timestamp, like_count, comments_count, and child media items for carousel albums.",
      inputSchema: instagramMediaDetailsInputSchema,
    },
    async ({ media_id }) => {
      try {
        const details = await getInstagramMediaDetails(
          media_id,
          "instagram_media_details"
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(details, null, 2),
            },
          ],
        };
      } catch (error) {
        return formatToolError(error, "instagram_media_details");
      }
    }
  );

  // ============================================================
  // TOOL 5 — INSTAGRAM PUBLISH (Write — Confirmation Required)
  // ============================================================
  server.registerTool(
    "instagram_publish",
    {
      description:
        "Publish a new single-image post to the connected Instagram account using a publicly accessible HTTPS image_url and caption. SAFETY RULE: By default `confirm` is false, which DOES NOT publish and instead returns a formatted preview. You MUST call this with `confirm: false` first to show the preview to the user, and only call with `confirm: true` after explicit user approval.",
      inputSchema: instagramPublishInputSchema,
    },
    async ({ image_url, caption, confirm }) => {
      try {
        const { result, formattedPreview } = await publishInstagramPost(
          { image_url, caption, confirm },
          "instagram_publish"
        );

        if (!result.published && formattedPreview) {
          return {
            content: [
              {
                type: "text",
                text: `${formattedPreview}\n\n${JSON.stringify(result, null, 2)}`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return formatToolError(error, "instagram_publish");
      }
    }
  );

  // ============================================================
  // TOOL 6 — INSTAGRAM COMMENTS (Read-Only)
  // ============================================================
  server.registerTool(
    "instagram_comments",
    {
      description:
        "Retrieve comments and nested replies for a specific Instagram media post by media_id. Returns comment ID, text, username, timestamp, like_count, hidden status, nested replies, and pagination cursors.",
      inputSchema: instagramCommentsInputSchema,
    },
    async (args) => {
      try {
        const comments = await getInstagramComments(args, "instagram_comments");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(comments, null, 2),
            },
          ],
        };
      } catch (error) {
        return formatToolError(error, "instagram_comments");
      }
    }
  );

  // ============================================================
  // TOOL 7 — INSTAGRAM COMMENT REPLY (Write — Confirmation Required)
  // ============================================================
  server.registerTool(
    "instagram_comment_reply",
    {
      description:
        "Post a public reply to a specific comment on the connected Instagram account's media. SAFETY RULE: Requires `confirm: true` to post. When called with `confirm: false` (default), no reply is posted and a preview is returned.",
      inputSchema: instagramCommentReplyInputSchema,
    },
    async (args) => {
      try {
        const result = await replyToInstagramComment(
          args,
          "instagram_comment_reply"
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return formatToolError(error, "instagram_comment_reply");
      }
    }
  );

  // ============================================================
  // TOOL 8 — INSTAGRAM HIDE COMMENT (Moderation — Confirmation Required)
  // ============================================================
  server.registerTool(
    "instagram_hide_comment",
    {
      description:
        "Hide or unhide a comment on a media post owned by the connected Instagram account (`hide: true` hides, `hide: false` unhides). SAFETY RULE: Requires `confirm: true` to execute; when `confirm: false` (default), returns a preview without modifying the comment.",
      inputSchema: instagramHideCommentInputSchema,
    },
    async (args) => {
      try {
        const result = await moderateHideInstagramComment(
          args,
          "instagram_hide_comment"
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return formatToolError(error, "instagram_hide_comment");
      }
    }
  );

  // ============================================================
  // TOOL 9 — INSTAGRAM DELETE COMMENT (Destructive — Confirmation Required)
  // ============================================================
  server.registerTool(
    "instagram_delete_comment",
    {
      description:
        "Permanently delete a comment on a media post owned by the connected Instagram account. DESTRUCTIVE ACTION: Strictly requires `confirm: true`. When `confirm: false` (default), returns a preview and does NOT delete the comment.",
      inputSchema: instagramDeleteCommentInputSchema,
    },
    async (args) => {
      try {
        const result = await deleteInstagramComment(
          args,
          "instagram_delete_comment"
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return formatToolError(error, "instagram_delete_comment");
      }
    }
  );

  // ============================================================
  // TOOL 10 — INSTAGRAM MEDIA INSIGHTS (Read-Only)
  // ============================================================
  server.registerTool(
    "instagram_media_insights",
    {
      description:
        "Retrieve official Instagram Graph API v24.0 performance insights for a specific media post by media_id, including views, reach, saved, shares, likes, comments, and total_interactions. Clearly explains any unavailable or deprecated metrics (such as 'impressions', which Meta replaced with 'views').",
      inputSchema: instagramMediaInsightsInputSchema,
    },
    async (args) => {
      try {
        const insights = await getInstagramMediaInsights(
          args,
          "instagram_media_insights"
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(insights, null, 2),
            },
          ],
        };
      } catch (error) {
        return formatToolError(error, "instagram_media_insights");
      }
    }
  );

  // ============================================================
  // TOOL 11 — INSTAGRAM ACCOUNT INSIGHTS (Read-Only)
  // ============================================================
  server.registerTool(
    "instagram_account_insights",
    {
      description:
        "Retrieve account-level Instagram analytics for the connected professional account over a specified period ('day', 'week', or 'days_28'), including views, reach, accounts_engaged, total_interactions, likes, comments, saves, shares, and profile_links_taps.",
      inputSchema: instagramAccountInsightsInputSchema,
    },
    async (args) => {
      try {
        const insights = await getInstagramAccountInsights(
          args,
          "instagram_account_insights"
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(insights, null, 2),
            },
          ],
        };
      } catch (error) {
        return formatToolError(error, "instagram_account_insights");
      }
    }
  );

  // ============================================================
  // TOOL 12 — INSTAGRAM ANALYZE CONTENT (Read-Only)
  // ============================================================
  server.registerTool(
    "instagram_analyze_content",
    {
      description:
        "Fetch recent Instagram posts along with their individual Graph API insights to analyze content performance. Returns structured data separated into `observed_data` (raw metrics), `calculated_metrics` (averages, engagement rates by reach/views, format breakdowns, top-performing posts), and `recommendations_and_observations` so Claude can answer questions about what content performs best and what to post next.",
      inputSchema: instagramAnalyzeContentInputSchema,
    },
    async (args) => {
      try {
        const analysis = await analyzeInstagramContent(
          args,
          "instagram_analyze_content"
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(analysis, null, 2),
            },
          ],
        };
      } catch (error) {
        return formatToolError(error, "instagram_analyze_content");
      }
    }
  );
}

