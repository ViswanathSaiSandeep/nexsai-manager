import type { McpServer } from "@modelcontextprotocol/server";
import { loadDatabaseState } from "../database/store";
import { generateCurrentStrategy } from "../strategy/planner";
import { runComprehensiveContentAnalysis } from "../analytics/analysis";

/**
 * Phase 10 — NEXSAI Manager 2.0 MCP Resources
 *
 * Exposes persistent brand knowledge, strategy, and analytics context via MCP resources:
 * - nexsai://brand/profile
 * - nexsai://brand/voice
 * - nexsai://brand/content-pillars
 * - nexsai://brand/rules
 * - nexsai://strategy/current
 * - nexsai://analytics/summary
 */
export function registerNexsaiResources(server: McpServer): void {
  server.registerResource(
    "nexsai_brand_profile",
    "nexsai://brand/profile",
    {
      title: "NEXSAI Brand Profile",
      description:
        "Core brand identity, mission, positioning, and target audience for @nexsaicommunity.",
      mimeType: "application/json",
    },
    async (uri) => {
      const state = await loadDatabaseState();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(
              {
                brand_name: state.brand.brand_name,
                instagram_handle: state.brand.instagram_handle,
                positioning: state.brand.positioning,
                mission: state.brand.mission,
                target_audience: state.brand.target_audience,
                visual_identity: state.brand.visual_identity,
                posting_cadence: state.brand.posting_cadence,
                signature_series: state.brand.signature_series,
                updated_at: state.brand.updated_at,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerResource(
    "nexsai_brand_voice",
    "nexsai://brand/voice",
    {
      title: "NEXSAI Brand Voice & Tone Guidelines",
      description:
        "Writing style, formatting rules, CTA preferences, and hashtags for @nexsaicommunity.",
      mimeType: "application/json",
    },
    async (uri) => {
      const state = await loadDatabaseState();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(
              {
                voice_and_tone: state.brand.voice_and_tone,
                cta_preferences: state.brand.cta_preferences,
                default_hashtags: state.brand.default_hashtags,
                updated_at: state.brand.updated_at,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerResource(
    "nexsai_brand_content_pillars",
    "nexsai://brand/content-pillars",
    {
      title: "NEXSAI Content Pillars",
      description:
        "Target content pillars, share percentages, preferred formats, and example topics.",
      mimeType: "application/json",
    },
    async (uri) => {
      const state = await loadDatabaseState();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(
              {
                content_pillars: state.brand.content_pillars,
                updated_at: state.brand.updated_at,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerResource(
    "nexsai_brand_rules",
    "nexsai://brand/rules",
    {
      title: "NEXSAI Editorial & Safety Rules",
      description:
        "Editorial do/don't rules, topics to avoid, and mandatory human-in-the-loop publishing confirmation rules.",
      mimeType: "application/json",
    },
    async (uri) => {
      const state = await loadDatabaseState();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(
              {
                do_list: state.brand.voice_and_tone.do_list,
                dont_list: state.brand.voice_and_tone.dont_list,
                topics_to_avoid: state.brand.topics_to_avoid,
                publishing_safety_rules: [
                  "NEVER publish without first previewing with confirm=false and obtaining explicit user confirmation.",
                  "NEVER fabricate Instagram metrics; distinguish OBSERVATION, CALCULATION, INFERENCE, and RECOMMENDATION.",
                  "Verify technical AI/hardware claims across reputable sources before drafting.",
                ],
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerResource(
    "nexsai_strategy_current",
    "nexsai://strategy/current",
    {
      title: "NEXSAI Current Weekly Strategy & Learned Observations",
      description:
        "Current content strategy priorities, active experiments, and learned performance observations.",
      mimeType: "application/json",
    },
    async (uri) => {
      const strategy = await generateCurrentStrategy().catch(async () => {
        const state = await loadDatabaseState();
        return {
          brand_handle: state.brand.instagram_handle,
          learned_observations: state.learned_observations,
          experiments: state.experiments,
        };
      });
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(strategy, null, 2),
          },
        ],
      };
    }
  );

  server.registerResource(
    "nexsai_analytics_summary",
    "nexsai://analytics/summary",
    {
      title: "NEXSAI Analytics & Memory Summary",
      description:
        "Latest Instagram performance summary, top posts, and learned pattern insights.",
      mimeType: "application/json",
    },
    async (uri) => {
      const state = await loadDatabaseState();
      const summary = await runComprehensiveContentAnalysis({ limit: 5 }).catch(
        () => ({
          cached_accounts: state.accounts,
          cached_media_count: state.media.length,
          cached_snapshots_count: state.performance_snapshots.length,
          learned_observations: state.learned_observations,
        })
      );
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(summary, null, 2),
          },
        ],
      };
    }
  );
}

