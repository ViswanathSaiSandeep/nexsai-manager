import { instagramGraphRequest } from "./client";
import { getInstagramMediaDetails, listInstagramMedia } from "./media";
import { getInstagramProfile } from "./profile";
import type {
  InstagramAccountInsightsResult,
  InstagramMediaInsightsResult,
  InstagramRawInsightMetric,
} from "./types";

/**
 * Supported Media Insight metrics in Graph API v24.0 (`graph.instagram.com`).
 * Note: Meta deprecated `impressions`, `plays`, and `video_views` in v22.0+,
 * replacing them with `views`.
 */
export const SUPPORTED_MEDIA_METRICS = [
  "views",
  "reach",
  "saved",
  "shares",
  "likes",
  "comments",
  "total_interactions",
] as const;

export type SupportedMediaMetric = (typeof SUPPORTED_MEDIA_METRICS)[number];

const DEPRECATED_MEDIA_METRIC_EXPLANATIONS: Record<string, string> = {
  impressions:
    "Deprecated by Meta in Graph API v22.0+ (April 2025). Replaced by the unified 'views' metric.",
  plays:
    "Deprecated by Meta in Graph API v22.0+. Replaced by the unified 'views' metric.",
  video_views:
    "Deprecated by Meta in Graph API v22.0+. Replaced by the unified 'views' metric.",
  engagement:
    "Deprecated on newer Graph API versions. Use 'total_interactions' instead.",
};

/**
 * Supported Account Insight metrics for `metric_type=total_value` in v24.0.
 */
export const SUPPORTED_ACCOUNT_TOTAL_METRICS = [
  "views",
  "reach",
  "accounts_engaged",
  "total_interactions",
  "likes",
  "comments",
  "saves",
  "shares",
  "profile_links_taps",
  "follows_and_unfollows",
] as const;

/**
 * Supported Account Insight metrics for `metric_type=time_series` in v24.0.
 */
export const SUPPORTED_ACCOUNT_TIMESERIES_METRICS = [
  "reach",
  "follower_count",
] as const;

interface RawInsightsResponse {
  data?: InstagramRawInsightMetric[];
}

/**
 * Retrieves insights for a specific Instagram media post (`/{media_id}/insights`).
 * Never invents metrics; clearly reports any deprecated or unavailable metrics.
 */
export async function getInstagramMediaInsights(
  params: {
    media_id: string;
    metrics?: string[];
    skip_media_details?: boolean;
  },
  toolName = "instagram_media_insights"
): Promise<InstagramMediaInsightsResult> {
  const requested =
    params.metrics && params.metrics.length > 0
      ? params.metrics.map((m) => m.trim().toLowerCase())
      : [...SUPPORTED_MEDIA_METRICS];

  const validMetrics: string[] = [];
  const unavailableMetrics: Array<{ metric: string; reason: string }> = [];

  for (const metric of requested) {
    if ((SUPPORTED_MEDIA_METRICS as readonly string[]).includes(metric)) {
      if (!validMetrics.includes(metric)) {
        validMetrics.push(metric);
      }
    } else if (metric in DEPRECATED_MEDIA_METRIC_EXPLANATIONS) {
      unavailableMetrics.push({
        metric,
        reason: DEPRECATED_MEDIA_METRIC_EXPLANATIONS[metric],
      });
      // Automatically ensure 'views' or 'total_interactions' is fetched if they asked for a deprecated equivalent
      if (
        (metric === "impressions" ||
          metric === "plays" ||
          metric === "video_views") &&
        !validMetrics.includes("views")
      ) {
        validMetrics.push("views");
      }
      if (
        metric === "engagement" &&
        !validMetrics.includes("total_interactions")
      ) {
        validMetrics.push("total_interactions");
      }
    } else {
      unavailableMetrics.push({
        metric,
        reason: `Metric '${metric}' is not a supported Instagram Graph API v24.0 media insight metric. Supported metrics: ${SUPPORTED_MEDIA_METRICS.join(
          ", "
        )}.`,
      });
    }
  }

  // Fetch media metadata alongside insights unless skipped (e.g. when called from analyzeInstagramContent)
  const mediaMetaPromise = params.skip_media_details
    ? Promise.resolve(null)
    : getInstagramMediaDetails(params.media_id, toolName).catch(() => null);

  let rawInsights: RawInsightsResponse = { data: [] };

  if (validMetrics.length > 0) {
    try {
      rawInsights = await instagramGraphRequest<RawInsightsResponse>({
        path: `/${encodeURIComponent(params.media_id)}/insights`,
        method: "GET",
        queryParams: {
          metric: validMetrics.join(","),
        },
        operationName: "getInstagramMediaInsights",
        toolName,
      });
    } catch (err) {
      // If a subset of metrics failed (e.g., on a STORY or unsupported media product type),
      // query metrics individually or fallback to core metrics so available ones still return
      const coreFallback = ["views", "reach", "saved", "shares", "total_interactions"].filter(
        (m) => validMetrics.includes(m)
      );
      if (coreFallback.length > 0) {
        rawInsights = await instagramGraphRequest<RawInsightsResponse>({
          path: `/${encodeURIComponent(params.media_id)}/insights`,
          method: "GET",
          queryParams: {
            metric: coreFallback.join(","),
          },
          operationName: "getInstagramMediaInsights:fallback",
          toolName,
        });
      } else {
        throw err;
      }
    }
  }

  const mediaMeta = await mediaMetaPromise;
  const metricsMap: Record<string, number | null> = {};
  const metricDetails: InstagramMediaInsightsResult["metric_details"] = [];

  for (const item of rawInsights.data ?? []) {
    const firstVal = item.values?.[0]?.value;
    const numericVal =
      typeof firstVal === "number"
        ? firstVal
        : typeof item.total_value?.value === "number"
        ? item.total_value.value
        : null;

    metricsMap[item.name] = numericVal;
    metricDetails.push({
      name: item.name,
      value: numericVal,
      period: item.period,
      title: item.title,
      description: item.description,
    });
  }

  for (const requestedMetric of validMetrics) {
    if (!(requestedMetric in metricsMap)) {
      unavailableMetrics.push({
        metric: requestedMetric,
        reason:
          "Not returned by the Instagram Graph API for this media item or media type.",
      });
    }
  }

  return {
    media_id: params.media_id,
    ...(mediaMeta
      ? {
          media_type: mediaMeta.media_type,
          media_product_type: mediaMeta.media_product_type,
          permalink: mediaMeta.permalink,
          timestamp: mediaMeta.timestamp,
        }
      : {}),
    metrics: metricsMap,
    metric_details: metricDetails,
    unavailable_metrics: unavailableMetrics,
  };
}

/**
 * Retrieves account-level insights (`/me/insights`).
 */
export async function getInstagramAccountInsights(
  params: {
    period?: "day" | "week" | "days_28";
    metric_type?: "total_value" | "time_series";
    metrics?: string[];
    since?: number;
    until?: number;
  } = {},
  toolName = "instagram_account_insights"
): Promise<InstagramAccountInsightsResult> {
  const period = params.period ?? "day";
  const metricType = params.metric_type ?? "total_value";

  const defaultMetrics =
    metricType === "total_value"
      ? [
          "views",
          "reach",
          "accounts_engaged",
          "total_interactions",
          "likes",
          "comments",
          "saves",
          "shares",
          "profile_links_taps",
        ]
      : ["reach"];

  const requested =
    params.metrics && params.metrics.length > 0
      ? params.metrics.map((m) => m.trim().toLowerCase())
      : defaultMetrics;

  const validMetrics: string[] = [];
  const unavailableMetrics: Array<{ metric: string; reason: string }> = [];

  for (const m of requested) {
    if (m === "impressions") {
      unavailableMetrics.push({
        metric: "impressions",
        reason:
          "Deprecated by Meta in Graph API v22.0+. Replaced by 'views' with metric_type=total_value.",
      });
      if (metricType === "total_value" && !validMetrics.includes("views")) {
        validMetrics.push("views");
      }
      continue;
    }

    if (metricType === "total_value") {
      if (
        (SUPPORTED_ACCOUNT_TOTAL_METRICS as readonly string[]).includes(m)
      ) {
        validMetrics.push(m);
      } else {
        unavailableMetrics.push({
          metric: m,
          reason: `Metric '${m}' is not supported with metric_type='total_value'. Supported total_value metrics: ${SUPPORTED_ACCOUNT_TOTAL_METRICS.join(
            ", "
          )}.`,
        });
      }
    } else {
      if (
        (SUPPORTED_ACCOUNT_TIMESERIES_METRICS as readonly string[]).includes(m)
      ) {
        validMetrics.push(m);
      } else {
        unavailableMetrics.push({
          metric: m,
          reason: `Metric '${m}' does not support metric_type='time_series' in Graph API v24.0 (use metric_type='total_value' instead).`,
        });
      }
    }
  }

  let rawInsights: RawInsightsResponse = { data: [] };

  if (validMetrics.length > 0) {
    rawInsights = await instagramGraphRequest<RawInsightsResponse>({
      path: "/me/insights",
      method: "GET",
      queryParams: {
        metric: validMetrics.join(","),
        period,
        ...(metricType === "total_value" ? { metric_type: "total_value" } : {}),
        ...(params.since ? { since: params.since } : {}),
        ...(params.until ? { until: params.until } : {}),
      },
      operationName: "getInstagramAccountInsights",
      toolName,
    });
  }

  const summaryMetrics: Record<string, number | null> = {};
  const formattedMetrics: InstagramAccountInsightsResult["metrics"] = [];

  for (const item of rawInsights.data ?? []) {
    const totalVal =
      typeof item.total_value?.value === "number"
        ? item.total_value.value
        : undefined;
    const latestSeriesVal =
      item.values && item.values.length > 0
        ? item.values[item.values.length - 1]?.value
        : undefined;

    summaryMetrics[item.name] =
      totalVal !== undefined
        ? totalVal
        : typeof latestSeriesVal === "number"
        ? latestSeriesVal
        : null;

    formattedMetrics.push({
      name: item.name,
      period: item.period,
      ...(totalVal !== undefined ? { total_value: totalVal } : {}),
      ...(item.values ? { values: item.values } : {}),
      title: item.title,
      description: item.description,
    });
  }

  return {
    period,
    metric_type: metricType,
    ...(params.since
      ? { since: new Date(params.since * 1000).toISOString() }
      : {}),
    ...(params.until
      ? { until: new Date(params.until * 1000).toISOString() }
      : {}),
    summary_metrics: summaryMetrics,
    metrics: formattedMetrics,
    unavailable_metrics: unavailableMetrics,
  };
}

export interface ContentAnalysisPostItem {
  id: string;
  timestamp: string;
  permalink: string;
  media_type: string;
  media_product_type?: string;
  caption_preview: string;
  caption_length: number;
  hashtag_count: number;
  observed_metrics: {
    views: number | null;
    reach: number | null;
    likes: number;
    comments: number;
    saved: number | null;
    shares: number | null;
    total_interactions: number | null;
  };
  calculated_metrics: {
    engagement_rate_by_reach_pct: number | null;
    engagement_rate_by_views_pct: number | null;
    save_rate_by_reach_pct: number | null;
    share_rate_by_reach_pct: number | null;
  };
}

export interface InstagramContentAnalysisResult {
  account_context: {
    username: string;
    account_type?: string;
    followers_count?: number;
    total_media_count?: number;
  };
  sample_size: number;
  methodology_note: string;
  observed_data: {
    posts: ContentAnalysisPostItem[];
  };
  calculated_metrics: {
    averages: {
      avg_views: number | null;
      avg_reach: number | null;
      avg_likes: number;
      avg_comments: number;
      avg_saved: number | null;
      avg_shares: number | null;
      avg_total_interactions: number | null;
      avg_engagement_rate_by_reach_pct: number | null;
    };
    by_media_type: Record<
      string,
      {
        post_count: number;
        avg_views: number | null;
        avg_reach: number | null;
        avg_total_interactions: number | null;
        avg_engagement_rate_by_reach_pct: number | null;
      }
    >;
    top_performing_posts: {
      by_total_interactions: Array<{
        id: string;
        permalink: string;
        media_type: string;
        total_interactions: number;
        reach: number | null;
        views: number | null;
        caption_preview: string;
      }>;
      by_reach: Array<{
        id: string;
        permalink: string;
        media_type: string;
        reach: number;
        total_interactions: number | null;
        caption_preview: string;
      }>;
      by_engagement_rate_on_reach: Array<{
        id: string;
        permalink: string;
        media_type: string;
        engagement_rate_by_reach_pct: number;
        reach: number;
        total_interactions: number;
        caption_preview: string;
      }>;
    };
  };
  recommendations_and_observations: {
    data_sufficiency_warning?: string;
    observations: string[];
    suggested_next_steps_for_claude: string[];
  };
}

function round2(val: number): number {
  return Math.round(val * 100) / 100;
}

function averageNonNull(values: Array<number | null>): number | null {
  const valid = values.filter((v): v is number => typeof v === "number");
  if (valid.length === 0) return null;
  return round2(valid.reduce((acc, v) => acc + v, 0) / valid.length);
}

/**
 * Phase 8 — Retrieves recent Instagram media and their insights, returning a structured
 * analysis that clearly separates:
 * 1. `observed_data` (raw metrics returned by Meta)
 * 2. `calculated_metrics` (derived rates, averages, rankings, media-type breakdowns)
 * 3. `recommendations_and_observations` (evidence-based notes with explicit caveats against claiming causation from small samples)
 */
export async function analyzeInstagramContent(
  params: { limit?: number } = {},
  toolName = "instagram_analyze_content"
): Promise<InstagramContentAnalysisResult> {
  const limit = Math.min(Math.max(params.limit ?? 10, 1), 25);

  const [profile, mediaList] = await Promise.all([
    getInstagramProfile(toolName),
    listInstagramMedia({ limit }, toolName),
  ]);

  const items = mediaList.data;

  // Fetch insights for each post in parallel (bounded)
  const postInsights = await Promise.all(
    items.map(async (item) => {
      try {
        return await getInstagramMediaInsights(
          { media_id: item.id, skip_media_details: true },
          toolName
        );
      } catch {
        return null;
      }
    })
  );

  const analyzedPosts: ContentAnalysisPostItem[] = items.map((item, idx) => {
    const ins = postInsights[idx];
    const views = ins?.metrics.views ?? null;
    const reach = ins?.metrics.reach ?? null;
    const saved = ins?.metrics.saved ?? null;
    const shares = ins?.metrics.shares ?? null;
    const likes =
      typeof ins?.metrics.likes === "number"
        ? ins.metrics.likes
        : item.like_count ?? 0;
    const comments =
      typeof ins?.metrics.comments === "number"
        ? ins.metrics.comments
        : item.comments_count ?? 0;
    const totalInteractions =
      typeof ins?.metrics.total_interactions === "number"
        ? ins.metrics.total_interactions
        : likes + comments + (saved ?? 0) + (shares ?? 0);

    const engagementRateByReach =
      reach && reach > 0 && totalInteractions !== null
        ? round2((totalInteractions / reach) * 100)
        : null;

    const engagementRateByViews =
      views && views > 0 && totalInteractions !== null
        ? round2((totalInteractions / views) * 100)
        : null;

    const saveRateByReach =
      reach && reach > 0 && saved !== null
        ? round2((saved / reach) * 100)
        : null;

    const shareRateByReach =
      reach && reach > 0 && shares !== null
        ? round2((shares / reach) * 100)
        : null;

    const captionText = item.caption ?? "";
    const hashtagMatches = captionText.match(/#[\p{L}\p{N}_]+/gu);

    return {
      id: item.id,
      timestamp: item.timestamp,
      permalink: item.permalink,
      media_type: item.media_type,
      media_product_type: item.media_product_type,
      caption_preview:
        captionText.length > 140
          ? `${captionText.slice(0, 140)}...`
          : captionText,
      caption_length: captionText.length,
      hashtag_count: hashtagMatches ? hashtagMatches.length : 0,
      observed_metrics: {
        views,
        reach,
        likes,
        comments,
        saved,
        shares,
        total_interactions: totalInteractions,
      },
      calculated_metrics: {
        engagement_rate_by_reach_pct: engagementRateByReach,
        engagement_rate_by_views_pct: engagementRateByViews,
        save_rate_by_reach_pct: saveRateByReach,
        share_rate_by_reach_pct: shareRateByReach,
      },
    };
  });

  // Group by media_type
  const byMediaType: InstagramContentAnalysisResult["calculated_metrics"]["by_media_type"] =
    {};
  const mediaGroups = new Map<string, ContentAnalysisPostItem[]>();
  for (const post of analyzedPosts) {
    const group = mediaGroups.get(post.media_type) ?? [];
    group.push(post);
    mediaGroups.set(post.media_type, group);
  }

  for (const [mType, group] of mediaGroups.entries()) {
    byMediaType[mType] = {
      post_count: group.length,
      avg_views: averageNonNull(group.map((p) => p.observed_metrics.views)),
      avg_reach: averageNonNull(group.map((p) => p.observed_metrics.reach)),
      avg_total_interactions: averageNonNull(
        group.map((p) => p.observed_metrics.total_interactions)
      ),
      avg_engagement_rate_by_reach_pct: averageNonNull(
        group.map((p) => p.calculated_metrics.engagement_rate_by_reach_pct)
      ),
    };
  }

  const byInteractions = [...analyzedPosts]
    .sort(
      (a, b) =>
        (b.observed_metrics.total_interactions ?? 0) -
        (a.observed_metrics.total_interactions ?? 0)
    )
    .slice(0, 3)
    .map((p) => ({
      id: p.id,
      permalink: p.permalink,
      media_type: p.media_type,
      total_interactions: p.observed_metrics.total_interactions ?? 0,
      reach: p.observed_metrics.reach,
      views: p.observed_metrics.views,
      caption_preview: p.caption_preview,
    }));

  const byReach = [...analyzedPosts]
    .filter((p) => typeof p.observed_metrics.reach === "number")
    .sort(
      (a, b) =>
        (b.observed_metrics.reach ?? 0) - (a.observed_metrics.reach ?? 0)
    )
    .slice(0, 3)
    .map((p) => ({
      id: p.id,
      permalink: p.permalink,
      media_type: p.media_type,
      reach: p.observed_metrics.reach ?? 0,
      total_interactions: p.observed_metrics.total_interactions,
      caption_preview: p.caption_preview,
    }));

  const byEngRate = [...analyzedPosts]
    .filter(
      (p) =>
        typeof p.calculated_metrics.engagement_rate_by_reach_pct === "number" &&
        (p.observed_metrics.reach ?? 0) >= 5
    )
    .sort(
      (a, b) =>
        (b.calculated_metrics.engagement_rate_by_reach_pct ?? 0) -
        (a.calculated_metrics.engagement_rate_by_reach_pct ?? 0)
    )
    .slice(0, 3)
    .map((p) => ({
      id: p.id,
      permalink: p.permalink,
      media_type: p.media_type,
      engagement_rate_by_reach_pct:
        p.calculated_metrics.engagement_rate_by_reach_pct ?? 0,
      reach: p.observed_metrics.reach ?? 0,
      total_interactions: p.observed_metrics.total_interactions ?? 0,
      caption_preview: p.caption_preview,
    }));

  const observations: string[] = [];
  if (analyzedPosts.length === 0) {
    observations.push("No published posts were found in the sample.");
  } else {
    observations.push(
      `Analyzed ${analyzedPosts.length} recent post(s) across ${mediaGroups.size} format(s): ${Array.from(
        mediaGroups.keys()
      ).join(", ")}.`
    );
    if (byInteractions[0]) {
      observations.push(
        `Highest total interactions in sample: post ${byInteractions[0].id} (${byInteractions[0].media_type}) with ${byInteractions[0].total_interactions} interactions.`
      );
    }
    if (byReach[0]) {
      observations.push(
        `Highest reach in sample: post ${byReach[0].id} (${byReach[0].media_type}) reaching ${byReach[0].reach} unique accounts.`
      );
    }
  }

  const dataSufficiencyWarning =
    analyzedPosts.length < 15
      ? `Sample size is ${analyzedPosts.length} post(s). Metrics show descriptive correlations within this recent window only — do not claim causal rules without larger controlled testing.`
      : undefined;

  return {
    account_context: {
      username: profile.username,
      account_type: profile.account_type,
      followers_count: profile.followers_count,
      total_media_count: profile.media_count,
    },
    sample_size: analyzedPosts.length,
    methodology_note:
      "Observed data comes directly from the Instagram Graph API (v24.0). Calculated metrics are arithmetic ratios (e.g., total_interactions / reach). Correlation in a small sample does not imply causation.",
    observed_data: {
      posts: analyzedPosts,
    },
    calculated_metrics: {
      averages: {
        avg_views: averageNonNull(
          analyzedPosts.map((p) => p.observed_metrics.views)
        ),
        avg_reach: averageNonNull(
          analyzedPosts.map((p) => p.observed_metrics.reach)
        ),
        avg_likes:
          averageNonNull(analyzedPosts.map((p) => p.observed_metrics.likes)) ??
          0,
        avg_comments:
          averageNonNull(
            analyzedPosts.map((p) => p.observed_metrics.comments)
          ) ?? 0,
        avg_saved: averageNonNull(
          analyzedPosts.map((p) => p.observed_metrics.saved)
        ),
        avg_shares: averageNonNull(
          analyzedPosts.map((p) => p.observed_metrics.shares)
        ),
        avg_total_interactions: averageNonNull(
          analyzedPosts.map((p) => p.observed_metrics.total_interactions)
        ),
        avg_engagement_rate_by_reach_pct: averageNonNull(
          analyzedPosts.map(
            (p) => p.calculated_metrics.engagement_rate_by_reach_pct
          )
        ),
      },
      by_media_type: byMediaType,
      top_performing_posts: {
        by_total_interactions: byInteractions,
        by_reach: byReach,
        by_engagement_rate_on_reach: byEngRate,
      },
    },
    recommendations_and_observations: {
      ...(dataSufficiencyWarning
        ? { data_sufficiency_warning: dataSufficiencyWarning }
        : {}),
      observations,
      suggested_next_steps_for_claude: [
        "Compare the hooks and topics of the top_performing_posts against lower-reach posts.",
        "Examine format differences in by_media_type (e.g., CAROUSEL_ALBUM vs IMAGE vs VIDEO/REELS) while noting sample size per format.",
        "Pay special attention to saves and shares as high-intent signals when suggesting future content topics.",
      ],
    },
  };
}

