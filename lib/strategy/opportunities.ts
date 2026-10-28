import { captureAnalyticsSnapshot } from "../analytics/analysis";
import { detectContentPatterns } from "../analytics/patterns";
import { executeNexsaiResearch } from "../research/search";
import { loadDatabaseState } from "../database/store";
import type { ContentPillarId } from "../database/schema";

export interface RankedContentOpportunity {
  rank: number;
  topic: string;
  opportunity_score: number; // 0 - 100
  content_pillar: ContentPillarId;
  recommended_format: "CAROUSEL_ALBUM" | "IMAGE" | "REELS";
  recommended_hook: string;
  recommended_angle: string;
  goal: "reach" | "saves" | "engagement" | "followers" | "education";
  source_url?: string;
  why_this_opportunity: string[];
}

/**
 * Phase 18 — Content Opportunity Engine (`nexsai_find_opportunities` & `nexsai_find_content_opportunities`).
 * Combines:
 * - Current tech/AI research
 * - Historical NEXSAI Instagram performance
 * - Brand content pillars
 * - Recently covered topics (avoids repetition)
 * - Content gaps
 */
export async function findContentOpportunities(params: {
  focus_topic?: string;
  limit?: number;
} = {}): Promise<{
  evaluated_at: string;
  recent_posts_checked: number;
  content_gaps_detected: string[];
  ranked_opportunities: RankedContentOpportunity[];
}> {
  const limit = Math.min(Math.max(params.limit ?? 5, 1), 10);

  const [researchResult, snapshot, state] = await Promise.all([
    executeNexsaiResearch({
      topic: params.focus_topic ?? "AI tools models developer workflows hardware",
      time_range: "7d",
      limit: 10,
    }),
    captureAnalyticsSnapshot({ limit: 10 }, "nexsai_find_opportunities").catch(
      () => null
    ),
    loadDatabaseState(),
  ]);

  const enrichedPosts = snapshot?.enriched_posts ?? [];
  const patterns = detectContentPatterns(
    enrichedPosts,
    state.brand.content_pillars
  );

  const recentTopicsLower = enrichedPosts.map((p) =>
    p.media.caption.toLowerCase()
  );

  const gapPillarIds = new Set(patterns.content_gaps.map((g) => g.pillar_id));
  const bestFormat =
    (patterns.by_format[0]?.key as "CAROUSEL_ALBUM" | "IMAGE" | "REELS") ??
    "CAROUSEL_ALBUM";

  const scoredCandidates = researchResult.opportunities.map((item) => {
    const titleWords = item.title
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 4);

    // Check repetition against recent captions
    let overlapCount = 0;
    for (const caption of recentTopicsLower) {
      const matchedWords = titleWords.filter((w) => caption.includes(w));
      if (matchedWords.length >= 3) {
        overlapCount += 1;
      }
    }

    const fillsGap = gapPillarIds.has(item.recommended_pillar);
    const pillarConfig = state.brand.content_pillars.find(
      (p) => p.id === item.recommended_pillar
    );

    const baseScore = Math.round(
      item.relevance_score * 0.45 + item.nexsai_fit_score * 0.45
    );
    const gapBonus = fillsGap ? 8 : 3;
    const noveltyBonus = overlapCount === 0 ? 6 : -12 * overlapCount;
    const opportunityScore = Math.min(
      99,
      Math.max(40, baseScore + gapBonus + noveltyBonus)
    );

    const recommendedFormat =
      pillarConfig?.preferred_formats[0] ?? bestFormat ?? "CAROUSEL_ALBUM";

    const whyReasons: string[] = [
      `High NEXSAI brand fit (${item.nexsai_fit_score}/100) and community relevance (${item.relevance_score}/100) from ${item.source}`,
    ];
    if (overlapCount === 0) {
      whyReasons.push(
        "Low recent repetition — @nexsaicommunity has not covered this specific topic in recent posts"
      );
    }
    if (fillsGap && pillarConfig) {
      whyReasons.push(
        `Fills a current content pillar gap in '${pillarConfig.name}' (target share: ${pillarConfig.target_share_pct}%)`
      );
    }
    whyReasons.push(
      `Matches historically strong format (${recommendedFormat}) for ${
        pillarConfig?.primary_goal ?? "saves"
      }`
    );

    return {
      topic: item.title,
      opportunity_score: opportunityScore,
      content_pillar: item.recommended_pillar,
      recommended_format: recommendedFormat,
      recommended_hook:
        recommendedFormat === "CAROUSEL_ALBUM"
          ? `🚀 Top 3 Things You Need to Know About ${item.title.slice(0, 42)}:`
          : `👀 Ever wondered how ${item.title.slice(0, 42)} actually works?`,
      recommended_angle: item.content_angle,
      goal: pillarConfig?.primary_goal ?? "saves",
      source_url: item.url,
      why_this_opportunity: whyReasons,
    };
  });

  scoredCandidates.sort((a, b) => b.opportunity_score - a.opportunity_score);

  const ranked: RankedContentOpportunity[] = scoredCandidates
    .slice(0, limit)
    .map((c, idx) => ({
      rank: idx + 1,
      ...c,
    }));

  return {
    evaluated_at: new Date().toISOString(),
    recent_posts_checked: enrichedPosts.length,
    content_gaps_detected: patterns.content_gaps.map((g) => g.gap_description),
    ranked_opportunities: ranked,
  };
}

