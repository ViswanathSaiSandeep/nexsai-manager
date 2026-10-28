import type { ContentPillarId, ResearchItemRecord } from "../database/schema";
import { loadDatabaseState, saveResearchItems } from "../database/store";
import { classifyInstagramPost } from "../analytics/metrics";
import { logMcpOperation } from "../utils/logger";

export interface ResearchQueryOptions {
  topic?: string;
  time_range?: "24h" | "7d" | "30d";
  limit?: number;
}

interface RawDiscoveredArticle {
  title: string;
  url: string;
  source: string;
  published_at: string;
  summary: string;
  points?: number;
}

const CURATED_EVERGREEN_TECH_TOPICS: RawDiscoveredArticle[] = [
  {
    title: "Model Context Protocol (MCP): Connecting AI Agents to Real-World Tools",
    url: "https://modelcontextprotocol.io/introduction",
    source: "Model Context Protocol Docs",
    published_at: new Date().toISOString(),
    summary:
      "Open standard enabling Claude, ChatGPT, and IDE agents to securely connect to data sources and external APIs via standardized tools, resources, and prompts.",
    points: 350,
  },
  {
    title: "On-Device NPUs vs Cloud GPUs: How Local AI Inference Works on Modern Smartphones",
    url: "https://developer.android.com/ai",
    source: "Android AI Engineering",
    published_at: new Date().toISOString(),
    summary:
      "Technical breakdown of quantized 3B–8B parameter models running directly on smartphone Neural Processing Units with zero latency and offline privacy.",
    points: 240,
  },
  {
    title: "Prompt Caching & Context Optimization: Cutting LLM API Costs by 80%",
    url: "https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching",
    source: "Anthropic Engineering",
    published_at: new Date().toISOString(),
    summary:
      "How prefix caching works in modern transformer architectures and how developers structure system prompts and documents for instant responses.",
    points: 290,
  },
];

function scoreRelevanceAndFit(
  article: RawDiscoveredArticle,
  queryTopic: string,
  avoidTopics: string[]
): {
  relevance_score: number;
  nexsai_fit_score: number;
  recommended_pillar: ContentPillarId;
  content_angle: string;
  freshness_hours: number;
} {
  const combined = `${article.title} ${article.summary}`.toLowerCase();

  // Penalize avoided topics
  for (const avoid of avoidTopics) {
    if (combined.includes(avoid.toLowerCase())) {
      return {
        relevance_score: 10,
        nexsai_fit_score: 5,
        recommended_pillar: "ai_news_breakthroughs",
        content_angle: "Skip — matches excluded brand topic.",
        freshness_hours: 24,
      };
    }
  }

  const pubTime = new Date(article.published_at).getTime();
  const freshnessHours = Number.isNaN(pubTime)
    ? 12
    : Math.max(1, Math.round((Date.now() - pubTime) / (1000 * 3600)));

  let relevance = 68;
  const queryWords = queryTopic
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);

  for (const w of queryWords) {
    if (combined.includes(w)) {
      relevance += 10;
    }
  }
  if (article.points && article.points > 100) {
    relevance += Math.min(15, Math.round(article.points / 40));
  }
  relevance = Math.min(99, relevance);

  const highFitTerms = [
    "ai",
    "claude",
    "openai",
    "chatgpt",
    "gemini",
    "google",
    "anthropic",
    "apple",
    "android",
    "microsoft",
    "llm",
    "developer",
    "open-source",
    "gpu",
    "npu",
    "model",
    "tool",
    "code",
    "agent",
    "mcp",
  ];
  let fitScore = 65;
  for (const term of highFitTerms) {
    if (combined.includes(term)) {
      fitScore += 6;
    }
  }
  fitScore = Math.min(98, fitScore);

  const classified = classifyInstagramPost({
    media_id: "research_temp",
    caption: `${article.title} ${article.summary}`,
    media_type: "CAROUSEL_ALBUM",
  });

  const contentAngle =
    classified.content_pillar === "ai_tools_productivity"
      ? `Carousel Guide: 'How to use ${article.title.slice(0, 45)} in 3 practical steps (Free workflow)'`
      : classified.content_pillar === "tech_explained"
      ? `Visual Explainer: 'How ${article.title.slice(0, 45)} actually works under the hood'`
      : `Tech Radar Breakdown: '${article.title.slice(0, 50)} — What changed and why it matters for builders'`;

  return {
    relevance_score: relevance,
    nexsai_fit_score: fitScore,
    recommended_pillar: classified.content_pillar,
    content_angle: contentAngle,
    freshness_hours: freshnessHours,
  };
}

async function fetchHackerNewsTechStories(
  topic: string,
  timeRange: "24h" | "7d" | "30d",
  limit: number
): Promise<RawDiscoveredArticle[]> {
  const secondsWindow =
    timeRange === "24h"
      ? 86400 * 2
      : timeRange === "7d"
      ? 86400 * 7
      : 86400 * 30;
  const minTimestamp = Math.floor(Date.now() / 1000) - secondsWindow;
  const searchQuery = encodeURIComponent(topic || "AI LLM developer tools");

  const url = `https://hn.algolia.com/api/v1/search?query=${searchQuery}&tags=story&numericFilters=created_at_i>${minTimestamp}&hitsPerPage=${Math.min(
    limit * 2,
    20
  )}`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return [];

  const data = (await res.json()) as {
    hits?: Array<{
      title?: string;
      url?: string;
      story_url?: string;
      created_at?: string;
      points?: number;
      author?: string;
      objectID?: string;
    }>;
  };

  const results: RawDiscoveredArticle[] = [];
  for (const hit of data.hits ?? []) {
    if (!hit.title) continue;
    const articleUrl =
      hit.url ||
      hit.story_url ||
      `https://news.ycombinator.com/item?id=${hit.objectID ?? ""}`;
    let hostname = "Hacker News Tech Community";
    try {
      hostname = new URL(articleUrl).hostname.replace(/^www\./, "");
    } catch {
      // keep default
    }

    results.push({
      title: hit.title,
      url: articleUrl,
      source: `${hostname} (via HN, ${hit.points ?? 0} pts)`,
      published_at: hit.created_at ?? new Date().toISOString(),
      summary: `Discovered trending developer/tech story (${hit.points ?? 0} community upvotes) from ${hostname}: "${hit.title}". Verify claims with primary documentation before publishing.`,
      points: hit.points ?? 10,
    });
  }
  return results;
}

async function fetchDevToArticles(
  topic: string,
  limit: number
): Promise<RawDiscoveredArticle[]> {
  const tag = topic.toLowerCase().includes("web")
    ? "webdev"
    : topic.toLowerCase().includes("programming")
    ? "programming"
    : "ai";
  const url = `https://dev.to/api/articles?tag=${encodeURIComponent(
    tag
  )}&top=7&per_page=${Math.min(limit, 10)}`;

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return [];

  const articles = (await res.json()) as Array<{
    title?: string;
    url?: string;
    description?: string;
    published_at?: string;
    public_reactions_count?: number;
  }>;

  return articles
    .filter((a): a is Required<Pick<typeof a, "title" | "url">> & typeof a =>
      Boolean(a.title && a.url)
    )
    .map((a) => ({
      title: a.title,
      url: a.url,
      source: `DEV Community (${a.public_reactions_count ?? 0} reactions)`,
      published_at: a.published_at ?? new Date().toISOString(),
      summary:
        a.description ||
        `Developer community tutorial/breakdown: ${a.title}.`,
      points: a.public_reactions_count ?? 15,
    }));
}

/**
 * Phase 16 & 17 — Multi-Source Tech & AI Research Engine (`nexsai_research` / `nexsai_research_today`).
 *
 * Pipeline:
 * Search -> Collect multi-source -> Deduplicate -> Evaluate relevance -> Check freshness -> Score NEXSAI fit -> Persist & Return opportunities.
 */
export async function executeNexsaiResearch(
  options: ResearchQueryOptions = {},
  toolName = "nexsai_research"
): Promise<{
  query_topic: string;
  time_range: string;
  total_discovered: number;
  verification_note: string;
  opportunities: ResearchItemRecord[];
}> {
  const startTime = Date.now();
  const topic = (options.topic ?? "AI tools LLM models developer tech").trim();
  const timeRange = options.time_range ?? "7d";
  const limit = Math.min(Math.max(options.limit ?? 6, 1), 15);

  const state = await loadDatabaseState();

  const [hnStories, devArticles] = await Promise.all([
    fetchHackerNewsTechStories(topic, timeRange, limit).catch(() => []),
    fetchDevToArticles(topic, limit).catch(() => []),
  ]);

  const combinedRaw = [
    ...hnStories,
    ...devArticles,
    ...CURATED_EVERGREEN_TECH_TOPICS,
  ];

  // Deduplicate by normalized URL and title prefix
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  const deduplicated: RawDiscoveredArticle[] = [];

  for (const item of combinedRaw) {
    const normUrl = item.url.toLowerCase().replace(/\/$/, "");
    const normTitle = item.title.toLowerCase().slice(0, 45);
    if (seenUrls.has(normUrl) || seenTitles.has(normTitle)) {
      continue;
    }
    seenUrls.add(normUrl);
    seenTitles.add(normTitle);
    deduplicated.push(item);
  }

  const scoredItems = deduplicated
    .map((article) => {
      const scores = scoreRelevanceAndFit(
        article,
        topic,
        state.brand.topics_to_avoid
      );
      return {
        topic,
        source: article.source,
        title: article.title,
        url: article.url,
        published_at: article.published_at,
        freshness_hours: scores.freshness_hours,
        relevance_score: scores.relevance_score,
        nexsai_fit_score: scores.nexsai_fit_score,
        summary: article.summary,
        recommended_pillar: scores.recommended_pillar,
        content_angle: scores.content_angle,
      };
    })
    .filter((i) => i.nexsai_fit_score >= 50)
    .sort(
      (a, b) =>
        b.nexsai_fit_score +
        b.relevance_score -
        (a.nexsai_fit_score + a.relevance_score)
    )
    .slice(0, limit);

  const persisted = await saveResearchItems(scoredItems);

  logMcpOperation({
    level: "info",
    tool: toolName,
    operation: "executeNexsaiResearch",
    success: true,
    durationMs: Date.now() - startTime,
    message: `Discovered and scored ${persisted.length} research opportunities for topic='${topic}'.`,
  });

  return {
    query_topic: topic,
    time_range: timeRange,
    total_discovered: persisted.length,
    verification_note:
      "Multi-source tech discovery completed. Do not treat a single community headline as absolute truth—cross-verify benchmark claims against official documentation before publishing.",
    opportunities: persisted,
  };
}

