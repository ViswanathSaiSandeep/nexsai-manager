import { ErrorCategory, NexsaiMcpError } from "../utils/errors";
import { redactSecrets } from "../utils/logger";

/**
 * NEXSAI Manager 2.0 — Core Database & Memory Schema
 *
 * Designed for dual-adapter persistence:
 * 1. Primary (Production on Vercel): Supabase PostgreSQL via PostgREST (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`)
 * 2. Fallback (Zero-config local / serverless): Durable JSON store (`.nexsai-data/store.json` or `/tmp/nexsai-store.json`)
 *    seeded with NEXSAI brand context, pillars, and initial state.
 */

export type SocialPlatformName = "instagram" | "threads";

export interface AccountRecord {
  id: string;
  platform: SocialPlatformName;
  platform_user_id: string;
  username: string;
  name?: string;
  account_type: string;
  followers_count?: number;
  follows_count?: number;
  media_count?: number;
  biography?: string;
  website?: string;
  created_at: string;
  updated_at: string;
}

export interface MediaRecord {
  id: string;
  platform: SocialPlatformName;
  platform_media_id: string;
  media_type: string;
  media_product_type?: string;
  caption: string;
  permalink: string;
  media_url?: string;
  content_hash: string;
  published_at: string;
  created_at: string;
}

export interface PerformanceSnapshotRecord {
  id: string;
  media_id: string; // platform_media_id
  likes: number;
  comments: number;
  shares: number | null;
  saves: number | null;
  views: number | null;
  reach: number | null;
  total_interactions: number | null;
  like_rate_pct: number | null;
  comment_rate_pct: number | null;
  save_rate_pct: number | null;
  share_rate_pct: number | null;
  engagement_rate_pct: number | null;
  captured_at: string;
}

export type ContentPillarId =
  | "ai_tools_productivity"
  | "tech_explained"
  | "ai_news_breakthroughs"
  | "developer_workflows"
  | "gadgets_hardware";

export type HookStyleType =
  | "curiosity_question"
  | "numbered_list"
  | "contrarian_myth"
  | "news_alert"
  | "step_by_step_guide"
  | "comparison_vs"
  | "general";

export type CtaStyleType =
  | "follow_community"
  | "save_for_later"
  | "share_with_friend"
  | "comment_opinion"
  | "swipe_guide"
  | "none";

export interface ContentClassificationRecord {
  media_id: string;
  topic: string;
  content_pillar: ContentPillarId;
  format: string; // IMAGE, CAROUSEL_ALBUM, VIDEO, REELS
  audience: string;
  goal: "reach" | "saves" | "engagement" | "followers" | "education";
  hook_type: HookStyleType;
  cta_type: CtaStyleType;
  classified_at: string;
}

export interface ResearchItemRecord {
  id: string;
  topic: string;
  source: string;
  title: string;
  url: string;
  published_at: string;
  freshness_hours: number;
  relevance_score: number; // 0-100
  nexsai_fit_score: number; // 0-100
  summary: string;
  recommended_pillar: ContentPillarId;
  content_angle: string;
  created_at: string;
}

export type ContentPlanStatus =
  | "DRAFT"
  | "REVIEW"
  | "APPROVED"
  | "SCHEDULED"
  | "PUBLISHED"
  | "ANALYZING"
  | "ARCHIVED";

export interface ContentPlanRecord {
  id: string;
  topic: string;
  content_pillar: ContentPillarId;
  format: "IMAGE" | "CAROUSEL_ALBUM" | "REELS";
  goal: "reach" | "saves" | "engagement" | "followers" | "education";
  scheduled_time?: string;
  status: ContentPlanStatus;
  hook: string;
  headline?: string;
  caption: string;
  cta: string;
  hashtags: string[];
  visual_brief: string;
  carousel_slides?: string[];
  image_url?: string;
  published_media_id?: string;
  created_at: string;
  updated_at: string;
}

export interface ExperimentRecord {
  id: string;
  name: string;
  variable:
    | "hook_style"
    | "format"
    | "pillar"
    | "cta_variation"
    | "posting_time"
    | "caption_length"
    | "topic_angle";
  hypothesis: string;
  variant_a: string;
  variant_b: string;
  success_metric:
    | "engagement_rate_pct"
    | "save_rate_pct"
    | "share_rate_pct"
    | "reach"
    | "views";
  variant_a_media_ids: string[];
  variant_b_media_ids: string[];
  status: "ACTIVE" | "COMPLETED" | "PAUSED";
  result?: string;
  created_at: string;
  updated_at: string;
}

export interface LearnedObservationRecord {
  id: string;
  category: "format" | "pillar" | "hook" | "timing" | "general";
  observation: string;
  evidence_summary: string;
  sample_size: number;
  confidence: "low_sample_descriptive" | "moderate" | "strong";
  created_at: string;
}

export interface CompetitorProfileRecord {
  id: string;
  handle: string;
  name: string;
  category: string;
  typical_formats: string[];
  core_topics: string[];
  strengths: string[];
  differentiation_gap_for_nexsai: string;
  notes?: string;
  updated_at: string;
}

export interface BrandContentPillar {
  id: ContentPillarId;
  name: string;
  description: string;
  target_share_pct: number;
  preferred_formats: Array<"IMAGE" | "CAROUSEL_ALBUM" | "REELS">;
  primary_goal: "reach" | "saves" | "engagement" | "followers" | "education";
  example_topics: string[];
  keywords: string[];
}

export interface BrandMemoryConfig {
  brand_name: string;
  instagram_handle: string;
  positioning: string;
  mission: string;
  target_audience: string[];
  voice_and_tone: {
    style: string;
    reading_level: string;
    formatting_preferences: string[];
    do_list: string[];
    dont_list: string[];
  };
  visual_identity: {
    theme: string;
    aspect_ratios: string[];
    design_notes: string[];
  };
  posting_cadence: {
    posts_per_week: number;
    preferred_days: string[];
    preferred_hours_utc: number[];
  };
  cta_preferences: string[];
  default_hashtags: string[];
  signature_series: string[];
  topics_to_avoid: string[];
  content_pillars: BrandContentPillar[];
  updated_at: string;
}

export interface AuditLogRecord {
  id: string;
  timestamp: string;
  tool: string;
  operation: string;
  category: "READ" | "WRITE" | "DESTRUCTIVE";
  success: boolean;
  duration_ms?: number;
  summary?: string;
}

export interface NexsaiDatabaseState {
  version: "2.0.0";
  brand: BrandMemoryConfig;
  accounts: AccountRecord[];
  media: MediaRecord[];
  performance_snapshots: PerformanceSnapshotRecord[];
  classifications: ContentClassificationRecord[];
  research_items: ResearchItemRecord[];
  content_plans: ContentPlanRecord[];
  experiments: ExperimentRecord[];
  learned_observations: LearnedObservationRecord[];
  competitors: CompetitorProfileRecord[];
  audit_logs: AuditLogRecord[];
}

/**
 * SQL DDL for provisioning Supabase PostgreSQL tables when scaling to cloud relational storage.
 */
export const SUPABASE_POSTGRES_SCHEMA_SQL = `
-- NEXSAI Manager 2.0 — Supabase PostgreSQL Schema
CREATE TABLE IF NOT EXISTS nexsai_kv_store (
  key TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nexsai_accounts (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  platform_user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  account_type TEXT,
  followers_count INTEGER,
  media_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nexsai_media (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  platform_media_id TEXT UNIQUE NOT NULL,
  media_type TEXT NOT NULL,
  caption TEXT,
  permalink TEXT,
  media_url TEXT,
  content_hash TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nexsai_performance (
  id TEXT PRIMARY KEY,
  media_id TEXT NOT NULL,
  likes INTEGER,
  comments INTEGER,
  shares INTEGER,
  saves INTEGER,
  views INTEGER,
  reach INTEGER,
  total_interactions INTEGER,
  engagement_rate_pct NUMERIC(6,2),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`.trim();

export function ensureValidError(message: string, category: ErrorCategory = "VALIDATION_ERROR"): never {
  throw new NexsaiMcpError({
    category,
    message: redactSecrets(message),
  });
}

