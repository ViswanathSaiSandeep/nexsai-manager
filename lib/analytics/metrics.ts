import type {
  ContentClassificationRecord,
  ContentPillarId,
  CtaStyleType,
  HookStyleType,
} from "../database/schema";
import { DEFAULT_BRAND_MEMORY } from "../database/store";

export interface CalculatedMetricsBundle {
  like_rate_pct: number | null;
  comment_rate_pct: number | null;
  save_rate_pct: number | null;
  share_rate_pct: number | null;
  engagement_rate_by_reach_pct: number | null;
  engagement_rate_by_views_pct: number | null;
  views_per_reach_ratio: number | null;
  unavailable_metrics: Array<{ metric: string; reason: string }>;
}

export function round2(val: number): number {
  return Math.round(val * 100) / 100;
}

export function safeAverage(values: Array<number | null | undefined>): number | null {
  const valid = values.filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v)
  );
  if (valid.length === 0) return null;
  return round2(valid.reduce((sum, x) => sum + x, 0) / valid.length);
}

/**
 * Computes performance ratios safely with zero-denominator protection.
 * Does NOT manufacture data: if reach or views are unavailable or zero, returns null
 * and explains why in `unavailable_metrics`.
 */
export function calculatePostRates(input: {
  likes: number;
  comments: number;
  saves: number | null;
  shares: number | null;
  views: number | null;
  reach: number | null;
  total_interactions: number | null;
}): CalculatedMetricsBundle {
  const unavailable: Array<{ metric: string; reason: string }> = [];

  // Impressions is always flagged with official v22.0+ deprecation explanation
  unavailable.push({
    metric: "impressions",
    reason:
      "Metric unavailable from current API version: Deprecated by Meta in Graph API v22.0+ and replaced by 'views'.",
  });
  unavailable.push({
    metric: "follower_conversion",
    reason:
      "Metric unavailable from current API permissions: Per-post follows/profile_activity require 100+ followers and specific feed/reel attribution scopes.",
  });

  const denominator =
    typeof input.reach === "number" && input.reach > 0
      ? input.reach
      : typeof input.views === "number" && input.views > 0
      ? input.views
      : null;

  if (denominator === null) {
    return {
      like_rate_pct: null,
      comment_rate_pct: null,
      save_rate_pct: null,
      share_rate_pct: null,
      engagement_rate_by_reach_pct: null,
      engagement_rate_by_views_pct: null,
      views_per_reach_ratio: null,
      unavailable_metrics: [
        ...unavailable,
        {
          metric: "engagement_rates",
          reason:
            "Reach and views are zero or unavailable for this post; rate calculations skipped to avoid division by zero.",
        },
      ],
    };
  }

  const totalInteractions =
    typeof input.total_interactions === "number"
      ? input.total_interactions
      : input.likes +
        input.comments +
        (input.saves ?? 0) +
        (input.shares ?? 0);

  const likeRate = round2((input.likes / denominator) * 100);
  const commentRate = round2((input.comments / denominator) * 100);
  const saveRate =
    typeof input.saves === "number"
      ? round2((input.saves / denominator) * 100)
      : null;
  const shareRate =
    typeof input.shares === "number"
      ? round2((input.shares / denominator) * 100)
      : null;

  const engByReach =
    typeof input.reach === "number" && input.reach > 0
      ? round2((totalInteractions / input.reach) * 100)
      : null;

  const engByViews =
    typeof input.views === "number" && input.views > 0
      ? round2((totalInteractions / input.views) * 100)
      : null;

  const viewsPerReach =
    typeof input.views === "number" &&
    typeof input.reach === "number" &&
    input.reach > 0
      ? round2(input.views / input.reach)
      : null;

  return {
    like_rate_pct: likeRate,
    comment_rate_pct: commentRate,
    save_rate_pct: saveRate,
    share_rate_pct: shareRate,
    engagement_rate_by_reach_pct: engByReach,
    engagement_rate_by_views_pct: engByViews,
    views_per_reach_ratio: viewsPerReach,
    unavailable_metrics: unavailable,
  };
}

/**
 * Deterministic content classifier that tags a post's topic, content_pillar,
 * hook_type, cta_type, and goal based on caption and media_type.
 */
export function classifyInstagramPost(input: {
  media_id: string;
  caption?: string;
  media_type: string;
}): ContentClassificationRecord {
  const caption = (input.caption ?? "").trim();
  const lower = caption.toLowerCase();
  const firstLine = caption.split(/\r?\n/)[0] ?? "";

  // Determine content pillar by keyword scoring
  let bestPillar: ContentPillarId = "ai_tools_productivity";
  let bestScore = 0;

  for (const pillar of DEFAULT_BRAND_MEMORY.content_pillars) {
    let score = 0;
    for (const kw of pillar.keywords) {
      if (lower.includes(kw.toLowerCase())) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestPillar = pillar.id;
    }
  }

  // Determine hook type from first line
  let hookType: HookStyleType = "general";
  if (/\?/.test(firstLine) || /^(ever wondered|why|how|what if|did you know)/i.test(firstLine)) {
    hookType = "curiosity_question";
  } else if (/\b(top\s+\d+|\d+\s+(things|ways|tools|tips|steps|reasons))\b/i.test(firstLine)) {
    hookType = "numbered_list";
  } else if (/\bvs\.?\b|compared|smoother|faster/i.test(firstLine)) {
    hookType = "comparison_vs";
  } else if (/\b(breaking|just launched|new release|announced|update)\b/i.test(firstLine)) {
    hookType = "news_alert";
  } else if (/\b(guide|how to|step-by-step|tutorial)\b/i.test(firstLine)) {
    hookType = "step_by_step_guide";
  }

  // Determine CTA type
  let ctaType: CtaStyleType = "none";
  if (/swipe/i.test(lower)) {
    ctaType = "swipe_guide";
  } else if (/save this|bookmark/i.test(lower)) {
    ctaType = "save_for_later";
  } else if (/share with|send this/i.test(lower)) {
    ctaType = "share_with_friend";
  } else if (/comment|drop .* below|what do you think/i.test(lower)) {
    ctaType = "comment_opinion";
  } else if (/follow @?nexsaicommunity|join @?nexsaicommunity/i.test(lower)) {
    ctaType = "follow_community";
  }

  // Extract clean topic summary from first non-empty line
  const cleanTopic =
    firstLine
      .replace(/[^\p{L}\p{N}\s:,\-?!.%]/gu, "")
      .trim()
      .slice(0, 80) || "General AI & Tech Post";

  const matchedPillarObj = DEFAULT_BRAND_MEMORY.content_pillars.find(
    (p) => p.id === bestPillar
  );

  return {
    media_id: input.media_id,
    topic: cleanTopic,
    content_pillar: bestPillar,
    format: input.media_type,
    audience: "Tech enthusiasts, students, and AI builders",
    goal: matchedPillarObj?.primary_goal ?? "engagement",
    hook_type: hookType,
    cta_type: ctaType,
    classified_at: new Date().toISOString(),
  };
}

