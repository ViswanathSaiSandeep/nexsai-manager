import { loadDatabaseState, saveExperiment } from "../database/store";
import type { ExperimentRecord } from "../database/schema";
import { captureAnalyticsSnapshot } from "../analytics/analysis";
import { round2, safeAverage } from "../analytics/metrics";
import { findContentOpportunities } from "./opportunities";
import { NexsaiMcpError } from "../utils/errors";

/**
 * Phase 26 — Experimentation Engine (`nexsai_create_experiment` & `nexsai_analyze_experiment`).
 */
export async function createNexsaiExperiment(params: {
  platform?: "instagram" | "threads";
  name: string;
  variable: ExperimentRecord["variable"];
  hypothesis: string;
  variant_a: string;
  variant_b: string;
  success_metric?: ExperimentRecord["success_metric"];
  variant_a_media_ids?: string[];
  variant_b_media_ids?: string[];
}): Promise<ExperimentRecord> {
  return await saveExperiment({
    platform: params.platform ?? "instagram",
    name: params.name,
    variable: params.variable,
    hypothesis: params.hypothesis,
    variant_a: params.variant_a,
    variant_b: params.variant_b,
    success_metric: params.success_metric ?? "engagement_rate_pct",
    variant_a_media_ids: params.variant_a_media_ids ?? [],
    variant_b_media_ids: params.variant_b_media_ids ?? [],
    status: "ACTIVE",
  });
}

export async function analyzeNexsaiExperiment(params: {
  experiment_id?: string;
  variant_a_media_ids?: string[];
  variant_b_media_ids?: string[];
}) {
  const [state, snapshot] = await Promise.all([
    loadDatabaseState(),
    captureAnalyticsSnapshot({ limit: 20 }, "nexsai_analyze_experiment").catch(
      () => null
    ),
  ]);

  const experiment = params.experiment_id
    ? state.experiments.find((e) => e.id === params.experiment_id)
    : state.experiments[0];

  if (!experiment && !params.variant_a_media_ids && !params.variant_b_media_ids) {
    throw new NexsaiMcpError({
      category: "NOT_FOUND",
      message:
        "No experiment found with the given experiment_id, and no active experiments exist yet. Create one first with `nexsai_create_experiment`.",
    });
  }

  const allPosts = snapshot?.enriched_posts ?? [];
  const aIds = params.variant_a_media_ids ?? experiment?.variant_a_media_ids ?? [];
  const bIds = params.variant_b_media_ids ?? experiment?.variant_b_media_ids ?? [];

  // If no explicit media IDs were linked yet, partition recent posts by format or hook for directional comparison
  const groupA =
    aIds.length > 0
      ? allPosts.filter((p) => aIds.includes(p.media.platform_media_id))
      : allPosts.filter((p) => p.media.media_type === "CAROUSEL_ALBUM");

  const groupB =
    bIds.length > 0
      ? allPosts.filter((p) => bIds.includes(p.media.platform_media_id))
      : allPosts.filter((p) => p.media.media_type === "IMAGE");

  const metric = experiment?.success_metric ?? "engagement_rate_pct";

  function extractMetricValues(items: typeof allPosts): Array<number | null> {
    return items.map((p) => {
      if (metric === "engagement_rate_pct") return p.performance.engagement_rate_pct;
      if (metric === "save_rate_pct") return p.performance.save_rate_pct;
      if (metric === "share_rate_pct") return p.performance.share_rate_pct;
      if (metric === "reach") return p.performance.reach;
      return p.performance.views;
    });
  }

  const avgA = safeAverage(extractMetricValues(groupA));
  const avgB = safeAverage(extractMetricValues(groupB));
  const totalSample = groupA.length + groupB.length;
  const isStatisticallySignificant = groupA.length >= 15 && groupB.length >= 15;

  let directionalVerdict = "Inconclusive — insufficient data in one or both variants.";
  if (avgA !== null && avgB !== null) {
    if (avgA > avgB) {
      const diffPct = avgB > 0 ? round2(((avgA - avgB) / avgB) * 100) : 0;
      directionalVerdict = `Variant A leads Variant B on ${metric} (${avgA} vs ${avgB}, +${diffPct}%).`;
    } else if (avgB > avgA) {
      const diffPct = avgA > 0 ? round2(((avgB - avgA) / avgA) * 100) : 0;
      directionalVerdict = `Variant B leads Variant A on ${metric} (${avgB} vs ${avgA}, +${diffPct}%).`;
    } else {
      directionalVerdict = `Variant A and Variant B are tied on ${metric} (${avgA}).`;
    }
  }

  const statisticalNote = isStatisticallySignificant
    ? "Sample size meets minimum threshold (>=15 posts per variant) for directional confidence."
    : `STATISTICAL CAVEAT: Sample size (Variant A: n=${groupA.length}, Variant B: n=${groupB.length}) is too small to claim statistical significance. Treat as an early directional signal only.`;

  if (experiment) {
    await saveExperiment({
      ...experiment,
      variant_a_media_ids: groupA.map((p) => p.media.platform_media_id),
      variant_b_media_ids: groupB.map((p) => p.media.platform_media_id),
      result: `${directionalVerdict} ${statisticalNote}`,
    });
  }

  return {
    experiment: experiment ?? {
      name: "Ad-hoc Variant Comparison",
      variable: "format",
      hypothesis: "Comparing Variant A vs Variant B",
      variant_a: "CAROUSEL_ALBUM",
      variant_b: "IMAGE",
      success_metric: metric,
    },
    OBSERVATION: {
      variant_a_sample_size: groupA.length,
      variant_b_sample_size: groupB.length,
      total_sample_size: totalSample,
    },
    CALCULATION: {
      success_metric: metric,
      variant_a_mean: avgA,
      variant_b_mean: avgB,
      variant_a_avg_views: safeAverage(groupA.map((p) => p.performance.views)),
      variant_b_avg_views: safeAverage(groupB.map((p) => p.performance.views)),
      variant_a_avg_reach: safeAverage(groupA.map((p) => p.performance.reach)),
      variant_b_avg_reach: safeAverage(groupB.map((p) => p.performance.reach)),
    },
    INFERENCE: {
      statistically_significant: isStatisticallySignificant,
      directional_verdict: directionalVerdict,
      statistical_caveat: statisticalNote,
    },
    RECOMMENDATION:
      totalSample < 10
        ? "Continue running this experiment until at least 5–10 posts are published per variant before locking in a permanent rule."
        : "Apply the leading variant's pattern to 70% of upcoming posts while keeping 30% open for new tests.",
  };
}

/**
 * Phase 27 — Recommendation Engine (`nexsai_recommend`).
 * The "NEXSAI Manager Brain" — answers "What should I do next?" by combining:
 * Research + Analytics + Brand + Memory + Experiments + Current Content Plans.
 */
export async function generateNexsaiRecommendations(params: {
  goal?: "reach" | "saves" | "engagement" | "followers" | "balanced";
} = {}) {
  const [opportunities, state] = await Promise.all([
    findContentOpportunities({ limit: 3 }),
    loadDatabaseState(),
  ]);

  const draftPlans = state.content_plans.filter(
    (p) => p.status === "DRAFT" || p.status === "REVIEW" || p.status === "APPROVED"
  );
  const activeExperiments = state.experiments.filter(
    (e) => e.status === "ACTIVE"
  );
  const topOpp = opportunities.ranked_opportunities[0];

  return {
    generated_at: new Date().toISOString(),
    goal_focus: params.goal ?? "balanced",
    immediate_next_action: topOpp
      ? {
          headline: `Create & preview a ${topOpp.recommended_format} on: "${topOpp.topic}"`,
          opportunity_score: topOpp.opportunity_score,
          content_pillar: topOpp.content_pillar,
          suggested_hook: topOpp.recommended_hook,
          suggested_angle: topOpp.recommended_angle,
          why_now: topOpp.why_this_opportunity,
          how_to_execute:
            "Call `nexsai_create_content` to structure the slide brief and caption draft, review with the user, then preview via `instagram_publish` (`confirm: false`).",
        }
      : {
          headline: "Run `nexsai_research_today` to discover fresh AI & tech topics.",
        },
    alternative_opportunities: opportunities.ranked_opportunities.slice(1, 3),
    content_pipeline_status: {
      pending_drafts_or_approvals: draftPlans.length,
      drafts_preview: draftPlans.slice(0, 3).map((d) => ({
        id: d.id,
        topic: d.topic,
        format: d.format,
        status: d.status,
      })),
    },
    memory_and_learning_insights: state.learned_observations
      .slice(0, 4)
      .map((o) => ({
        category: o.category,
        observation: o.observation,
        confidence: o.confidence,
      })),
    experiment_recommendation:
      activeExperiments.length > 0
        ? `Active experiment in progress: "${activeExperiments[0].name}" (${activeExperiments[0].variant_a} vs ${activeExperiments[0].variant_b}). Assign your next post to one of the variants.`
        : "No active experiment running. Consider launching a Hook Style experiment ('Top 3 Things...' vs 'Ever wondered why...') using `nexsai_create_experiment`.",
  };
}

