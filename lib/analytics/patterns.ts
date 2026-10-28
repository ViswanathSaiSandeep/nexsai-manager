import type {
  ContentClassificationRecord,
  LearnedObservationRecord,
  MediaRecord,
  PerformanceSnapshotRecord,
} from "../database/schema";
import { round2, safeAverage } from "./metrics";

export interface EnrichedMediaPerformance {
  media: MediaRecord;
  performance: PerformanceSnapshotRecord;
  classification: ContentClassificationRecord;
}

export interface GroupPerformanceSummary {
  key: string;
  post_count: number;
  avg_views: number | null;
  avg_reach: number | null;
  avg_likes: number | null;
  avg_comments: number | null;
  avg_saves: number | null;
  avg_shares: number | null;
  avg_total_interactions: number | null;
  avg_engagement_rate_pct: number | null;
  avg_save_rate_pct: number | null;
}

export interface DetectedPatternsReport {
  by_format: GroupPerformanceSummary[];
  by_pillar: GroupPerformanceSummary[];
  by_hook_type: GroupPerformanceSummary[];
  by_posting_hour_utc: GroupPerformanceSummary[];
  content_gaps: Array<{
    pillar_id: string;
    pillar_name: string;
    target_share_pct: number;
    actual_share_pct: number;
    gap_description: string;
  }>;
  extracted_observations: Omit<LearnedObservationRecord, "id" | "created_at">[];
}

function summarizeGroup(
  key: string,
  items: EnrichedMediaPerformance[]
): GroupPerformanceSummary {
  return {
    key,
    post_count: items.length,
    avg_views: safeAverage(items.map((i) => i.performance.views)),
    avg_reach: safeAverage(items.map((i) => i.performance.reach)),
    avg_likes: safeAverage(items.map((i) => i.performance.likes)),
    avg_comments: safeAverage(items.map((i) => i.performance.comments)),
    avg_saves: safeAverage(items.map((i) => i.performance.saves)),
    avg_shares: safeAverage(items.map((i) => i.performance.shares)),
    avg_total_interactions: safeAverage(
      items.map((i) => i.performance.total_interactions)
    ),
    avg_engagement_rate_pct: safeAverage(
      items.map((i) => i.performance.engagement_rate_pct)
    ),
    avg_save_rate_pct: safeAverage(
      items.map((i) => i.performance.save_rate_pct)
    ),
  };
}

/**
 * Analyzes enriched posts to detect patterns across format, content pillar, hook style,
 * and posting time, plus content pillar gaps.
 */
export function detectContentPatterns(
  items: EnrichedMediaPerformance[],
  pillarConfigs: Array<{ id: string; name: string; target_share_pct: number }>
): DetectedPatternsReport {
  const formatMap = new Map<string, EnrichedMediaPerformance[]>();
  const pillarMap = new Map<string, EnrichedMediaPerformance[]>();
  const hookMap = new Map<string, EnrichedMediaPerformance[]>();
  const hourMap = new Map<string, EnrichedMediaPerformance[]>();

  for (const item of items) {
    const fmt = item.media.media_type;
    formatMap.set(fmt, [...(formatMap.get(fmt) ?? []), item]);

    const pil = item.classification.content_pillar;
    pillarMap.set(pil, [...(pillarMap.get(pil) ?? []), item]);

    const hook = item.classification.hook_type;
    hookMap.set(hook, [...(hookMap.get(hook) ?? []), item]);

    const pubDate = new Date(item.media.published_at);
    if (!Number.isNaN(pubDate.getTime())) {
      const hourBucket = `${String(pubDate.getUTCHours()).padStart(2, "0")}:00 UTC`;
      hourMap.set(hourBucket, [...(hourMap.get(hourBucket) ?? []), item]);
    }
  }

  const byFormat = Array.from(formatMap.entries())
    .map(([k, grp]) => summarizeGroup(k, grp))
    .sort((a, b) => (b.avg_engagement_rate_pct ?? 0) - (a.avg_engagement_rate_pct ?? 0));

  const byPillar = Array.from(pillarMap.entries())
    .map(([k, grp]) => summarizeGroup(k, grp))
    .sort((a, b) => (b.avg_engagement_rate_pct ?? 0) - (a.avg_engagement_rate_pct ?? 0));

  const byHookType = Array.from(hookMap.entries())
    .map(([k, grp]) => summarizeGroup(k, grp))
    .sort((a, b) => (b.avg_engagement_rate_pct ?? 0) - (a.avg_engagement_rate_pct ?? 0));

  const byHour = Array.from(hourMap.entries())
    .map(([k, grp]) => summarizeGroup(k, grp))
    .sort((a, b) => (b.avg_reach ?? 0) - (a.avg_reach ?? 0));

  // Identify content pillar gaps
  const totalPosts = Math.max(items.length, 1);
  const contentGaps = pillarConfigs
    .map((p) => {
      const count = pillarMap.get(p.id)?.length ?? 0;
      const actualPct = round2((count / totalPosts) * 100);
      const deficit = round2(p.target_share_pct - actualPct);
      return {
        pillar_id: p.id,
        pillar_name: p.name,
        target_share_pct: p.target_share_pct,
        actual_share_pct: actualPct,
        deficit,
        gap_description:
          count === 0
            ? `Pillar '${p.name}' has 0 posts in the analyzed sample (target share: ${p.target_share_pct}%). High priority to cover.`
            : deficit > 5
            ? `Pillar '${p.name}' is under-represented (${actualPct}% actual vs ${p.target_share_pct}% target).`
            : `Pillar '${p.name}' is well-covered (${actualPct}% actual vs ${p.target_share_pct}% target).`,
      };
    })
    .filter((g) => g.deficit > 0)
    .sort((a, b) => b.deficit - a.deficit)
    .map((g) => ({
      pillar_id: g.pillar_id,
      pillar_name: g.pillar_name,
      target_share_pct: g.target_share_pct,
      actual_share_pct: g.actual_share_pct,
      gap_description: g.gap_description,
    }));

  const extractedObservations: Omit<
    LearnedObservationRecord,
    "id" | "created_at"
  >[] = [];

  const confidence: LearnedObservationRecord["confidence"] =
    items.length >= 20
      ? "strong"
      : items.length >= 8
      ? "moderate"
      : "low_sample_descriptive";

  if (byFormat.length >= 2) {
    const topFmt = byFormat[0];
    const secondFmt = byFormat[1];
    extractedObservations.push({
      category: "format",
      observation: `${topFmt.key} currently leads in average engagement rate (${topFmt.avg_engagement_rate_pct ?? 0}%) and views (${topFmt.avg_views ?? 0}) compared to ${secondFmt.key} (${secondFmt.avg_engagement_rate_pct ?? 0}%).`,
      evidence_summary: `Based on ${items.length} analyzed posts (${topFmt.key}: n=${topFmt.post_count}, ${secondFmt.key}: n=${secondFmt.post_count}).`,
      sample_size: items.length,
      confidence,
    });
  }

  if (byHookType.length >= 1) {
    const topHook = byHookType[0];
    extractedObservations.push({
      category: "hook",
      observation: `Posts using '${topHook.key}' hooks average ${topHook.avg_engagement_rate_pct ?? 0}% engagement rate and ${topHook.avg_reach ?? 0} reach.`,
      evidence_summary: `Based on n=${topHook.post_count} post(s) using '${topHook.key}'.`,
      sample_size: items.length,
      confidence,
    });
  }

  return {
    by_format: byFormat,
    by_pillar: byPillar,
    by_hook_type: byHookType,
    by_posting_hour_utc: byHour,
    content_gaps: contentGaps,
    extracted_observations: extractedObservations,
  };
}

