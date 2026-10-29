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

  // ============================================================
  // V3 — THREADS & CROSS-PLATFORM REUSABLE PROMPTS
  // ============================================================

  server.registerPrompt(
    "nexsai_threads_daily_strategy",
    {
      title: "NEXSAI Threads Daily Strategy & Opportunity Briefing",
      description:
        "Analyze recent Threads performance, discover trending AI/tech discussions, and draft today's highest-leverage Threads post (<= 500 chars).",
      argsSchema: z.object({
        focus_topic: z
          .string()
          .optional()
          .describe("Optional AI or developer topic focus for today's Threads post."),
      }),
    },
    ({ focus_topic }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              "Act as the Lead Threads Strategist for @nexsaicommunity.",
              focus_topic ? `Today's requested topic: "${focus_topic}".` : "",
              "Execute the following workflow:",
              "1. Call `nexsai_threads_recommend` and `threads_account_status` to check publishing quota and ranked Threads opportunities.",
              "2. Present the #1 Threads opportunity separating OBSERVATION, CALCULATION, INFERENCE, and RECOMMENDATION.",
              "3. Draft a Threads-native post (strictly <= 500 characters) with a punchy hook, 3 concise bullets, a single topic_tag, and a discussion question CTA.",
              "4. Call `threads_publish` with `confirm: false` to show a safe preview without publishing.",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "nexsai_threads_post_mortem",
    {
      title: "NEXSAI Threads Post-Mortem & Benchmark Analysis",
      description:
        "Evaluate a published Threads post's views, likes, replies, reposts, quotes, and shares against @nexsaicommunity Threads averages.",
      argsSchema: z.object({
        media_id: z
          .string()
          .optional()
          .describe("Optional Threads media_id to inspect (omit to analyze the most recent posts)."),
      }),
    },
    ({ media_id }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              "Run a Threads Post-Mortem for @nexsaicommunity:",
              media_id
                ? `1. Call \`threads_media_details\` and \`threads_media_insights\` for media_id="${media_id}", plus \`nexsai_threads_analyze\` for account benchmarks.`
                : "1. Call `nexsai_threads_analyze` (limit: 10) to inspect recent Threads posts and their insights.",
              "2. Compare views, likes, replies, reposts, quotes, and shares using `views` as the explicit engagement-rate denominator.",
              "3. Identify why the top post succeeded and what hook/CTA adjustments to test next.",
            ].join("\n"),
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "nexsai_threads_growth_review",
    {
      title: "NEXSAI Threads Growth & Conversation Review",
      description:
        "Review Threads account-level views, follower count, top posts, and active reply conversations.",
      argsSchema: z.object({}),
    },
    () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              "Perform a complete Threads Growth & Conversation Review for @nexsaicommunity:",
              "1. Call `nexsai_threads_analyze` and `threads_account_insights`.",
              "2. For the top 2 posts with replies, call `threads_read_replies` to inspect community questions and discussions.",
              "3. Recommend 2 reply drafts (`threads_reply` with `confirm: false`) and 3 new Threads post angles for this week.",
            ].join("\n"),
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "nexsai_cross_platform_campaign",
    {
      title: "NEXSAI Cross-Platform Campaign (Instagram + Threads)",
      description:
        "Design a coordinated Instagram Carousel/Image post and a Threads-native companion post from a single AI/tech topic.",
      argsSchema: z.object({
        topic: z
          .string()
          .describe("Campaign topic (e.g. 'Claude MCP Servers', 'Gemini vs Claude Coding')."),
        image_url: z
          .string()
          .optional()
          .describe("Optional HTTPS image URL for previewing across both platforms."),
      }),
    },
    ({ topic, image_url }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `Create a coordinated Instagram + Threads campaign for @nexsaicommunity on: "${topic}".`,
              "1. Call `nexsai_create_content` with `platform: 'both'` to save the unified campaign draft.",
              "2. Adapt the Instagram version for visual depth & saves (<= 2,200 chars, 5-8 hashtags) and the Threads version for rapid discussion & replies (<= 500 chars, 1 topic_tag).",
              image_url
                ? `3. Call \`nexsai_cross_platform_publish\` with \`platforms: ['instagram', 'threads']\`, \`image_url: '${image_url}'\`, and \`confirm: false\` to generate a side-by-side preview.`
                : "3. Show both platform drafts side-by-side and ask for my approval before publishing.",
            ].join("\n"),
          },
        },
      ],
    })
  );
}

