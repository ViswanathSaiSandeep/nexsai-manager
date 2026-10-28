import {
  getInstagramAccountInsights,
  getInstagramMediaDetails,
  getInstagramMediaInsights,
  getInstagramProfile,
  listInstagramMedia,
} from "../instagram";
import {
  loadDatabaseState,
  recordPerformanceSnapshot,
  upsertAccountRecord,
  upsertContentClassification,
  upsertLearnedObservation,
  upsertMediaRecord,
} from "../database/store";
import {
  calculatePostRates,
  classifyInstagramPost,
  round2,
  safeAverage,
} from "./metrics";
import {
  detectContentPatterns,
  type EnrichedMediaPerformance,
} from "./patterns";

let cachedSnapshotPromise: {
  timestampMs: number;
  limit: number;
  result: {
    account: {
      username: string;
      account_type?: string;
      followers_count?: number;
      follows_count?: number;
      media_count?: number;
    };
    enriched_posts: EnrichedMediaPerformance[];
    account_day_insights: Record<string, number | null>;
  };
} | null = null;

const SNAPSHOT_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Syncs live Instagram profile, recent media, classifications, and insights into
 * the NEXSAI V2 persistent database, and updates the learning loop observations.
 * Reuses a fresh snapshot within 2 minutes unless `force_refresh` is set.
 */
export async function captureAnalyticsSnapshot(
  params: { limit?: number; force_refresh?: boolean } = {},
  toolName = "instagram_analyze_content"
): Promise<{
  account: {
    username: string;
    account_type?: string;
    followers_count?: number;
    follows_count?: number;
    media_count?: number;
  };
  enriched_posts: EnrichedMediaPerformance[];
  account_day_insights: Record<string, number | null>;
}> {
  const limit = Math.min(Math.max(params.limit ?? 10, 1), 25);

  if (
    !params.force_refresh &&
    cachedSnapshotPromise &&
    Date.now() - cachedSnapshotPromise.timestampMs < SNAPSHOT_CACHE_TTL_MS &&
    cachedSnapshotPromise.limit >= limit
  ) {
    return {
      ...cachedSnapshotPromise.result,
      enriched_posts: cachedSnapshotPromise.result.enriched_posts.slice(
        0,
        limit
      ),
    };
  }

  const [profile, mediaList, accountInsights] = await Promise.all([
    getInstagramProfile(toolName),
    listInstagramMedia({ limit }, toolName),
    getInstagramAccountInsights(
      { period: "day", metric_type: "total_value" },
      toolName
    ).catch(() => null),
  ]);

  await upsertAccountRecord({
    platform: "instagram",
    platform_user_id: profile.id,
    username: profile.username,
    name: profile.name,
    account_type: profile.account_type ?? "MEDIA_CREATOR",
    followers_count: profile.followers_count,
    follows_count: profile.follows_count,
    media_count: profile.media_count,
    biography: profile.biography,
    website: profile.website,
  });

  const rawPosts = mediaList.data;

  const postInsightsList = await Promise.all(
    rawPosts.map((post) =>
      getInstagramMediaInsights(
        { media_id: post.id, skip_media_details: true },
        toolName
      ).catch(() => null)
    )
  );

  const enriched: EnrichedMediaPerformance[] = [];

  for (let i = 0; i < rawPosts.length; i++) {
    const item = rawPosts[i];
    const ins = postInsightsList[i];

    const mediaRec = await upsertMediaRecord({
      platform: "instagram",
      platform_media_id: item.id,
      media_type: item.media_type,
      media_product_type: item.media_product_type,
      caption: item.caption ?? "",
      permalink: item.permalink,
      media_url: item.media_url,
      published_at: item.timestamp,
    });

    const classification = await upsertContentClassification(
      classifyInstagramPost({
        media_id: item.id,
        caption: item.caption,
        media_type: item.media_type,
      })
    );

    const likes =
      typeof ins?.metrics.likes === "number"
        ? ins.metrics.likes
        : item.like_count ?? 0;
    const comments =
      typeof ins?.metrics.comments === "number"
        ? ins.metrics.comments
        : item.comments_count ?? 0;
    const saves =
      typeof ins?.metrics.saved === "number" ? ins.metrics.saved : null;
    const shares =
      typeof ins?.metrics.shares === "number" ? ins.metrics.shares : null;
    const views =
      typeof ins?.metrics.views === "number" ? ins.metrics.views : null;
    const reach =
      typeof ins?.metrics.reach === "number" ? ins.metrics.reach : null;
    const totalInteractions =
      typeof ins?.metrics.total_interactions === "number"
        ? ins.metrics.total_interactions
        : likes + comments + (saves ?? 0) + (shares ?? 0);

    const rates = calculatePostRates({
      likes,
      comments,
      saves,
      shares,
      views,
      reach,
      total_interactions: totalInteractions,
    });

    const perfRec = await recordPerformanceSnapshot({
      media_id: item.id,
      likes,
      comments,
      shares,
      saves,
      views,
      reach,
      total_interactions: totalInteractions,
      like_rate_pct: rates.like_rate_pct,
      comment_rate_pct: rates.comment_rate_pct,
      save_rate_pct: rates.save_rate_pct,
      share_rate_pct: rates.share_rate_pct,
      engagement_rate_pct: rates.engagement_rate_by_reach_pct,
    });

    enriched.push({
      media: mediaRec,
      performance: perfRec,
      classification,
    });
  }

  const result = {
    account: {
      username: profile.username,
      account_type: profile.account_type,
      followers_count: profile.followers_count,
      follows_count: profile.follows_count,
      media_count: profile.media_count,
    },
    enriched_posts: enriched,
    account_day_insights: accountInsights?.summary_metrics ?? {},
  };

  cachedSnapshotPromise = {
    timestampMs: Date.now(),
    limit,
    result,
  };

  return result;
}

/**
 * Full V2 Content Performance Analysis (`instagram_analyze_content` & `nexsai_analyze_account`).
 * Explicitly separates:
 * - OBSERVATION (raw empirical facts)
 * - CALCULATION (rates, averages, rankings)
 * - INFERENCE (pattern interpretation with sample-size confidence)
 * - RECOMMENDATION (actionable next steps)
 */
export async function runComprehensiveContentAnalysis(
  params: { limit?: number } = {},
  toolName = "instagram_analyze_content"
) {
  const snapshot = await captureAnalyticsSnapshot(params, toolName);
  const state = await loadDatabaseState();
  const posts = snapshot.enriched_posts;

  const patterns = detectContentPatterns(posts, state.brand.content_pillars);

  // Persist learned observations into the database learning loop
  for (const obs of patterns.extracted_observations) {
    await upsertLearnedObservation(obs);
  }

  const avgViews = safeAverage(posts.map((p) => p.performance.views));
  const avgReach = safeAverage(posts.map((p) => p.performance.reach));
  const avgLikes = safeAverage(posts.map((p) => p.performance.likes)) ?? 0;
  const avgComments =
    safeAverage(posts.map((p) => p.performance.comments)) ?? 0;
  const avgSaved = safeAverage(posts.map((p) => p.performance.saves));
  const avgShares = safeAverage(posts.map((p) => p.performance.shares));
  const avgInteractions = safeAverage(
    posts.map((p) => p.performance.total_interactions)
  );
  const avgEngRate = safeAverage(
    posts.map((p) => p.performance.engagement_rate_pct)
  );
  const avgLikeRate = safeAverage(
    posts.map((p) => p.performance.like_rate_pct)
  );
  const avgCommentRate = safeAverage(
    posts.map((p) => p.performance.comment_rate_pct)
  );
  const avgSaveRate = safeAverage(
    posts.map((p) => p.performance.save_rate_pct)
  );
  const avgShareRate = safeAverage(
    posts.map((p) => p.performance.share_rate_pct)
  );

  const mappedPosts = posts.map((p) => {
    const captionText = p.media.caption ?? "";
    const hashtagMatches = captionText.match(/#[\p{L}\p{N}_]+/gu);
    return {
      id: p.media.platform_media_id,
      timestamp: p.media.published_at,
      permalink: p.media.permalink,
      media_type: p.media.media_type,
      media_product_type: p.media.media_product_type,
      classification: p.classification,
      caption_preview:
        captionText.length > 140
          ? `${captionText.slice(0, 140)}...`
          : captionText,
      caption_length: captionText.length,
      hashtag_count: hashtagMatches ? hashtagMatches.length : 0,
      observed_metrics: {
        views: p.performance.views,
        reach: p.performance.reach,
        likes: p.performance.likes,
        comments: p.performance.comments,
        saved: p.performance.saves,
        shares: p.performance.shares,
        total_interactions: p.performance.total_interactions,
      },
      calculated_metrics: {
        like_rate_pct: p.performance.like_rate_pct,
        comment_rate_pct: p.performance.comment_rate_pct,
        save_rate_by_reach_pct: p.performance.save_rate_pct,
        share_rate_by_reach_pct: p.performance.share_rate_pct,
        engagement_rate_by_reach_pct: p.performance.engagement_rate_pct,
        engagement_rate_by_views_pct:
          p.performance.views &&
          p.performance.views > 0 &&
          p.performance.total_interactions !== null
            ? round2(
                (p.performance.total_interactions / p.performance.views) * 100
              )
            : null,
      },
    };
  });

  const byMediaTypeRecord: Record<
    string,
    {
      post_count: number;
      avg_views: number | null;
      avg_reach: number | null;
      avg_total_interactions: number | null;
      avg_engagement_rate_by_reach_pct: number | null;
    }
  > = {};
  for (const fmt of patterns.by_format) {
    byMediaTypeRecord[fmt.key] = {
      post_count: fmt.post_count,
      avg_views: fmt.avg_views,
      avg_reach: fmt.avg_reach,
      avg_total_interactions: fmt.avg_total_interactions,
      avg_engagement_rate_by_reach_pct: fmt.avg_engagement_rate_pct,
    };
  }

  const topByInteractions = [...mappedPosts]
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
      topic: p.classification.topic,
      content_pillar: p.classification.content_pillar,
      total_interactions: p.observed_metrics.total_interactions ?? 0,
      reach: p.observed_metrics.reach,
      views: p.observed_metrics.views,
      caption_preview: p.caption_preview,
    }));

  const topByReach = [...mappedPosts]
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
      topic: p.classification.topic,
      reach: p.observed_metrics.reach ?? 0,
      total_interactions: p.observed_metrics.total_interactions,
      caption_preview: p.caption_preview,
    }));

  const topByEngRate = [...mappedPosts]
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
      topic: p.classification.topic,
      engagement_rate_by_reach_pct:
        p.calculated_metrics.engagement_rate_by_reach_pct ?? 0,
      reach: p.observed_metrics.reach ?? 0,
      total_interactions: p.observed_metrics.total_interactions ?? 0,
      caption_preview: p.caption_preview,
    }));

  const observationFacts: string[] = [
    `Retrieved ${mappedPosts.length} recent post(s) for @${snapshot.account.username} (${snapshot.account.followers_count ?? "N/A"} followers, ${snapshot.account.media_count ?? "N/A"} total lifetime media).`,
  ];
  if (topByInteractions[0]) {
    observationFacts.push(
      `Top post by interactions: ${topByInteractions[0].id} (${topByInteractions[0].media_type}, pillar: ${topByInteractions[0].content_pillar}) with ${topByInteractions[0].total_interactions} total interactions, ${topByInteractions[0].views ?? "N/A"} views, and ${topByInteractions[0].reach ?? "N/A"} reach.`
    );
  }

  const inferences: string[] = patterns.extracted_observations.map(
    (o) => `[${o.confidence.toUpperCase()}] ${o.observation} (${o.evidence_summary})`
  );
  if (mappedPosts.length < 15) {
    inferences.push(
      `Sample size (n=${mappedPosts.length}) is descriptive of recent posts only; do not infer statistically significant causal laws without controlled A/B testing.`
    );
  }

  const recommendations: string[] = [
    ...(patterns.content_gaps.slice(0, 2).map((g) => g.gap_description)),
    "Include an explicit 'Save this guide for later' CTA on educational CAROUSEL_ALBUM posts to convert high view-to-reach ratios into bookmarks.",
    "Run a structured hook experiment comparing 'Top 3 Things...' numbered hooks against 'Ever wondered why...' curiosity hooks.",
  ];

  return {
    account_context: {
      username: snapshot.account.username,
      account_type: snapshot.account.account_type,
      followers_count: snapshot.account.followers_count,
      total_media_count: snapshot.account.media_count,
      account_day_insights: snapshot.account_day_insights,
    },
    sample_size: mappedPosts.length,
    methodology_note:
      "Strictly separates OBSERVATION (raw Graph API v24.0 responses), CALCULATION (arithmetic ratios with zero-denominator protection), INFERENCE (pattern synthesis with sample-size caveats), and RECOMMENDATION (strategic actions).",
    // Backwards-compatible keys + explicit V2 epistemic sections
    OBSERVATION: {
      summary: observationFacts,
      posts: mappedPosts,
      unavailable_api_metrics: [
        {
          metric: "impressions",
          reason:
            "Metric unavailable from current API permissions/version: Deprecated by Meta in v22.0+ in favor of 'views'.",
        },
        {
          metric: "follower_conversion_per_post",
          reason:
            "Metric unavailable from current API permissions: Per-post follower conversion is not exposed on standard IG media insights.",
        },
      ],
    },
    CALCULATION: {
      averages: {
        avg_views: avgViews,
        avg_reach: avgReach,
        avg_likes: avgLikes,
        avg_comments: avgComments,
        avg_saved: avgSaved,
        avg_shares: avgShares,
        avg_total_interactions: avgInteractions,
        avg_like_rate_pct: avgLikeRate,
        avg_comment_rate_pct: avgCommentRate,
        avg_save_rate_pct: avgSaveRate,
        avg_share_rate_pct: avgShareRate,
        avg_engagement_rate_by_reach_pct: avgEngRate,
      },
      by_media_type: byMediaTypeRecord,
      by_content_pillar: patterns.by_pillar,
      by_hook_type: patterns.by_hook_type,
      by_posting_hour_utc: patterns.by_posting_hour_utc,
      top_performing_posts: {
        by_total_interactions: topByInteractions,
        by_reach: topByReach,
        by_engagement_rate_on_reach: topByEngRate,
      },
    },
    INFERENCE: {
      sample_size_confidence:
        mappedPosts.length >= 20
          ? "strong"
          : mappedPosts.length >= 8
          ? "moderate"
          : "low_sample_descriptive",
      patterns: inferences,
      content_gaps: patterns.content_gaps,
    },
    RECOMMENDATION: {
      priorities: recommendations,
    },
    // Preserve V1 top-level fields so existing tests and callers never break
    observed_data: {
      posts: mappedPosts,
    },
    calculated_metrics: {
      averages: {
        avg_views: avgViews,
        avg_reach: avgReach,
        avg_likes: avgLikes,
        avg_comments: avgComments,
        avg_saved: avgSaved,
        avg_shares: avgShares,
        avg_total_interactions: avgInteractions,
        avg_engagement_rate_by_reach_pct: avgEngRate,
      },
      by_media_type: byMediaTypeRecord,
      top_performing_posts: {
        by_total_interactions: topByInteractions,
        by_reach: topByReach,
        by_engagement_rate_on_reach: topByEngRate,
      },
    },
    recommendations_and_observations: {
      data_sufficiency_warning:
        mappedPosts.length < 15
          ? `Sample size is ${mappedPosts.length} post(s). Metrics show descriptive correlations within this recent window only — do not claim causal rules without larger controlled testing.`
          : undefined,
      observations: observationFacts,
      suggested_next_steps_for_claude: recommendations,
    },
  };
}

/**
 * Post-Publish Benchmark Analyzer (`nexsai_analyze_post`).
 * Compares a single post against account averages, same format average, and same pillar average.
 */
export async function analyzeSinglePostAgainstBenchmarks(
  mediaId: string,
  toolName = "nexsai_analyze_post"
) {
  const [targetDetails, targetInsights, snapshot] = await Promise.all([
    getInstagramMediaDetails(mediaId, toolName),
    getInstagramMediaInsights({ media_id: mediaId, skip_media_details: true }, toolName),
    captureAnalyticsSnapshot({ limit: 15 }, toolName),
  ]);

  const targetClass = classifyInstagramPost({
    media_id: mediaId,
    caption: targetDetails.caption,
    media_type: targetDetails.media_type,
  });

  const likes =
    typeof targetInsights.metrics.likes === "number"
      ? targetInsights.metrics.likes
      : targetDetails.like_count ?? 0;
  const comments =
    typeof targetInsights.metrics.comments === "number"
      ? targetInsights.metrics.comments
      : targetDetails.comments_count ?? 0;
  const saves =
    typeof targetInsights.metrics.saved === "number"
      ? targetInsights.metrics.saved
      : 0;
  const shares =
    typeof targetInsights.metrics.shares === "number"
      ? targetInsights.metrics.shares
      : 0;
  const views =
    typeof targetInsights.metrics.views === "number"
      ? targetInsights.metrics.views
      : null;
  const reach =
    typeof targetInsights.metrics.reach === "number"
      ? targetInsights.metrics.reach
      : null;
  const totalInteractions =
    typeof targetInsights.metrics.total_interactions === "number"
      ? targetInsights.metrics.total_interactions
      : likes + comments + saves + shares;

  const rates = calculatePostRates({
    likes,
    comments,
    saves,
    shares,
    views,
    reach,
    total_interactions: totalInteractions,
  });

  const allPosts = snapshot.enriched_posts;
  const sameFormatPosts = allPosts.filter(
    (p) => p.media.media_type === targetDetails.media_type
  );
  const samePillarPosts = allPosts.filter(
    (p) => p.classification.content_pillar === targetClass.content_pillar
  );

  function pctDelta(actual: number | null, baseline: number | null): string {
    if (actual === null || baseline === null || baseline === 0) {
      return "N/A (insufficient baseline)";
    }
    const diff = round2(((actual - baseline) / baseline) * 100);
    return `${diff >= 0 ? "+" : ""}${diff}%`;
  }

  const accountAvgReach = safeAverage(allPosts.map((p) => p.performance.reach));
  const accountAvgViews = safeAverage(allPosts.map((p) => p.performance.views));
  const accountAvgInteractions = safeAverage(
    allPosts.map((p) => p.performance.total_interactions)
  );
  const formatAvgReach = safeAverage(
    sameFormatPosts.map((p) => p.performance.reach)
  );
  const formatAvgViews = safeAverage(
    sameFormatPosts.map((p) => p.performance.views)
  );
  const pillarAvgReach = safeAverage(
    samePillarPosts.map((p) => p.performance.reach)
  );

  const diagnosticSummary: string[] = [];
  if (reach !== null && accountAvgReach !== null && accountAvgReach > 0) {
    const reachDelta = round2(((reach - accountAvgReach) / accountAvgReach) * 100);
    diagnosticSummary.push(
      `Reach (${reach}) was ${Math.abs(reachDelta)}% ${
        reachDelta >= 0 ? "higher" : "lower"
      } than your recent account average (${accountAvgReach}).`
    );
  }
  if (views !== null && formatAvgViews !== null && formatAvgViews > 0) {
    const viewsDelta = round2(((views - formatAvgViews) / formatAvgViews) * 100);
    diagnosticSummary.push(
      `Views (${views}) were ${Math.abs(viewsDelta)}% ${
        viewsDelta >= 0 ? "higher" : "lower"
      } than your recent ${targetDetails.media_type} average (${formatAvgViews}).`
    );
  }

  return {
    media_id: mediaId,
    permalink: targetDetails.permalink,
    published_at: targetDetails.timestamp,
    media_type: targetDetails.media_type,
    classification: targetClass,
    OBSERVATION: {
      views,
      reach,
      likes,
      comments,
      saves,
      shares,
      total_interactions: totalInteractions,
    },
    CALCULATION: {
      rates,
      comparisons: {
        vs_account_average: {
          sample_size: allPosts.length,
          reach_delta: pctDelta(reach, accountAvgReach),
          views_delta: pctDelta(views, accountAvgViews),
          interactions_delta: pctDelta(totalInteractions, accountAvgInteractions),
        },
        vs_same_format: {
          format: targetDetails.media_type,
          sample_size: sameFormatPosts.length,
          reach_delta: pctDelta(reach, formatAvgReach),
          views_delta: pctDelta(views, formatAvgViews),
        },
        vs_same_pillar: {
          content_pillar: targetClass.content_pillar,
          sample_size: samePillarPosts.length,
          reach_delta: pctDelta(reach, pillarAvgReach),
        },
      },
    },
    INFERENCE: {
      diagnostic_summary: diagnosticSummary,
      strongest_signal:
        (views ?? 0) > (accountAvgViews ?? 0)
          ? "views (strong hook/swipe retention)"
          : (reach ?? 0) > (accountAvgReach ?? 0)
          ? "reach (strong distribution)"
          : "likes (steady core engagement)",
      weakest_signal:
        saves === 0
          ? "saves (0 saves — add explicit 'Save this guide' CTA on final slide)"
          : comments === 0
          ? "comments (0 comments — add a specific question prompt in the caption)"
          : "shares",
    },
    RECOMMENDATION: [
      saves === 0
        ? "Include a dedicated bookmark/save callout on the final slide so viewers save the reference."
        : "Continue reinforcing saveable checklist slides.",
      comments === 0
        ? "End the caption with a binary choice question (e.g., 'Are you using Tool A or Tool B?') to lower the friction to comment."
        : "Reply promptly to comments to compound thread engagement.",
    ],
  };
}
