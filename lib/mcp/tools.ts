import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
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
  analyzeSinglePostAgainstBenchmarks,
  runComprehensiveContentAnalysis,
} from "../analytics/analysis";
import { executeNexsaiResearch } from "../research/search";
import { analyzeCompetitorLandscape } from "../research/competitors";
import { findContentOpportunities } from "../strategy/opportunities";
import {
  createOrUpdateContentBrief,
  generateCurrentStrategy,
  generateSevenDayPlan,
} from "../strategy/planner";
import {
  analyzeNexsaiExperiment,
  createNexsaiExperiment,
  generateNexsaiRecommendations,
} from "../strategy/experiments";
import {
  appendAuditLog,
  getDatabaseStorageInfo,
  loadDatabaseState,
  updateBrandMemory,
} from "../database/store";
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
  nexsaiAnalyzeExperimentInputSchema,
  nexsaiAnalyzePostInputSchema,
  nexsaiBrandConfigInputSchema,
  nexsaiCompetitorAnalysisInputSchema,
  nexsaiCreateContentInputSchema,
  nexsaiCreateExperimentInputSchema,
  nexsaiFindOpportunitiesInputSchema,
  nexsaiPlanWeekInputSchema,
  nexsaiRecommendInputSchema,
  nexsaiResearchInputSchema,
  nexsaiStrategyInputSchema,
} from "./validation";
import { formatToolError } from "../utils/errors";
import { logMcpOperation } from "../utils/logger";

/**
 * Registers all NEXSAI Manager 2.0 MCP tools on the provided `McpServer` instance.
 *
 * Every tool has an explicit READ / WRITE / DESTRUCTIVE classification,
 * Zod input validation, and structured error handling.
 */
export function registerNexsaiTools(server: McpServer): void {
  // ============================================================
  // TOOL 1 — NEXSAI SERVER STATUS [READ]
  // ============================================================
  server.registerTool(
    "nexsai_status",
    {
      description:
        "[READ] Check the operational status, V2 intelligence engines, database memory adapter, and platform readiness of the NEXSAI Manager 2.0 AI Social Media Operating System.",
      inputSchema: z.object({}),
    },
    async () => {
      const hasInstagramToken = Boolean(
        process.env.INSTAGRAM_ACCESS_TOKEN?.trim()
      );
      const dbInfo = getDatabaseStorageInfo();
      const state = await loadDatabaseState();

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
                  "NEXSAI Manager 2.0 AI Social Media Operating System is online and ready.",
                server: "nexsai-manager",
                version: "2.0.0",
                platforms: {
                  instagram: {
                    enabled: true,
                    token_configured: hasInstagramToken,
                    api_version: INSTAGRAM_API_VERSION,
                    handle: state.brand.instagram_handle,
                  },
                  threads: {
                    enabled: false,
                    note: "SocialProvider abstraction ready; Threads disabled until requested.",
                  },
                },
                memory_and_database: {
                  adapter: dbInfo.adapter,
                  stored_media_count: state.media.length,
                  stored_snapshots_count: state.performance_snapshots.length,
                  stored_research_items: state.research_items.length,
                  content_plans_count: state.content_plans.length,
                  active_experiments_count: state.experiments.filter(
                    (e) => e.status === "ACTIVE"
                  ).length,
                  learned_observations_count: state.learned_observations.length,
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
  // TOOL 2 — INSTAGRAM PROFILE [READ]
  // ============================================================
  server.registerTool(
    "instagram_profile",
    {
      description:
        "[READ] Retrieve structured profile information for the connected Instagram account (@nexsaicommunity), including Instagram user ID, username, display name, account type, biography, website, profile picture URL, followers count, following count, and total published media count.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const profile = await getInstagramProfile("instagram_profile");
        await appendAuditLog({
          tool: "instagram_profile",
          operation: "getInstagramProfile",
          category: "READ",
          success: true,
        });
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
  // TOOL 3 — INSTAGRAM MEDIA LIST [READ]
  // ============================================================
  server.registerTool(
    "instagram_media",
    {
      description:
        "[READ] Retrieve recent media posts from the connected NEXSAI Instagram account for performance analysis and content planning, including media ID, caption, media_type, media_product_type, media_url, permalink, timestamp, like_count, comments_count, and safe pagination cursors.",
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
  // TOOL 4 — INSTAGRAM MEDIA DETAILS [READ]
  // ============================================================
  server.registerTool(
    "instagram_media_details",
    {
      description:
        "[READ] Retrieve comprehensive details for a single Instagram media post by its numeric media_id, including full caption, media_type, media_product_type, media_url, thumbnail_url, permalink, shortcode, timestamp, like_count, comments_count, and child media items for carousel albums.",
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
  // TOOL 5 — INSTAGRAM PUBLISH [WRITE — Confirmation Required]
  // ============================================================
  server.registerTool(
    "instagram_publish",
    {
      description:
        "[WRITE — Confirmation Required] Publish a new single-image post to the connected Instagram account using a publicly accessible HTTPS image_url and caption. Checks historical content hashes for duplicates. SAFETY RULE: By default `confirm` is false, which DOES NOT publish and instead returns a formatted PUBLISH PREVIEW. Only set `confirm: true` after explicit human approval.",
      inputSchema: instagramPublishInputSchema,
    },
    async ({ image_url, caption, confirm, force_duplicate, plan_id }) => {
      try {
        const { result, formattedPreview } = await publishInstagramPost(
          { image_url, caption, confirm, force_duplicate, plan_id },
          "instagram_publish"
        );

        await appendAuditLog({
          tool: "instagram_publish",
          operation: result.published ? "publish:executed" : "publish:preview",
          category: "WRITE",
          success: true,
          summary: result.published
            ? `Published media_id=${result.media_id}`
            : "Generated publish preview (confirm=false)",
        });

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
  // TOOL 6 — INSTAGRAM COMMENTS [READ]
  // ============================================================
  server.registerTool(
    "instagram_comments",
    {
      description:
        "[READ] Retrieve comments and nested replies for a specific Instagram media post by media_id. Returns comment ID, text, username, timestamp, like_count, hidden status, nested replies, and pagination cursors.",
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
  // TOOL 7 — INSTAGRAM COMMENT REPLY [WRITE — Confirmation Required]
  // ============================================================
  server.registerTool(
    "instagram_comment_reply",
    {
      description:
        "[WRITE — Confirmation Required] Post a public reply to a specific comment on the connected Instagram account's media. SAFETY RULE: Requires `confirm: true` to post. When called with `confirm: false` (default), no reply is posted and a preview is returned.",
      inputSchema: instagramCommentReplyInputSchema,
    },
    async (args) => {
      try {
        const result = await replyToInstagramComment(
          args,
          "instagram_comment_reply"
        );
        await appendAuditLog({
          tool: "instagram_comment_reply",
          operation: result.posted ? "reply:posted" : "reply:preview",
          category: "WRITE",
          success: true,
        });
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
  // TOOL 8 — INSTAGRAM HIDE COMMENT [DESTRUCTIVE / MODERATION — Confirmation Required]
  // ============================================================
  server.registerTool(
    "instagram_hide_comment",
    {
      description:
        "[DESTRUCTIVE — Confirmation Required] Hide or unhide a comment on a media post owned by the connected Instagram account (`hide: true` hides, `hide: false` unhides). SAFETY RULE: Requires `confirm: true` to execute; when `confirm: false` (default), returns a preview without modifying the comment.",
      inputSchema: instagramHideCommentInputSchema,
    },
    async (args) => {
      try {
        const result = await moderateHideInstagramComment(
          args,
          "instagram_hide_comment"
        );
        await appendAuditLog({
          tool: "instagram_hide_comment",
          operation: result.executed ? "hide:executed" : "hide:preview",
          category: "DESTRUCTIVE",
          success: true,
        });
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
  // TOOL 9 — INSTAGRAM DELETE COMMENT [DESTRUCTIVE — Confirmation Required]
  // ============================================================
  server.registerTool(
    "instagram_delete_comment",
    {
      description:
        "[DESTRUCTIVE — Confirmation Required] Permanently delete a comment on a media post owned by the connected Instagram account. Strictly requires `confirm: true`. When `confirm: false` (default), returns a preview and does NOT delete the comment.",
      inputSchema: instagramDeleteCommentInputSchema,
    },
    async (args) => {
      try {
        const result = await deleteInstagramComment(
          args,
          "instagram_delete_comment"
        );
        await appendAuditLog({
          tool: "instagram_delete_comment",
          operation: result.executed ? "delete:executed" : "delete:preview",
          category: "DESTRUCTIVE",
          success: true,
        });
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
  // TOOL 10 — INSTAGRAM MEDIA INSIGHTS [READ]
  // ============================================================
  server.registerTool(
    "instagram_media_insights",
    {
      description:
        "[READ] Retrieve official Instagram Graph API v24.0 performance insights for a specific media post by media_id, including views, reach, saved, shares, likes, comments, and total_interactions. Clearly explains any unavailable or deprecated metrics (such as 'impressions').",
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
  // TOOL 11 — INSTAGRAM ACCOUNT INSIGHTS [READ]
  // ============================================================
  server.registerTool(
    "instagram_account_insights",
    {
      description:
        "[READ] Retrieve account-level Instagram analytics for the connected professional account over a specified period ('day', 'week', or 'days_28'), including views, reach, accounts_engaged, total_interactions, likes, comments, saves, shares, and profile_links_taps.",
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
  // TOOL 12 — INSTAGRAM ANALYZE CONTENT / ACCOUNT [READ]
  // ============================================================
  server.registerTool(
    "instagram_analyze_content",
    {
      description:
        "[READ] Capture an analytics snapshot of recent Instagram posts, classify content pillars and hook styles, persist performance history, and return an epistemic breakdown separated into OBSERVATION, CALCULATION, INFERENCE, and RECOMMENDATION.",
      inputSchema: instagramAnalyzeContentInputSchema,
    },
    async (args) => {
      try {
        const analysis = await runComprehensiveContentAnalysis(
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

  // High-level alias requested in Section 28 & 30: nexsai_analyze_account
  server.registerTool(
    "nexsai_analyze_account",
    {
      description:
        "[READ] High-level account & content intelligence workflow: syncs profile, account-level insights, recent media performance, content pillar distribution, hook patterns, and learned observations for @nexsaicommunity.",
      inputSchema: instagramAnalyzeContentInputSchema,
    },
    async (args) => {
      try {
        const analysis = await runComprehensiveContentAnalysis(
          args,
          "nexsai_analyze_account"
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
        return formatToolError(error, "nexsai_analyze_account");
      }
    }
  );

  // ============================================================
  // TOOL 14 — NEXSAI RESEARCH ENGINE [READ]
  // ============================================================
  server.registerTool(
    "nexsai_research",
    {
      description:
        "[READ] Research current AI, developer tools, model launches, and technology news across reputable tech sources. Deduplicates stories, evaluates freshness, scores NEXSAI brand fit (0–100), and suggests content angles.",
      inputSchema: nexsaiResearchInputSchema,
    },
    async (args) => {
      try {
        const res = await executeNexsaiResearch(args, "nexsai_research");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(res, null, 2),
            },
          ],
        };
      } catch (error) {
        return formatToolError(error, "nexsai_research");
      }
    }
  );

  // High-level workflow alias: nexsai_research_today
  server.registerTool(
    "nexsai_research_today",
    {
      description:
        "[READ] High-level daily AI & tech discovery workflow: finds what is worth posting about in AI and technology today, scored for @nexsaicommunity relevance and freshness.",
      inputSchema: z.object({
        topic: z
          .string()
          .trim()
          .optional()
          .describe("Optional specific AI or technology area to focus on today."),
      }),
    },
    async ({ topic }) => {
      try {
        const res = await executeNexsaiResearch(
          {
            topic: topic ?? "AI tools LLM models developer tech",
            time_range: "24h",
            limit: 6,
          },
          "nexsai_research_today"
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(res, null, 2),
            },
          ],
        };
      } catch (error) {
        return formatToolError(error, "nexsai_research_today");
      }
    }
  );

  // ============================================================
  // TOOL 16 — CONTENT OPPORTUNITY ENGINE [READ]
  // ============================================================
  server.registerTool(
    "nexsai_find_opportunities",
    {
      description:
        "[READ] Combine live tech/AI research, historical @nexsaicommunity post performance, content pillars, recently covered topics, and content gaps to rank the highest-scoring content opportunities (0–100).",
      inputSchema: nexsaiFindOpportunitiesInputSchema,
    },
    async (args) => {
      try {
        const opps = await findContentOpportunities(args);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(opps, null, 2),
            },
          ],
        };
      } catch (error) {
        return formatToolError(error, "nexsai_find_opportunities");
      }
    }
  );

  // High-level workflow alias: nexsai_find_content_opportunities
  server.registerTool(
    "nexsai_find_content_opportunities",
    {
      description:
        "[READ] High-level workflow to discover and rank top content opportunities for @nexsaicommunity based on live trends, historical engagement, and pillar gaps.",
      inputSchema: nexsaiFindOpportunitiesInputSchema,
    },
    async (args) => {
      try {
        const opps = await findContentOpportunities(args);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(opps, null, 2),
            },
          ],
        };
      } catch (error) {
        return formatToolError(error, "nexsai_find_content_opportunities");
      }
    }
  );

  // ============================================================
  // TOOL 18 — COMPETITOR INTELLIGENCE [READ / MEMORY]
  // ============================================================
  server.registerTool(
    "nexsai_competitor_analysis",
    {
      description:
        "[READ] Analyze tracked AI/tech competitor archetypes to identify differentiation gaps, underserved angles, and format advantages for @nexsaicommunity.",
      inputSchema: nexsaiCompetitorAnalysisInputSchema,
    },
    async (args) => {
      try {
        const comp = await analyzeCompetitorLandscape(args);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(comp, null, 2),
            },
          ],
        };
      } catch (error) {
        return formatToolError(error, "nexsai_competitor_analysis");
      }
    }
  );

  // ============================================================
  // TOOL 19 — CONTENT STRATEGY ENGINE [READ]
  // ============================================================
  server.registerTool(
    "nexsai_strategy",
    {
      description:
        "[READ] Generate the current weekly content strategy for @nexsaicommunity, including ranked priorities, recommended formats, content angles, goals, and active learning loop observations.",
      inputSchema: nexsaiStrategyInputSchema,
    },
    async ({ goal }) => {
      try {
        const strategy = await generateCurrentStrategy(goal);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(strategy, null, 2),
            },
          ],
        };
      } catch (error) {
        return formatToolError(error, "nexsai_strategy");
      }
    }
  );

  // ============================================================
  // TOOL 20 — 7-DAY CONTENT PLANNER [WRITE TO PLANNER]
  // ============================================================
  server.registerTool(
    "nexsai_plan_week",
    {
      description:
        "[WRITE] Generate a balanced 7-day content plan (Monday through Sunday) for @nexsaicommunity that rotates content pillars, avoids repetitive topics, includes experimental slots, and saves DRAFT plans to the calendar.",
      inputSchema: nexsaiPlanWeekInputSchema,
    },
    async (args) => {
      try {
        const plan = await generateSevenDayPlan(args);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(plan, null, 2),
            },
          ],
        };
      } catch (error) {
        return formatToolError(error, "nexsai_plan_week");
      }
    }
  );

  // ============================================================
  // TOOL 21 — CONTENT CREATION & APPROVAL WORKFLOW [WRITE TO PLANNER]
  // ============================================================
  server.registerTool(
    "nexsai_create_content",
    {
      description:
        "[WRITE] Create or update a structured content plan record (hook, headline, caption, CTA, hashtags, visual brief, carousel slide structure) and manage its approval lifecycle (DRAFT -> REVIEW -> APPROVED -> PUBLISHED -> ANALYZING). Never publishes automatically.",
      inputSchema: nexsaiCreateContentInputSchema,
    },
    async (args) => {
      try {
        const created = await createOrUpdateContentBrief(args);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(created, null, 2),
            },
          ],
        };
      } catch (error) {
        return formatToolError(error, "nexsai_create_content");
      }
    }
  );

  // ============================================================
  // TOOL 22 — POST-PUBLISH BENCHMARK ANALYZER [READ]
  // ============================================================
  server.registerTool(
    "nexsai_analyze_post",
    {
      description:
        "[READ] Analyze a specific Instagram post by media_id and compare its reach, views, saves, shares, and engagement rate against your account average, same format average, and same content pillar average.",
      inputSchema: nexsaiAnalyzePostInputSchema,
    },
    async ({ media_id }) => {
      try {
        const postAnalysis = await analyzeSinglePostAgainstBenchmarks(
          media_id,
          "nexsai_analyze_post"
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(postAnalysis, null, 2),
            },
          ],
        };
      } catch (error) {
        return formatToolError(error, "nexsai_analyze_post");
      }
    }
  );

  // ============================================================
  // TOOL 23 — CREATE EXPERIMENT [WRITE TO MEMORY]
  // ============================================================
  server.registerTool(
    "nexsai_create_experiment",
    {
      description:
        "[WRITE] Create a structured content experiment (testing hook_style, format, pillar, cta_variation, posting_time, caption_length, or topic_angle) with a clear hypothesis, Variant A, Variant B, and target success metric.",
      inputSchema: nexsaiCreateExperimentInputSchema,
    },
    async (args) => {
      try {
        const exp = await createNexsaiExperiment(args);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(exp, null, 2),
            },
          ],
        };
      } catch (error) {
        return formatToolError(error, "nexsai_create_experiment");
      }
    }
  );

  // ============================================================
  // TOOL 24 — ANALYZE EXPERIMENT [READ]
  // ============================================================
  server.registerTool(
    "nexsai_analyze_experiment",
    {
      description:
        "[READ] Evaluate an active or completed NEXSAI experiment by comparing Variant A and Variant B performance metrics with explicit statistical significance caveats.",
      inputSchema: nexsaiAnalyzeExperimentInputSchema,
    },
    async (args) => {
      try {
        const result = await analyzeNexsaiExperiment(args);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return formatToolError(error, "nexsai_analyze_experiment");
      }
    }
  );

  // ============================================================
  // TOOL 25 — NEXSAI RECOMMENDATION ENGINE ("THE BRAIN") [READ]
  // ============================================================
  server.registerTool(
    "nexsai_recommend",
    {
      description:
        "[READ] The NEXSAI Manager 2.0 Brain — answers 'What should I do next?' by synthesizing live research, Instagram analytics, brand pillars, learned observations, active experiments, and pending content drafts.",
      inputSchema: nexsaiRecommendInputSchema,
    },
    async (args) => {
      try {
        const rec = await generateNexsaiRecommendations(args);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(rec, null, 2),
            },
          ],
        };
      } catch (error) {
        return formatToolError(error, "nexsai_recommend");
      }
    }
  );

  // ============================================================
  // TOOL 26 — BRAND KNOWLEDGE CONFIGURATION [READ / WRITE]
  // ============================================================
  server.registerTool(
    "nexsai_brand_config",
    {
      description:
        "[READ / WRITE] View (`action: 'get'`) or update (`action: 'update'`, requires `confirm: true`) the persistent NEXSAI Community brand memory, including positioning, target audience, CTA preferences, hashtags, signature series, and topics to avoid.",
      inputSchema: nexsaiBrandConfigInputSchema,
    },
    async (args) => {
      try {
        const state = await loadDatabaseState();
        if (args.action !== "update") {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(state.brand, null, 2),
              },
            ],
          };
        }

        if (!args.confirm) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    updated: false,
                    confirm_required: true,
                    message:
                      "Brand configuration update preview. Set confirm=true to persist these brand memory changes.",
                    proposed_updates: args,
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        const updated = await updateBrandMemory({
          ...(args.positioning ? { positioning: args.positioning } : {}),
          ...(args.mission ? { mission: args.mission } : {}),
          ...(args.target_audience ? { target_audience: args.target_audience } : {}),
          ...(args.cta_preferences ? { cta_preferences: args.cta_preferences } : {}),
          ...(args.default_hashtags ? { default_hashtags: args.default_hashtags } : {}),
          ...(args.signature_series ? { signature_series: args.signature_series } : {}),
          ...(args.topics_to_avoid ? { topics_to_avoid: args.topics_to_avoid } : {}),
          ...(args.posts_per_week
            ? {
                posting_cadence: {
                  ...state.brand.posting_cadence,
                  posts_per_week: args.posts_per_week,
                },
              }
            : {}),
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  updated: true,
                  brand: updated,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return formatToolError(error, "nexsai_brand_config");
      }
    }
  );
}
