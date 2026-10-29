import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  AccountRecord,
  AuditLogRecord,
  BrandMemoryConfig,
  CompetitorProfileRecord,
  ContentClassificationRecord,
  ContentPlanRecord,
  ExperimentRecord,
  LearnedObservationRecord,
  MediaRecord,
  NexsaiDatabaseState,
  PerformanceSnapshotRecord,
  PublicationAttemptRecord,
  ResearchItemRecord,
  WebhookEventRecord,
} from "./schema";

export const DEFAULT_BRAND_MEMORY: BrandMemoryConfig = {
  brand_name: "NEXSAI Community",
  instagram_handle: "@nexsaicommunity",
  threads_handle: "@nexsaicommunity",
  positioning:
    "Technology + AI education + actionable tech intelligence — Where Tech Meets Tomorrow.",
  mission:
    "Demystify AI, developer tools, and emerging hardware for builders, students, and tech enthusiasts through high-signal visual guides and clear breakdowns.",
  target_audience: [
    "Tech enthusiasts exploring practical AI tools",
    "Computer science & engineering students",
    "Software developers & AI builders",
    "Creators and professionals looking for AI productivity workflows",
  ],
  voice_and_tone: {
    style:
      "Clear, energetic, high-signal, educational, and builder-friendly. Zero fluff.",
    reading_level: "Accessible to students and practitioners alike (scannable bullets, concrete numbers).",
    formatting_preferences: [
      "Strong curiosity or numbered hook in line 1",
      "Short scannable bullet points using clean emoji anchors (•, 🚀, ⚡, 📊)",
      "Clear takeaway or trade-off (e.g., why something works + the catch)",
      "Community CTA inviting saves, shares, or follows (@nexsaicommunity)",
    ],
    do_list: [
      "Verify technical claims across reputable primary sources",
      "Explain HOW a tool or technology helps the reader immediately",
      "Highlight free tiers, practical trade-offs, and step-by-step workflows",
      "Distinguish clearly between observed benchmarks and speculation",
    ],
    dont_list: [
      "Never post unverified AI hype or clickbait doom-mongering",
      "Never copy competitor captions verbatim",
      "Avoid walls of unformatted text without line breaks",
      "Avoid more than 5–10 focused hashtags per post",
    ],
  },
  visual_identity: {
    theme: "Futuristic dark-mode tech aesthetic with high-contrast typography and clean diagrams.",
    aspect_ratios: ["4:5 portrait (1080x1350) for feed carousels & images", "9:16 vertical (1080x1920) for Reels"],
    design_notes: [
      "Slide 1 must feature a bold 5–8 word headline hook and clean visual focal point",
      "Use high-contrast accent colors (electric cyan, emerald, clean white on deep zinc/slate)",
      "Final carousel slide should summarize key takeaways + @nexsaicommunity callout",
    ],
  },
  posting_cadence: {
    posts_per_week: 5,
    preferred_days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    preferred_hours_utc: [8, 10, 13, 16],
  },
  cta_preferences: [
    "💾 Save this guide for your next project",
    "👉 Swipe through the breakdown",
    "🔔 Follow @nexsaicommunity for daily AI & tech insights",
    "💬 Which tool are you testing next? Drop it below",
  ],
  default_hashtags: [
    "#NEXSAI",
    "#AITools",
    "#TechExplained",
    "#ArtificialIntelligence",
    "#GenerativeAI",
    "#TechNews",
    "#DeveloperTools",
    "#AIProductivity",
  ],
  signature_series: [
    "Top 3 Things You Can Do With [AI Tool] for Free",
    "Tech Explained in 60 Seconds (Why It Feels Faster/Better)",
    "Weekly AI & Dev Tool Radar",
    "Under the Hood: How Modern Hardware & AI Actually Work",
  ],
  topics_to_avoid: [
    "Partisan politics",
    "Unverified crypto/token pump schemes",
    "Rumors without credible primary reporting",
    "NSFW or clickbait engagement farming",
  ],
  content_pillars: [
    {
      id: "ai_tools_productivity",
      name: "AI & Agentic Systems",
      description:
        "Actionable guides on AI agents, Claude, ChatGPT, Gemini, Cursor, and open-source AI workflows for real work.",
      target_share_pct: 30,
      preferred_formats: ["CAROUSEL_ALBUM", "REELS"],
      primary_goal: "saves",
      example_topics: [
        "Top 3 things you can do with Claude for free",
        "Prompting workflows for coding, docs, and UI prototypes",
        "Free AI tools that replace hours of manual research",
      ],
      keywords: [
        "claude",
        "chatgpt",
        "gemini",
        "prompt",
        "free",
        "workflow",
        "productivity",
        "tool",
        "guide",
        "swipe",
      ],
    },
    {
      id: "developer_workflows",
      name: "Developer Tools",
      description:
        "Practical tips on MCP servers, agentic coding, APIs, GitHub repos, and modern web/AI engineering.",
      target_share_pct: 25,
      preferred_formats: ["CAROUSEL_ALBUM"],
      primary_goal: "saves",
      example_topics: [
        "What is MCP (Model Context Protocol) and why every dev is using it",
        "Open-source GitHub repositories every AI builder should bookmark",
        "Building agentic workflows with modern APIs",
      ],
      keywords: [
        "developer",
        "coding",
        "code",
        "api",
        "mcp",
        "github",
        "open-source",
        "sdk",
        "agent",
        "programming",
      ],
    },
    {
      id: "ai_news_breakthroughs",
      name: "Tech Signals",
      description:
        "Rapid, hype-free breakdowns of major releases from OpenAI, Anthropic, Google, Meta, Apple, Microsoft, and open-weight labs.",
      target_share_pct: 20,
      preferred_formats: ["CAROUSEL_ALBUM", "IMAGE"],
      primary_goal: "reach",
      example_topics: [
        "New model benchmark & capability breakdown",
        "Major Android / iOS / Windows AI OS updates",
        "Open-source AI breakthroughs that run locally",
      ],
      keywords: [
        "release",
        "launch",
        "update",
        "model",
        "openai",
        "anthropic",
        "google",
        "meta",
        "apple",
        "microsoft",
        "benchmark",
      ],
    },
    {
      id: "tech_explained",
      name: "NEXSAI Community & Tech Explained",
      description:
        "Clear, visual explanations of everyday and cutting-edge hardware/software concepts (e.g., 120Hz vs 60Hz, NPUs, quantization) and community spotlights.",
      target_share_pct: 15,
      preferred_formats: ["IMAGE", "CAROUSEL_ALBUM"],
      primary_goal: "reach",
      example_topics: [
        "Why 120Hz feels so much smoother than 60Hz (and the battery trade-off)",
        "How on-device AI chips (NPUs) work on smartphones",
        "OLED vs Mini-LED vs MicroLED explained simply",
      ],
      keywords: [
        "120hz",
        "60hz",
        "display",
        "explained",
        "battery",
        "refresh",
        "chip",
        "hardware",
        "smartphone",
        "how it works",
      ],
    },
    {
      id: "gadgets_hardware",
      name: "Career Growth & Future Tech",
      description:
        "Student & developer career growth, engineering skills, and noteworthy hardware/compute innovations.",
      target_share_pct: 10,
      preferred_formats: ["REELS", "IMAGE"],
      primary_goal: "engagement",
      example_topics: [
        "Free tools & roadmaps for CS students and builders",
        "Next-gen AI wearables and silicon boundaries",
      ],
      keywords: [
        "gadget",
        "robot",
        "wearable",
        "device",
        "laptop",
        "silicon",
        "gpu",
        "student",
        "career",
        "exam",
      ],
    },
  ],
  updated_at: new Date().toISOString(),
};

export const DEFAULT_COMPETITORS: CompetitorProfileRecord[] = [
  {
    id: "comp_1",
    handle: "@evolving.ai",
    name: "Evolving AI",
    category: "AI News & Visual Aggregator",
    typical_formats: ["CAROUSEL_ALBUM", "REELS"],
    core_topics: ["Breaking AI headlines", "Viral AI video demos", "Big Tech announcements"],
    strengths: ["Fast breaking-news turnaround", "High-contrast headline slides"],
    differentiation_gap_for_nexsai:
      "Often focuses on surface-level news alerts; NEXSAI can win by showing hands-on step-by-step free workflows and deeper technical 'how it actually works' explanations.",
    updated_at: new Date().toISOString(),
  },
  {
    id: "comp_2",
    handle: "@wealth_ai_tools",
    name: "Generic AI Tool Roundups",
    category: "AI Tool List Creators",
    typical_formats: ["CAROUSEL_ALBUM", "REELS"],
    core_topics: ["'10 AI websites that feel illegal to know'", "Paid SaaS tool lists"],
    strengths: ["High initial curiosity hooks"],
    differentiation_gap_for_nexsai:
      "Audiences are fatigued by shallow lists of 10 obscure paid tools. NEXSAI stands out by teaching deep mastery of top-tier free tools (Claude, ChatGPT, Gemini, open-source) and honest engineering trade-offs.",
    updated_at: new Date().toISOString(),
  },
  {
    id: "comp_3",
    handle: "@tech_explainer_channels",
    name: "Consumer Tech Explainers",
    category: "Hardware & Consumer Tech",
    typical_formats: ["IMAGE", "REELS"],
    core_topics: ["Smartphone comparisons", "Display & battery specs", "OS updates"],
    strengths: ["Relatable everyday hardware questions (like 60Hz vs 120Hz)"],
    differentiation_gap_for_nexsai:
      "NEXSAI bridges consumer hardware intuition with AI & developer literacy—explaining both the hardware physics and the AI software layer.",
    updated_at: new Date().toISOString(),
  },
];

export const DEFAULT_INITIAL_OBSERVATIONS: LearnedObservationRecord[] = [
  {
    id: "obs_seed_1",
    category: "format",
    observation:
      "Multi-slide educational CAROUSEL_ALBUM posts ('Top 3 Things you can do with Claude for Free') generate strong view-to-reach ratios (~2.4x views per unique account reached) as users swipe through multiple slides.",
    evidence_summary:
      "Observed on recent @nexsaicommunity carousel vs single-image posts (81+ views on 33 reach).",
    sample_size: 2,
    confidence: "low_sample_descriptive",
    created_at: new Date().toISOString(),
  },
  {
    id: "obs_seed_2",
    category: "hook",
    observation:
      "Curiosity hooks explaining everyday hardware trade-offs ('Ever wondered why 120Hz feels SO much smoother?') achieve consistent baseline like-to-reach engagement on single IMAGE posts.",
    evidence_summary:
      "Observed on @nexsaicommunity Tech Explained feed posts.",
    sample_size: 2,
    confidence: "low_sample_descriptive",
    created_at: new Date().toISOString(),
  },
];

function createInitialDatabaseState(): NexsaiDatabaseState {
  return {
    version: "2.0.0",
    brand: structuredClone(DEFAULT_BRAND_MEMORY),
    accounts: [],
    media: [],
    performance_snapshots: [],
    classifications: [],
    research_items: [],
    content_plans: [],
    experiments: [],
    learned_observations: structuredClone(DEFAULT_INITIAL_OBSERVATIONS),
    competitors: structuredClone(DEFAULT_COMPETITORS),
    audit_logs: [],
  };
}

let memoryStateCache: NexsaiDatabaseState | null = null;

function getLocalStorePath(): string {
  const customDir = process.env.NEXSAI_DATA_DIR?.trim();
  if (customDir) {
    return path.resolve(customDir, "nexsai-v2-store.json");
  }
  // On Vercel serverless, process.cwd() is read-only; /tmp is writable
  if (process.env.VERCEL) {
    return path.join("/tmp", "nexsai-v2-store.json");
  }
  return path.resolve(process.cwd(), ".nexsai-data", "nexsai-v2-store.json");
}

function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  );
}

async function loadFromSupabase(): Promise<NexsaiDatabaseState | null> {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !supabaseKey) return null;

  try {
    const res = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/rest/v1/nexsai_kv_store?key=eq.nexsai_state_v2&select=payload`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ payload?: NexsaiDatabaseState }>;
    if (rows.length > 0 && rows[0]?.payload) {
      return rows[0].payload;
    }
    return null;
  } catch {
    return null;
  }
}

async function saveToSupabase(state: NexsaiDatabaseState): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !supabaseKey) return;

  try {
    await fetch(`${supabaseUrl.replace(/\/$/, "")}/rest/v1/nexsai_kv_store`, {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({
        key: "nexsai_state_v2",
        payload: state,
        updated_at: new Date().toISOString(),
      }),
    });
  } catch {
    // Non-fatal fallback to local/memory cache
  }
}

/**
 * Loads the current NEXSAI V2 database state from Supabase (if configured) or durable local file store.
 */
export async function loadDatabaseState(): Promise<NexsaiDatabaseState> {
  if (isSupabaseConfigured()) {
    const remoteState = await loadFromSupabase();
    if (remoteState) {
      memoryStateCache = remoteState;
      return remoteState;
    }
  }

  if (memoryStateCache) {
    return memoryStateCache;
  }

  const filePath = getLocalStorePath();
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw) as NexsaiDatabaseState;
      memoryStateCache = {
        ...createInitialDatabaseState(),
        ...parsed,
      };
      return memoryStateCache;
    }
  } catch {
    // Fallback to initial state if file is corrupted or unreadable
  }

  memoryStateCache = createInitialDatabaseState();
  await saveDatabaseState(memoryStateCache);
  return memoryStateCache;
}

/**
 * Persists the NEXSAI V2 database state to disk and/or Supabase PostgreSQL.
 */
export async function saveDatabaseState(
  state: NexsaiDatabaseState
): Promise<void> {
  memoryStateCache = state;

  const filePath = getLocalStorePath();
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf8");
  } catch {
    // Ignore filesystem errors in read-only environments
  }

  if (isSupabaseConfigured()) {
    await saveToSupabase(state);
  }
}

export function computeContentHash(caption: string, imageUrl?: string): string {
  const normalizedCaption = caption
    .toLowerCase()
    .replace(/#[\p{L}\p{N}_]+/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  const normalizedUrl = (imageUrl ?? "").trim().toLowerCase();
  return crypto
    .createHash("sha256")
    .update(`${normalizedUrl}::${normalizedCaption}`)
    .digest("hex")
    .slice(0, 24);
}

// ============================================================
// REPOSITORY OPERATIONS
// ============================================================

export async function upsertAccountRecord(
  account: Omit<AccountRecord, "id" | "created_at" | "updated_at">
): Promise<AccountRecord> {
  const state = await loadDatabaseState();
  const now = new Date().toISOString();
  const existingIdx = state.accounts.findIndex(
    (a) =>
      a.platform === account.platform &&
      a.platform_user_id === account.platform_user_id
  );

  if (existingIdx >= 0) {
    const updated: AccountRecord = {
      ...state.accounts[existingIdx],
      ...account,
      updated_at: now,
    };
    state.accounts[existingIdx] = updated;
    await saveDatabaseState(state);
    return updated;
  }

  const created: AccountRecord = {
    id: `acc_${account.platform}_${account.platform_user_id}`,
    ...account,
    created_at: now,
    updated_at: now,
  };
  state.accounts.push(created);
  await saveDatabaseState(state);
  return created;
}

export async function upsertMediaRecord(
  media: Omit<MediaRecord, "id" | "content_hash" | "created_at">
): Promise<MediaRecord> {
  const state = await loadDatabaseState();
  const now = new Date().toISOString();
  const contentHash = computeContentHash(media.caption, media.media_url);
  const existingIdx = state.media.findIndex(
    (m) =>
      m.platform === media.platform &&
      m.platform_media_id === media.platform_media_id
  );

  if (existingIdx >= 0) {
    const updated: MediaRecord = {
      ...state.media[existingIdx],
      ...media,
      content_hash: contentHash,
    };
    state.media[existingIdx] = updated;
    await saveDatabaseState(state);
    return updated;
  }

  const created: MediaRecord = {
    id: `med_${media.platform_media_id}`,
    ...media,
    content_hash: contentHash,
    created_at: now,
  };
  state.media.unshift(created);
  // Keep bounded history of 500 media items
  if (state.media.length > 500) {
    state.media = state.media.slice(0, 500);
  }
  await saveDatabaseState(state);
  return created;
}

export async function recordPerformanceSnapshot(
  snapshot: Omit<PerformanceSnapshotRecord, "id" | "captured_at">
): Promise<PerformanceSnapshotRecord> {
  const state = await loadDatabaseState();
  const now = new Date().toISOString();
  const entry: PerformanceSnapshotRecord = {
    id: `perf_${snapshot.media_id}_${Date.now()}`,
    ...snapshot,
    captured_at: now,
  };

  // Replace latest snapshot for the same media_id if captured within the last 15 minutes to avoid bloat
  const recentIdx = state.performance_snapshots.findIndex(
    (p) =>
      p.media_id === snapshot.media_id &&
      Date.now() - new Date(p.captured_at).getTime() < 15 * 60 * 1000
  );
  if (recentIdx >= 0) {
    state.performance_snapshots[recentIdx] = entry;
  } else {
    state.performance_snapshots.unshift(entry);
  }

  if (state.performance_snapshots.length > 1000) {
    state.performance_snapshots = state.performance_snapshots.slice(0, 1000);
  }
  await saveDatabaseState(state);
  return entry;
}

export async function upsertContentClassification(
  classification: ContentClassificationRecord
): Promise<ContentClassificationRecord> {
  const state = await loadDatabaseState();
  const idx = state.classifications.findIndex(
    (c) => c.media_id === classification.media_id
  );
  if (idx >= 0) {
    state.classifications[idx] = classification;
  } else {
    state.classifications.unshift(classification);
  }
  await saveDatabaseState(state);
  return classification;
}

export async function saveResearchItems(
  items: Omit<ResearchItemRecord, "id" | "created_at">[]
): Promise<ResearchItemRecord[]> {
  const state = await loadDatabaseState();
  const now = new Date().toISOString();
  const saved: ResearchItemRecord[] = [];

  for (const item of items) {
    const existingIdx = state.research_items.findIndex(
      (r) => r.url === item.url || r.title.toLowerCase() === item.title.toLowerCase()
    );
    const record: ResearchItemRecord = {
      id:
        existingIdx >= 0
          ? state.research_items[existingIdx].id
          : `res_${crypto.randomBytes(4).toString("hex")}`,
      ...item,
      created_at: now,
    };
    if (existingIdx >= 0) {
      state.research_items[existingIdx] = record;
    } else {
      state.research_items.unshift(record);
    }
    saved.push(record);
  }

  if (state.research_items.length > 200) {
    state.research_items = state.research_items.slice(0, 200);
  }
  await saveDatabaseState(state);
  return saved;
}

export async function saveContentPlan(
  plan: Omit<ContentPlanRecord, "id" | "created_at" | "updated_at"> & {
    id?: string;
  }
): Promise<ContentPlanRecord> {
  const state = await loadDatabaseState();
  const now = new Date().toISOString();

  if (plan.id) {
    const idx = state.content_plans.findIndex((p) => p.id === plan.id);
    if (idx >= 0) {
      const updated: ContentPlanRecord = {
        ...state.content_plans[idx],
        ...plan,
        id: plan.id,
        updated_at: now,
      };
      state.content_plans[idx] = updated;
      await saveDatabaseState(state);
      return updated;
    }
  }

  const created: ContentPlanRecord = {
    ...plan,
    id: plan.id ?? `plan_${crypto.randomBytes(4).toString("hex")}`,
    created_at: now,
    updated_at: now,
  };
  state.content_plans.unshift(created);
  await saveDatabaseState(state);
  return created;
}

export async function updateContentPlanStatus(
  planId: string,
  status: ContentPlanRecord["status"],
  updates: Partial<
    Pick<
      ContentPlanRecord,
      | "published_media_id"
      | "published_permalink"
      | "published_threads_id"
      | "published_threads_permalink"
      | "scheduled_time"
      | "caption"
      | "threads_text"
      | "image_url"
    >
  > = {},
  attempt?: PublicationAttemptRecord
): Promise<ContentPlanRecord | null> {
  const state = await loadDatabaseState();
  const idx = state.content_plans.findIndex((p) => p.id === planId);
  if (idx < 0) return null;

  const existingAttempts = state.content_plans[idx].publication_attempts ?? [];
  state.content_plans[idx] = {
    ...state.content_plans[idx],
    ...updates,
    status,
    publication_attempts: attempt
      ? [attempt, ...existingAttempts].slice(0, 20)
      : existingAttempts,
    updated_at: new Date().toISOString(),
  };
  await saveDatabaseState(state);
  return state.content_plans[idx];
}

export async function appendWebhookEvent(
  event: Omit<WebhookEventRecord, "id" | "received_at"> & { id?: string }
): Promise<{ recorded: boolean; duplicate: boolean; record: WebhookEventRecord }> {
  const state = await loadDatabaseState();
  if (!state.webhook_events) {
    state.webhook_events = [];
  }
  const eventId =
    event.id ??
    `wh_${event.platform}_${event.event_type}_${event.object_id ?? Date.now()}`;
  const existing = state.webhook_events.find((w) => w.id === eventId);
  if (existing) {
    return { recorded: false, duplicate: true, record: existing };
  }
  const record: WebhookEventRecord = {
    ...event,
    id: eventId,
    received_at: new Date().toISOString(),
  };
  state.webhook_events.unshift(record);
  if (state.webhook_events.length > 200) {
    state.webhook_events = state.webhook_events.slice(0, 200);
  }
  await saveDatabaseState(state);
  return { recorded: true, duplicate: false, record };
}

export async function saveExperiment(
  exp: Omit<ExperimentRecord, "id" | "created_at" | "updated_at"> & {
    id?: string;
  }
): Promise<ExperimentRecord> {
  const state = await loadDatabaseState();
  const now = new Date().toISOString();

  if (exp.id) {
    const idx = state.experiments.findIndex((e) => e.id === exp.id);
    if (idx >= 0) {
      const updated: ExperimentRecord = {
        ...state.experiments[idx],
        ...exp,
        id: exp.id,
        updated_at: now,
      };
      state.experiments[idx] = updated;
      await saveDatabaseState(state);
      return updated;
    }
  }

  const created: ExperimentRecord = {
    ...exp,
    id: exp.id ?? `exp_${crypto.randomBytes(4).toString("hex")}`,
    created_at: now,
    updated_at: now,
  };
  state.experiments.unshift(created);
  await saveDatabaseState(state);
  return created;
}

export async function upsertLearnedObservation(
  obs: Omit<LearnedObservationRecord, "id" | "created_at">
): Promise<LearnedObservationRecord> {
  const state = await loadDatabaseState();
  const now = new Date().toISOString();
  const existingIdx = state.learned_observations.findIndex(
    (o) => o.observation.toLowerCase() === obs.observation.toLowerCase()
  );

  const record: LearnedObservationRecord = {
    id:
      existingIdx >= 0
        ? state.learned_observations[existingIdx].id
        : `obs_${crypto.randomBytes(4).toString("hex")}`,
    ...obs,
    created_at: now,
  };

  if (existingIdx >= 0) {
    state.learned_observations[existingIdx] = record;
  } else {
    state.learned_observations.unshift(record);
  }

  if (state.learned_observations.length > 100) {
    state.learned_observations = state.learned_observations.slice(0, 100);
  }
  await saveDatabaseState(state);
  return record;
}

export async function updateBrandMemory(
  updates: Partial<Omit<BrandMemoryConfig, "updated_at">>
): Promise<BrandMemoryConfig> {
  const state = await loadDatabaseState();
  state.brand = {
    ...state.brand,
    ...updates,
    voice_and_tone: updates.voice_and_tone
      ? { ...state.brand.voice_and_tone, ...updates.voice_and_tone }
      : state.brand.voice_and_tone,
    visual_identity: updates.visual_identity
      ? { ...state.brand.visual_identity, ...updates.visual_identity }
      : state.brand.visual_identity,
    posting_cadence: updates.posting_cadence
      ? { ...state.brand.posting_cadence, ...updates.posting_cadence }
      : state.brand.posting_cadence,
    updated_at: new Date().toISOString(),
  };
  await saveDatabaseState(state);
  return state.brand;
}

export async function appendAuditLog(
  entry: Omit<AuditLogRecord, "id" | "timestamp">
): Promise<void> {
  const state = await loadDatabaseState();
  state.audit_logs.unshift({
    id: `aud_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  });
  if (state.audit_logs.length > 250) {
    state.audit_logs = state.audit_logs.slice(0, 250);
  }
  await saveDatabaseState(state);
}

export function getDatabaseStorageInfo(): {
  adapter: "supabase_postgres" | "local_durable_json";
  path_or_endpoint: string;
} {
  if (isSupabaseConfigured()) {
    return {
      adapter: "supabase_postgres",
      path_or_endpoint: process.env.SUPABASE_URL ?? "supabase",
    };
  }
  return {
    adapter: "local_durable_json",
    path_or_endpoint: getLocalStorePath(),
  };
}

