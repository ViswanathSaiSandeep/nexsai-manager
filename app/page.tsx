"use client";

import { useEffect, useState } from "react";

type TabId =
  | "overview"
  | "analytics"
  | "content"
  | "research"
  | "calendar"
  | "comments"
  | "experiments"
  | "settings";

interface DashboardPayload {
  ok: boolean;
  server_version: string;
  api_version: string;
  storage: { adapter: string; path_or_endpoint: string };
  account: {
    username?: string;
    account_type?: string;
    followers_count?: number;
    follows_count?: number;
    media_count?: number;
  } | null;
  account_day_insights: Record<string, number | null>;
  brand: {
    brand_name: string;
    instagram_handle: string;
    positioning: string;
    mission: string;
    target_audience: string[];
    posting_cadence: {
      posts_per_week: number;
      preferred_days: string[];
      preferred_hours_utc: number[];
    };
    cta_preferences: string[];
    default_hashtags: string[];
    topics_to_avoid: string[];
    content_pillars: Array<{
      id: string;
      name: string;
      description: string;
      target_share_pct: number;
      preferred_formats: string[];
      primary_goal: string;
    }>;
  };
  media: Array<{
    platform_media_id: string;
    media_type: string;
    caption: string;
    permalink: string;
    published_at: string;
  }>;
  performance_snapshots: Array<{
    media_id: string;
    views: number | null;
    reach: number | null;
    likes: number;
    comments: number;
    saves: number | null;
    shares: number | null;
    total_interactions: number | null;
    engagement_rate_pct: number | null;
  }>;
  patterns: {
    by_format: Array<{
      key: string;
      post_count: number;
      avg_views: number | null;
      avg_reach: number | null;
      avg_engagement_rate_pct: number | null;
    }>;
    by_pillar: Array<{
      key: string;
      post_count: number;
      avg_views: number | null;
      avg_reach: number | null;
      avg_engagement_rate_pct: number | null;
    }>;
    content_gaps: Array<{
      pillar_name: string;
      target_share_pct: number;
      actual_share_pct: number;
      gap_description: string;
    }>;
  };
  research_items: Array<{
    id: string;
    title: string;
    source: string;
    url: string;
    relevance_score: number;
    nexsai_fit_score: number;
    recommended_pillar: string;
    content_angle: string;
  }>;
  content_plans: Array<{
    id: string;
    topic: string;
    content_pillar: string;
    format: string;
    goal: string;
    status: string;
    hook: string;
    scheduled_time?: string;
  }>;
  experiments: Array<{
    id: string;
    name: string;
    variable: string;
    hypothesis: string;
    variant_a: string;
    variant_b: string;
    success_metric: string;
    status: string;
    result?: string;
  }>;
  learned_observations: Array<{
    id: string;
    category: string;
    observation: string;
    evidence_summary: string;
    confidence: string;
  }>;
  audit_logs: Array<{
    id: string;
    timestamp: string;
    tool: string;
    operation: string;
    category: string;
    success: boolean;
  }>;
}

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "analytics", label: "Analytics" },
  { id: "content", label: "Content" },
  { id: "research", label: "Research" },
  { id: "calendar", label: "Calendar" },
  { id: "comments", label: "Comments" },
  { id: "experiments", label: "Experiments" },
  { id: "settings", label: "Settings" },
];

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d: DashboardPayload) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const perfByMediaId = new Map(
    (data?.performance_snapshots ?? []).map((p) => [p.media_id, p])
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans">
      {/* Top Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/60 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold">
              NX
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold tracking-tight">
                  NEXSAI Manager 2.0
                </h1>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  MCP v2.0 Online
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                AI Social Media Operating System •{" "}
                {data?.account?.username
                  ? `@${data.account.username}`
                  : "@nexsaicommunity"}{" "}
                • Graph API {data?.api_version ?? "v24.0"}
              </p>
            </div>
          </div>

          <nav className="flex flex-wrap gap-1.5">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  activeTab === t.id
                    ? "bg-zinc-100 text-zinc-900"
                    : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {loading ? (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-12 text-center text-sm text-zinc-400">
            Syncing live Instagram intelligence, research opportunities, and NEXSAI memory...
          </div>
        ) : !data?.ok ? (
          <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-6 text-sm text-red-300">
            Unable to load dashboard state. Verify your environment configuration.
          </div>
        ) : (
          <>
            {/* OVERVIEW TAB */}
            {activeTab === "overview" && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                    <div className="text-xs text-zinc-400">Connected Account</div>
                    <div className="text-xl font-semibold mt-1">
                      @{data.account?.username ?? "nexsaicommunity"}
                    </div>
                    <div className="text-xs text-emerald-400 mt-1">
                      {data.account?.account_type ?? "MEDIA_CREATOR"}
                    </div>
                  </div>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                    <div className="text-xs text-zinc-400">Followers / Published</div>
                    <div className="text-xl font-semibold mt-1">
                      {data.account?.followers_count ?? "—"} followers
                    </div>
                    <div className="text-xs text-zinc-400 mt-1">
                      {data.account?.media_count ?? "—"} total posts
                    </div>
                  </div>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                    <div className="text-xs text-zinc-400">24h Account Views / Reach</div>
                    <div className="text-xl font-semibold mt-1">
                      {data.account_day_insights.views ?? "—"} views
                    </div>
                    <div className="text-xs text-zinc-400 mt-1">
                      {data.account_day_insights.reach ?? "—"} unique reach
                    </div>
                  </div>
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                    <div className="text-xs text-zinc-400">V2 Memory & Safety</div>
                    <div className="text-xl font-semibold mt-1">
                      {data.learned_observations.length} Patterns
                    </div>
                    <div className="text-xs text-emerald-400 mt-1">
                      Confirm=true Gate Active
                    </div>
                  </div>
                </div>

                {/* Learned Observations & Content Gaps */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
                    <h2 className="text-sm font-semibold text-zinc-200 mb-3">
                      Learning Loop Observations
                    </h2>
                    <div className="space-y-3">
                      {data.learned_observations.map((obs) => (
                        <div
                          key={obs.id}
                          className="rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-3 text-xs"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="uppercase tracking-wider text-[10px] font-semibold text-emerald-400">
                              {obs.category}
                            </span>
                            <span className="text-[10px] text-zinc-500">
                              {obs.confidence}
                            </span>
                          </div>
                          <p className="text-zinc-200 leading-relaxed">
                            {obs.observation}
                          </p>
                          <p className="text-zinc-500 mt-1">{obs.evidence_summary}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
                    <h2 className="text-sm font-semibold text-zinc-200 mb-3">
                      Detected Content Pillar Gaps
                    </h2>
                    <div className="space-y-3">
                      {data.patterns.content_gaps.map((gap) => (
                        <div
                          key={gap.pillar_name}
                          className="rounded-lg border border-zinc-800/80 bg-zinc-950/60 p-3 text-xs"
                        >
                          <div className="flex items-center justify-between font-medium text-zinc-200">
                            <span>{gap.pillar_name}</span>
                            <span className="text-amber-400">
                              {gap.actual_share_pct}% actual / {gap.target_share_pct}% target
                            </span>
                          </div>
                          <p className="text-zinc-400 mt-1">{gap.gap_description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ANALYTICS TAB */}
            {activeTab === "analytics" && (
              <div className="space-y-6">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
                  <h2 className="text-sm font-semibold mb-4">
                    Format Performance Breakdown (Graph API v24.0)
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {data.patterns.by_format.map((fmt) => (
                      <div
                        key={fmt.key}
                        className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4"
                      >
                        <div className="text-xs font-semibold text-emerald-400">
                          {fmt.key} (n={fmt.post_count})
                        </div>
                        <div className="mt-2 space-y-1 text-xs text-zinc-300">
                          <div>Avg Views: {fmt.avg_views ?? "—"}</div>
                          <div>Avg Reach: {fmt.avg_reach ?? "—"}</div>
                          <div>
                            Avg Engagement Rate (Reach):{" "}
                            {fmt.avg_engagement_rate_pct ?? "—"}%
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
                  <h2 className="text-sm font-semibold mb-4">
                    Recent Post Performance Snapshots
                  </h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="text-zinc-400 border-b border-zinc-800">
                        <tr>
                          <th className="py-2 pr-4">Media ID</th>
                          <th className="py-2 pr-4">Format</th>
                          <th className="py-2 pr-4">Caption</th>
                          <th className="py-2 pr-4">Views</th>
                          <th className="py-2 pr-4">Reach</th>
                          <th className="py-2 pr-4">Likes</th>
                          <th className="py-2 pr-4">Saves</th>
                          <th className="py-2 pr-4">Eng. Rate</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/60">
                        {data.media.map((m) => {
                          const perf = perfByMediaId.get(m.platform_media_id);
                          return (
                            <tr key={m.platform_media_id}>
                              <td className="py-2.5 pr-4 font-mono text-zinc-400">
                                <a
                                  href={m.permalink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="hover:text-emerald-400 underline"
                                >
                                  {m.platform_media_id}
                                </a>
                              </td>
                              <td className="py-2.5 pr-4">{m.media_type}</td>
                              <td className="py-2.5 pr-4 max-w-xs truncate text-zinc-300">
                                {m.caption}
                              </td>
                              <td className="py-2.5 pr-4">{perf?.views ?? "—"}</td>
                              <td className="py-2.5 pr-4">{perf?.reach ?? "—"}</td>
                              <td className="py-2.5 pr-4">{perf?.likes ?? "—"}</td>
                              <td className="py-2.5 pr-4">{perf?.saves ?? "—"}</td>
                              <td className="py-2.5 pr-4 text-emerald-400 font-medium">
                                {perf?.engagement_rate_pct !== null &&
                                perf?.engagement_rate_pct !== undefined
                                  ? `${perf.engagement_rate_pct}%`
                                  : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* CONTENT TAB */}
            {activeTab === "content" && (
              <div className="space-y-6">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
                  <h2 className="text-sm font-semibold mb-3">
                    Content Approval Pipeline (DRAFT → REVIEW → APPROVED → PUBLISHED)
                  </h2>
                  {data.content_plans.length === 0 ? (
                    <p className="text-xs text-zinc-400">
                      No content plans created yet. Ask Claude to run{" "}
                      <code className="text-emerald-400">nexsai_create_content</code> or{" "}
                      <code className="text-emerald-400">nexsai_plan_week</code>.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {data.content_plans.map((plan) => (
                        <div
                          key={plan.id}
                          className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4 text-xs space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 font-mono">
                              {plan.status}
                            </span>
                            <span className="text-zinc-500">
                              {plan.format} • {plan.content_pillar}
                            </span>
                          </div>
                          <div className="font-semibold text-zinc-100 text-sm">
                            {plan.topic}
                          </div>
                          <div className="text-zinc-400">{plan.hook}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* RESEARCH TAB */}
            {activeTab === "research" && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
                <h2 className="text-sm font-semibold">
                  AI & Tech Research Opportunities (Scored for @nexsaicommunity)
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {data.research_items.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4 text-xs space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-emerald-400 font-semibold">
                          NEXSAI Fit: {item.nexsai_fit_score}/100 • Relevance:{" "}
                          {item.relevance_score}/100
                        </span>
                        <span className="text-zinc-500">{item.recommended_pillar}</span>
                      </div>
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-semibold text-zinc-100 hover:text-emerald-400 underline block"
                      >
                        {item.title}
                      </a>
                      <div className="text-zinc-400">Source: {item.source}</div>
                      <div className="text-zinc-300 bg-zinc-900/70 p-2 rounded border border-zinc-800/80">
                        {item.content_angle}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* CALENDAR TAB */}
            {activeTab === "calendar" && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">
                    Scheduled & Planned Content Calendar
                  </h2>
                  <span className="text-xs text-zinc-400">
                    Target Cadence: {data.brand.posting_cadence.posts_per_week} posts/week
                  </span>
                </div>
                {data.content_plans.length === 0 ? (
                  <p className="text-xs text-zinc-400">
                    Run <code className="text-emerald-400">nexsai_plan_week</code> in Claude to populate your 7-day calendar.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {data.content_plans.map((p) => (
                      <div
                        key={p.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs gap-2"
                      >
                        <div>
                          <span className="font-mono text-emerald-400 mr-2">
                            {p.scheduled_time
                              ? p.scheduled_time.split("T")[0]
                              : "Unscheduled"}
                          </span>
                          <span className="font-medium text-zinc-200">{p.topic}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-300">
                            {p.format}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400">
                            {p.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* COMMENTS TAB */}
            {activeTab === "comments" && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-3 text-xs">
                <h2 className="text-sm font-semibold text-zinc-100">
                  Comment Management & Moderation Safety
                </h2>
                <p className="text-zinc-400">
                  Use MCP tools <code className="text-emerald-400">instagram_comments</code>,{" "}
                  <code className="text-emerald-400">instagram_comment_reply</code>,{" "}
                  <code className="text-emerald-400">instagram_hide_comment</code>, and{" "}
                  <code className="text-emerald-400">instagram_delete_comment</code> via Claude.
                  All replies, hiding, and deletions strictly require{" "}
                  <code className="text-emerald-400">confirm: true</code>.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  {data.media.slice(0, 6).map((m) => {
                    const perf = perfByMediaId.get(m.platform_media_id);
                    return (
                      <div
                        key={m.platform_media_id}
                        className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3"
                      >
                        <div className="flex justify-between text-zinc-400 mb-1">
                          <span className="font-mono">{m.platform_media_id}</span>
                          <span>{perf?.comments ?? 0} comments</span>
                        </div>
                        <p className="text-zinc-200 truncate">{m.caption}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* EXPERIMENTS TAB */}
            {activeTab === "experiments" && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
                <h2 className="text-sm font-semibold">
                  Controlled Content Experiments
                </h2>
                {data.experiments.length === 0 ? (
                  <p className="text-xs text-zinc-400">
                    No active experiments yet. Use{" "}
                    <code className="text-emerald-400">nexsai_create_experiment</code> to launch a Hook Style or Format test.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {data.experiments.map((exp) => (
                      <div
                        key={exp.id}
                        className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4 text-xs space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm text-zinc-100">
                            {exp.name}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400">
                            {exp.status}
                          </span>
                        </div>
                        <p className="text-zinc-300">Hypothesis: {exp.hypothesis}</p>
                        <div className="grid grid-cols-2 gap-2 text-zinc-400">
                          <div>Variant A: {exp.variant_a}</div>
                          <div>Variant B: {exp.variant_b}</div>
                        </div>
                        {exp.result && (
                          <div className="text-emerald-400 pt-1">{exp.result}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* SETTINGS TAB */}
            {activeTab === "settings" && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-3">
                  <h2 className="text-sm font-semibold text-zinc-100">
                    Persistent Brand Knowledge (Editable via nexsai_brand_config)
                  </h2>
                  <div>
                    <span className="text-zinc-400">Positioning:</span>{" "}
                    <span className="text-zinc-200">{data.brand.positioning}</span>
                  </div>
                  <div>
                    <span className="text-zinc-400">Mission:</span>{" "}
                    <span className="text-zinc-200">{data.brand.mission}</span>
                  </div>
                  <div>
                    <span className="text-zinc-400">Default Hashtags:</span>{" "}
                    <span className="text-emerald-400">
                      {data.brand.default_hashtags.join(" ")}
                    </span>
                  </div>
                  <div className="pt-2">
                    <div className="font-medium text-zinc-200 mb-2">
                      Content Pillars:
                    </div>
                    <div className="space-y-2">
                      {data.brand.content_pillars.map((p) => (
                        <div
                          key={p.id}
                          className="rounded border border-zinc-800 bg-zinc-950/60 p-2.5"
                        >
                          <div className="flex justify-between font-medium">
                            <span>{p.name}</span>
                            <span className="text-emerald-400">
                              {p.target_share_pct}% target
                            </span>
                          </div>
                          <p className="text-zinc-400 mt-1">{p.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-3">
                  <h2 className="text-sm font-semibold text-zinc-100">
                    System Storage & Recent Audit Trail
                  </h2>
                  <div>
                    <span className="text-zinc-400">Database Adapter:</span>{" "}
                    <span className="font-mono text-emerald-400">
                      {data.storage.adapter}
                    </span>
                  </div>
                  <div className="space-y-1.5 pt-2">
                    {data.audit_logs.map((log) => (
                      <div
                        key={log.id}
                        className="flex items-center justify-between rounded border border-zinc-800/80 bg-zinc-950/60 px-3 py-2"
                      >
                        <div>
                          <span className="font-mono text-zinc-200">{log.tool}</span>
                          <span className="text-zinc-500 ml-2">{log.operation}</span>
                        </div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                          {log.category}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
