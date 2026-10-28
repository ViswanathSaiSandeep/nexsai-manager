import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

/**
 * Phase 31 — Reusable MCP Prompts for NEXSAI Manager 2.0
 *
 * Exposes structured workflow prompts so Claude / ChatGPT can execute
 * multi-step social media strategy workflows consistently:
 * - nexsai_daily_strategy
 * - nexsai_weekly_review
 * - nexsai_content_ideas
 * - nexsai_post_review
 */
export function registerNexsaiPrompts(server: McpServer): void {
  server.registerPrompt(
    "nexsai_daily_strategy",
    {
      title: "NEXSAI Daily Strategy & Opportunity Briefing",
      description:
        "Run a complete daily briefing: discover fresh AI/tech topics, compare against @nexsaicommunity history, and recommend today's highest-leverage post.",
      argsSchema: z.object({
        focus_topic: z
          .string()
          .optional()
          .describe("Optional AI or technology focus area for today."),
      }),
    },
    ({ focus_topic }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              "Act as the Lead Social Media Strategist & Researcher for @nexsaicommunity.",
              focus_topic
                ? `Today's requested focus area: "${focus_topic}".`
                : "Goal: Identify what is worth posting about in AI and technology today.",
              "",
              "Execute the following workflow using NEXSAI MCP tools:",
              "1. Call `nexsai_recommend` (or `nexsai_find_opportunities`) to evaluate today's top AI/tech research opportunities against historical @nexsaicommunity performance and content pillar gaps.",
              "2. Clearly separate your response into OBSERVATION, CALCULATION, INFERENCE, and RECOMMENDATION.",
              "3. Present the #1 recommended post for today with: Topic, Content Pillar, Format (Carousel vs Single Image vs Reel), Hook line, Slide-by-slide outline, Caption draft, and Visual Brief.",
              "4. Ask if I would like to save this to the content plan (`nexsai_create_content`) or generate a safe publish preview (`instagram_publish` with `confirm: false`).",
            ].join("\n"),
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "nexsai_weekly_review",
    {
      title: "NEXSAI Weekly Performance Review & 7-Day Plan",
      description:
        "Analyze recent Instagram post performance, update learned patterns, and build a non-repetitive 7-day content plan.",
      argsSchema: z.object({
        posts_to_analyze: z
          .string()
          .optional()
          .describe("Number of recent posts to analyze (default '10')."),
      }),
    },
    ({ posts_to_analyze }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              "Perform a comprehensive Weekly Review & 7-Day Content Plan for @nexsaicommunity:",
              `1. Call \`instagram_analyze_content\` (limit: ${
                posts_to_analyze ?? "10"
              }) to inspect observed metrics, calculated engagement/save/share rates, and format/pillar breakdowns.`,
              "2. Call `nexsai_plan_week` to build a balanced 7-day schedule that fills under-represented content pillars and includes 2 experimental slots.",
              "3. Highlight which post performed best, what content gaps exist, and what we should experiment with this week.",
            ].join("\n"),
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "nexsai_content_ideas",
    {
      title: "NEXSAI High-Signal Content Idea Generator",
      description:
        "Generate ranked, non-repetitive content ideas backed by live research and competitor differentiation.",
      argsSchema: z.object({
        pillar: z
          .string()
          .optional()
          .describe(
            "Optional content pillar (e.g. ai_tools_productivity, tech_explained, ai_news_breakthroughs)."
          ),
      }),
    },
    ({ pillar }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              "Generate 5 high-signal content opportunities for @nexsaicommunity.",
              pillar ? `Target Content Pillar: ${pillar}` : "",
              "1. Call `nexsai_find_opportunities` and `nexsai_competitor_analysis`.",
              "2. Rank the 5 ideas by Opportunity Score (0–100) and explain how each differentiates NEXSAI from generic AI news pages.",
              "3. For each idea, provide a scroll-stopping hook and visual concept.",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "nexsai_post_review",
    {
      title: "NEXSAI Draft & Pre-Publish Editorial Review",
      description:
        "Review a draft caption and visual concept against NEXSAI brand voice rules before generating a safe publish preview.",
      argsSchema: z.object({
        draft_caption: z
          .string()
          .describe("Draft caption text to review and optimize."),
        image_url: z
          .string()
          .optional()
          .describe("Optional HTTPS image URL for previewing."),
      }),
    },
    ({ draft_caption, image_url }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              "Review this draft post against the NEXSAI Community brand guidelines:",
              "",
              `Draft Caption:\n${draft_caption}`,
              image_url ? `Image URL: ${image_url}` : "",
              "",
              "1. Check hook strength, scannability, technical clarity, CTA effectiveness, and hashtag focus (5–8 tags).",
              "2. Provide an improved version aligned with @nexsaicommunity's voice.",
              image_url
                ? "3. Call `instagram_publish` with `confirm: false` to generate a safe preview without publishing."
                : "3. Save the refined draft using `nexsai_create_content` with status='REVIEW'.",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        },
      ],
    })
  );
}

