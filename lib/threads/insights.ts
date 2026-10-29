import { threadsGraphRequest } from "./client";
import { getThreadsMediaDetails, listThreadsMedia } from "./media";
import { getThreadsProfile, getThreadsPublishingLimit } from "./profile";
import type {
  ThreadsAccountInsightsResult,
  ThreadsMediaInsightsResult,
  ThreadsRawInsightMetric,
} from "./types";
import {
  loadDatabaseState,
  recordPerformanceSnapshot,
  upsertContentClassification,
  upsertLearnedObservation,
} from "../database/store";
import {
  classifyInstagramPost,
  round2,
  safeAverage,
} from "../analytics/metrics";
import {
  detectContentPatterns,
  type EnrichedMediaPerformance,
} from "../analytics/patterns";
import { executeNexsaiResearch } from "../research/search";

export const DEFAULT_THREADS_MEDIA_METRICS = [
  "views",
  "likes",
  "replies",
  "reposts",
  "quotes",
  "shares",
] as const;

export const DEFAULT_THREADS_ACCOUNT_METRICS = [
  "views",
  "likes",
  "replies",
  "reposts",
  "quotes",
  "followers_count",
] as const;

function extractThreadsMetricValue(
  metric: ThreadsRawInsightMetric | undefined
): number | null {
  if (!metric) return null;
  if (typeof metric.total_value?.value === "number") {
    return metric.total_value.value;
  }
  if (metric.values && metric.values.length > 0) {
    // For time-series metrics like account `views`, sum across the returned period points
    const numericVals = metric.values
      .map((v) => v.value)
      .filter((v): v is number => typeof v === "number");
    if (numericVals.length > 0) {
      return numericVals.reduce((acc, n) => acc + n, 0);
    }
  }
  return null;
}

/**
 * Retrieves official Meta Threads API v1.0 insights for a single Threads post (`GET /v1.0/{media_id}/insights`).
 * Supported metrics: `views`, `likes`, `replies`, `reposts`, `quotes`, `shares`.
 */
export async function getThreadsMediaInsights(
  params: {
    media_id: string;
    metrics?: string[];
    skip_media_details?: boolean;
  },
  toolName = "threads_media_insights"
): Promise<ThreadsMediaInsightsResult> {
  const requestedMetrics =
    params.metrics && params.metrics.length > 0
      ? params.metrics
      : [...DEFAULT_THREADS_MEDIA_METRICS];

  const [rawInsights, details] = await Promise.all([
    threadsGraphRequest<{ data?: ThreadsRawInsightMetric[] }>({
      path: `/${encodeURIComponent(params.media_id)}/insights`,
      method: "GET",
      queryParams: {
        metric: requestedMetrics.join(","),
      },
      operationName: "getThreadsMediaInsights",
      toolName,
    }),
    params.skip_media_details
      ? Promise.resolve(null)
      : getThreadsMediaDetails(params.media_id, toolName).catch(() => null),
  ]);

  const rawList = rawInsights.data ?? [];
  const byName = new Map<string, ThreadsRawInsightMetric>();
  for (const m of rawList) {
    byName.set(m.name, m);
  }

  const views = extractThreadsMetricValue(byName.get("views"));
  const likes = extractThreadsMetricValue(byName.get("likes"));
  const replies = extractThreadsMetricValue(byName.get("replies"));
  const reposts = extractThreadsMetricValue(byName.get("reposts"));
  const quotes = extractThreadsMetricValue(byName.get("quotes"));
  const shares = extractThreadsMetricValue(byName.get("shares"));

  const hasAnyInteractionMetric =
    likes !== null ||
    replies !== null ||
    reposts !== null ||
    quotes !== null ||
    shares !== null;

  const totalInteractions = hasAnyInteractionMetric
    ? (likes ?? 0) +
      (replies ?? 0) +
      (reposts ?? 0) +
      (quotes ?? 0) +
      (shares ?? 0)
    : null;

  const unavailableMetrics: Array<{ metric: string; reason: string }> = [
    {
      metric: "reach",
      reason:
        "Unavailable on Threads Media Insights API v1.0: Meta Threads reports `views` per post rather than unique `reach`.",
    },
    {
      metric: "saves",
      reason:
        "Unavailable on Threads Media Insights API v1.0: Bookmark/save counts are not exposed on Threads post insights.",
    },
  ];

  return {
    media_id: params.media_id,
    ...(details?.media_type ? { media_type: details.media_type } : {}),
    ...(details?.permalink ? { permalink: details.permalink } : {}),
    ...(details?.timestamp ? { timestamp: details.timestamp } : {}),
    ...(details?.text
      ? { text_preview: details.text.slice(0, 140) }
      : {}),
    metrics: {
      views,
      likes,
      replies,
      reposts,
      quotes,
      shares,
      total_interactions: totalInteractions,
    },
    metric_details: rawList.map((m) => ({
      name: m.name,
      value: extractThreadsMetricValue(m),
      period: m.period,
      title: m.title,
      description: m.description,
    })),
    unavailable_metrics: unavailableMetrics,
  };
}

/**
 * Retrieves account-level Threads insights (`GET /v1.0/me/threads_insights`).
 * Supported metrics: `views`, `likes`, `replies`, `reposts`, `quotes`, `followers_count`.
 */
export async function getThreadsAccountInsights(
  params: {
    metrics?: string[];
    since?: number;
    until?: number;
  } = {},
  toolName = "threads_account_insights"
): Promise<ThreadsAccountInsightsResult> {
  const requested =
    params.metrics && params.metrics.length > 0
      ? params.metrics
      : [...DEFAULT_THREADS_ACCOUNT_METRICS];

  const raw = await threadsGraphRequest<{
    data?: ThreadsRawInsightMetric[];
  }>({
    path: "/me/threads_insights",
    method: "GET",
    queryParams: {
      metric: requested.join(","),
      ...(params.since ? { since: params.since } : {}),
      ...(params.until ? { until: params.until } : {}),
    },
    operationName: "getThreadsAccountInsights",
    toolName,
  });

  const list = raw.data ?? [];
  const byName = new Map<string, ThreadsRawInsightMetric>();
  for (const m of list) {
    byName.set(m.name, m);
  }

  return {
    ...(params.since ? { since: params.since } : {}),
    ...(params.until ? { until: params.until } : {}),
    summary_metrics: {
      views: extractThreadsMetricValue(byName.get("views")),
      likes: extractThreadsMetricValue(byName.get("likes")),
      replies: extractThreadsMetricValue(byName.get("replies")),
      reposts: extractThreadsMetricValue(byName.get("reposts")),
      quotes: extractThreadsMetricValue(byName.get("quotes")),
      followers_count: extractThreadsMetricValue(byName.get("followers_count")),
    },
    metrics: list.map((m) => ({
      name: m.name,
      period: m.period,
      total_value: m.total_value?.value,
      values: m.values,
      title: m.title,
      description: m.description,
    })),
    unavailable_metrics: [
      {
        metric: "follower_demographics",
        reason:
          "Conditional: Requires >= 100 Threads followers (`followers_count` is currently below threshold or requires breakdown parameter).",
      },
    ],
  };
}

/**
 * Syncs recent Threads posts and insights into the persistent V3 database and returns
 * an epistemic performance analysis (`OBSERVATION`, `CALCULATION`, `INFERENCE`, `RECOMMENDATION`).
 */
export async function analyzeThreadsPerformance(
  params: { limit?: number } = {},
  toolName = "nexsai_threads_analyze"
) {
  const limit = Math.min(Math.max(params.limit ?? 10, 1), 25);

  const [profile, mediaList, accountInsights, publishQuota, state] =
    await Promise.all([
      getThreadsProfile(toolName),
      listThreadsMedia({ limit }, toolName),
      getThreadsAccountInsights({}, toolName).catch(() => null),
      getThreadsPublishingLimit(toolName),
      loadDatabaseState(),
    ]);

  const rawPosts = mediaList.data;
  const postInsightsList = await Promise.all(
    rawPosts.map((post) =>
      getThreadsMediaInsights(
        { media_id: post.id, skip_media_details: true },
        toolName
      ).catch(() => null)
    )
  );

  const enriched: EnrichedMediaPerformance[] = [];

  for (let i = 0; i < rawPosts.length; i++) {
    const item = rawPosts[i];
    const ins = postInsightsList[i];

    const classification = await upsertContentClassification(
      classifyInstagramPost({
        media_id: item.id,
        caption: item.text,
        media_type: item.media_type,
      })
    );

    const views = ins?.metrics.views ?? null;
    const likes = ins?.metrics.likes ?? 0;
    const replies = ins?.metrics.replies ?? 0;
    const reposts = ins?.metrics.reposts ?? 0;
    const quotes = ins?.metrics.quotes ?? 0;
    const shares = ins?.metrics.shares ?? 0;
    const totalInteractions =
      ins?.metrics.total_interactions ??
      likes + replies + reposts + quotes + shares;

    // On Threads, engagement rates use `views` as the explicit denominator (since unique `reach` is not exposed)
    const hasPositiveViews = typeof views === "number" && views > 0;
    const likeRate = hasPositiveViews ? round2((likes / views) * 100) : null;
    const replyRate = hasPositiveViews ? round2((replies / views) * 100) : null;
    const shareRate = hasPositiveViews ? round2((shares / views) * 100) : null;
    const repostRate = hasPositiveViews ? round2((reposts / views) * 100) : null;
    const engRateByViews = hasPositiveViews
      ? round2((totalInteractions / views) * 100)
      : null;

    const perfRec = await recordPerformanceSnapshot({
      platform: "threads",
      media_id: item.id,
      likes,
      comments: replies,
      replies,
      reposts,
      quotes,
      shares,
      saves: null,
      views,
      reach: null,
      total_interactions: totalInteractions,
      like_rate_pct: likeRate,
      comment_rate_pct: replyRate,
      save_rate_pct: null,
      share_rate_pct: shareRate,
      repost_rate_pct: repostRate,
      engagement_rate_pct: engRateByViews,
    });

    enriched.push({
      media: {
        id: `med_${item.id}`,
        platform: "threads",
        platform_media_id: item.id,
        media_type: item.media_type,
        media_product_type: "THREADS",
        caption: item.text ?? "",
        permalink: item.permalink,
        media_url: item.media_url,
        topic_tag: item.topic_tag,
        link_attachment_url: item.link_attachment_url,
        is_quote_post: item.is_quote_post,
        content_hash: "",
        published_at: item.timestamp,
        created_at: item.timestamp,
      },
      performance: perfRec,
      classification,
    });
  }

  const patterns = detectContentPatterns(enriched, state.brand.content_pillars);

  for (const obs of patterns.extracted_observations) {
    await upsertLearnedObservation({
      ...obs,
      observation: `[Threads] ${obs.observation}`,
    });
  }

  const mappedPosts = enriched.map((p) => ({
    id: p.media.platform_media_id,
    timestamp: p.media.published_at,
    permalink: p.media.permalink,
    media_type: p.media.media_type,
    topic_tag: p.media.topic_tag ?? null,
    classification: p.classification,
    text_preview:
      p.media.caption.length > 160
        ? `${p.media.caption.slice(0, 160)}...`
        : p.media.caption,
    text_length: p.media.caption.length,
    observed_metrics: {
      views: p.performance.views,
      likes: p.performance.likes,
      replies: p.performance.replies ?? p.performance.comments,
      reposts: p.performance.reposts ?? 0,
      quotes: p.performance.quotes ?? 0,
      shares: p.performance.shares ?? 0,
      total_interactions: p.performance.total_interactions,
    },
    calculated_metrics: {
      denominator_used:
        p.performance.views && p.performance.views > 0
          ? "views (Threads API does not expose unique reach)"
          : "none (views is 0 or unavailable)",
      engagement_rate_by_views_pct: p.performance.engagement_rate_pct,
      like_rate_by_views_pct: p.performance.like_rate_pct,
      reply_rate_by_views_pct: p.performance.comment_rate_pct,
      repost_rate_by_views_pct: p.performance.repost_rate_pct ?? null,
      share_rate_by_views_pct: p.performance.share_rate_pct,
    },
  }));

  const topByViews = [...mappedPosts]
    .sort((a, b) => (b.observed_metrics.views ?? 0) - (a.observed_metrics.views ?? 0))
    .slice(0, 3);

  const topByInteractions = [...mappedPosts]
    .sort(
      (a, b) =>
        (b.observed_metrics.total_interactions ?? 0) -
        (a.observed_metrics.total_interactions ?? 0)
    )
    .slice(0, 3);

  const avgViews = safeAverage(enriched.map((p) => p.performance.views));
  const avgLikes = safeAverage(enriched.map((p) => p.performance.likes));
  const avgReplies = safeAverage(enriched.map((p) => p.performance.comments));
  const avgReposts = safeAverage(enriched.map((p) => p.performance.reposts));
  const avgQuotes = safeAverage(enriched.map((p) => p.performance.quotes));
  const avgShares = safeAverage(enriched.map((p) => p.performance.shares));
  const avgInteractions = safeAverage(
    enriched.map((p) => p.performance.total_interactions)
  );
  const avgEngRateByViews = safeAverage(
    enriched.map((p) => p.performance.engagement_rate_pct)
  );

  const observations: string[] = [
    `Analyzed ${mappedPosts.length} recent Threads post(s) for @${profile.username} (Followers: ${
      profile.followers_count ?? accountInsights?.summary_metrics.followers_count ?? "N/A"
    }, Verified: ${Boolean(profile.is_verified)}).`,
  ];
  if (topByViews[0]) {
    observations.push(
      `Highest-viewed Threads post in sample: ${topByViews[0].id} (${topByViews[0].media_type}, pillar: ${topByViews[0].classification.content_pillar}) with ${topByViews[0].observed_metrics.views} views, ${topByViews[0].observed_metrics.likes} likes, and ${topByViews[0].observed_metrics.replies} replies.`
    );
  }

  return {
    platform: "threads",
    account_context: {
      id: profile.id,
      username: profile.username,
      name: profile.name,
      is_verified: profile.is_verified,
      followers_count:
        profile.followers_count ??
        accountInsights?.summary_metrics.followers_count ??
        null,
      account_insights_summary: accountInsights?.summary_metrics ?? null,
      publishing_quota: publishQuota,
    },
    sample_size: mappedPosts.length,
    methodology_note:
      "Threads analytics strictly separates OBSERVATION (raw Graph API v1.0 metrics), CALCULATION (engagement rates using `views` as the explicit denominator, with zero-denominator protection), INFERENCE (pattern synthesis with sample-size caveats), and RECOMMENDATION.",
    OBSERVATION: {
      summary: observations,
      posts: mappedPosts,
      unavailable_api_metrics: [
        {
          metric: "reach",
          reason:
            "Unavailable on Threads API v1.0: Threads reports post `views` rather than unique account reach.",
        },
        {
          metric: "saves",
          reason:
            "Unavailable on Threads API v1.0: Bookmark/save counts are not returned by Threads insights.",
        },
      ],
    },
    CALCULATION: {
      denominator_definition: "engagement_rate_by_views_pct = (likes + replies + reposts + quotes + shares) / views * 100",
      averages: {
        avg_views: avgViews,
        avg_likes: avgLikes,
        avg_replies: avgReplies,
        avg_reposts: avgReposts,
        avg_quotes: avgQuotes,
        avg_shares: avgShares,
        avg_total_interactions: avgInteractions,
        avg_engagement_rate_by_views_pct: avgEngRateByViews,
      },
      by_format: patterns.by_format,
      by_content_pillar: patterns.by_pillar,
      by_hook_type: patterns.by_hook_type,
      top_performing_posts: {
        by_views: topByViews,
        by_total_interactions: topByInteractions,
      },
    },
    INFERENCE: {
      sample_size_confidence:
        mappedPosts.length >= 20
          ? "strong"
          : mappedPosts.length >= 8
          ? "moderate"
          : "low_sample_descriptive",
      patterns: [
        ...patterns.extracted_observations.map(
          (o) => `[${o.confidence.toUpperCase()}] ${o.observation} (${o.evidence_summary})`
        ),
        ...(mappedPosts.length < 15
          ? [
              `Sample size (n=${mappedPosts.length}) is descriptive of recent Threads posts; treat patterns as directional hypotheses rather than causal laws.`,
            ]
          : []),
      ],
      content_gaps: patterns.content_gaps,
    },
    RECOMMENDATION: {
      priorities: [
        "Breaking AI model rollouts and visual comparison graphics (e.g. Gemini / Claude / GPT comparisons) drive massive algorithmic Threads distribution — pair concise 3-bullet text with a clean visual card.",
        "End Threads posts with an open opinion question (e.g. 'Which model are you using for coding right now?') to convert passive views into replies, which compound Threads feed distribution.",
        ...(patterns.content_gaps.slice(0, 2).map((g) => g.gap_description)),
      ],
    },
  };
}

/**
 * Generates ranked, Threads-native content recommendations (`nexsai_threads_recommend`).
 * Adapts hooks, length (<=500 chars), structure, topic tags, and conversational CTAs specifically for Threads
 * rather than copying Instagram captions.
 */
export async function recommendThreadsContent(
  params: {
    focus_topic?: string;
    limit?: number;
  } = {},
  toolName = "nexsai_threads_recommend"
) {
  const limit = Math.min(Math.max(params.limit ?? 5, 1), 10);

  const [researchResult, threadsAnalysis, state] = await Promise.all([
    executeNexsaiResearch(
      {
        topic:
          params.focus_topic ??
          "AI agents LLM releases developer tools hardware breakthroughs",
        time_range: "7d",
        limit: 10,
      },
      toolName
    ),
    analyzeThreadsPerformance({ limit: 10 }, toolName).catch(() => null),
    loadDatabaseState(),
  ]);

  const recentThreadsCaptions = state.media
    .filter((m) => m.platform === "threads")
    .map((m) => m.caption.toLowerCase());

  const gapPillarIds = new Set(
    (threadsAnalysis?.INFERENCE.content_gaps ?? []).map((g) => g.pillar_id)
  );

  const ranked = researchResult.opportunities
    .map((item) => {
      const titleWords = item.title
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 4);
      let overlap = 0;
      for (const cap of recentThreadsCaptions) {
        if (titleWords.filter((w) => cap.includes(w)).length >= 3) {
          overlap += 1;
        }
      }

      const fillsGap = gapPillarIds.has(item.recommended_pillar);
      const pillarObj = state.brand.content_pillars.find(
        (p) => p.id === item.recommended_pillar
      );

      const explainableScore = Math.min(
        98,
        Math.max(
          45,
          Math.round(
            item.relevance_score * 0.45 +
              item.nexsai_fit_score * 0.45 +
              (fillsGap ? 7 : 2) +
              (overlap === 0 ? 5 : -15 * overlap)
          )
        )
      );

      const topicTagMap: Record<string, string> = {
        ai_tools_productivity: "AITools",
        developer_workflows: "DeveloperTools",
        ai_news_breakthroughs: "AINews",
        tech_explained: "TechExplained",
        gadgets_hardware: "FutureTech",
      };

      const shortTitle =
        item.title.length > 68 ? `${item.title.slice(0, 65)}...` : item.title;

      const suggestedHook =
        item.recommended_pillar === "ai_news_breakthroughs"
          ? `🚨 ${shortTitle} — here is what actually changed:`
          : item.recommended_pillar === "developer_workflows"
          ? `⚡ Most developers are sleeping on this workflow: ${shortTitle}`
          : `📢 ${shortTitle}\n\nHere is the 30-second breakdown:`;

      const suggestedCta =
        "💬 Are you testing this in your workflow, or sticking with your current stack?";

      const draftThreadsPost = [
        suggestedHook,
        "",
        `▪️ What it is: ${item.summary.slice(0, 130)}`,
        "▪️ Why it matters: Faster iteration & lower friction for builders",
        "▪️ The catch: Always verify benchmark claims on real tasks",
        "",
        suggestedCta,
      ]
        .join("\n")
        .slice(0, 490);

      return {
        topic: item.title,
        explainable_opportunity_index: explainableScore,
        scoring_note:
          "Heuristic composite index (0–100) combining topic relevance, NEXSAI brand fit, pillar gap bonus, and novelty check — not a statistical probability.",
        rationale: [
          `High NEXSAI fit (${item.nexsai_fit_score}/100) & community relevance (${item.relevance_score}/100) from ${item.source}.`,
          overlap === 0
            ? "Fresh topic — not covered in recent @nexsaicommunity Threads posts."
            : "Related topic covered recently; use a fresh contrarian or benchmark angle.",
          ...(fillsGap && pillarObj
            ? [
                `Addresses under-represented pillar '${pillarObj.name}' (${pillarObj.target_share_pct}% target share).`,
              ]
            : []),
        ],
        supporting_source_url: item.url,
        brand_pillar: item.recommended_pillar,
        suggested_hook: suggestedHook,
        suggested_threads_format:
          item.recommended_pillar === "ai_news_breakthroughs"
            ? ("IMAGE" as const)
            : item.recommended_pillar === "ai_tools_productivity"
            ? ("CAROUSEL" as const)
            : ("TEXT" as const),
        suggested_topic_tag: topicTagMap[item.recommended_pillar] ?? "NEXSAI",
        suggested_cta: suggestedCta,
        threads_native_draft_500_chars: draftThreadsPost,
        character_count: draftThreadsPost.length,
        confidence_level:
          (threadsAnalysis?.sample_size ?? 0) >= 8
            ? "moderate_historical_evidence"
            : "low_sample_directional",
        recommended_next_action:
          "Call `threads_publish` with `confirm: false` to generate a safe Threads publish preview, or save to the unified pipeline with `nexsai_create_content` (`platform: 'threads'`).",
      };
    })
    .sort(
      (a, b) => b.explainable_opportunity_index - a.explainable_opportunity_index
    )
    .slice(0, limit)
    .map((item, idx) => ({
      rank: idx + 1,
      ...item,
    }));

  return {
    generated_at: new Date().toISOString(),
    platform: "threads",
    handle: state.brand.threads_handle ?? "@nexsaicommunity",
    historical_context: threadsAnalysis
      ? {
          analyzed_threads_count: threadsAnalysis.sample_size,
          avg_views: threadsAnalysis.CALCULATION.averages.avg_views,
          avg_engagement_rate_by_views_pct:
            threadsAnalysis.CALCULATION.averages.avg_engagement_rate_by_views_pct,
          top_historical_post:
            threadsAnalysis.CALCULATION.top_performing_posts.by_views[0] ?? null,
        }
      : null,
    ranked_opportunities: ranked,
  };
}

