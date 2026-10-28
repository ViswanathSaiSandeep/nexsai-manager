import {
  loadDatabaseState,
  saveContentPlan,
  updateContentPlanStatus,
} from "../database/store";
import type { ContentPillarId, ContentPlanRecord } from "../database/schema";
import { findContentOpportunities } from "./opportunities";

export interface WeeklyStrategyFocus {
  generated_at: string;
  brand_handle: string;
  weekly_priorities: Array<{
    priority_rank: number;
    focus_area: string;
    content_pillar: ContentPillarId;
    reason: string;
    recommended_format: "CAROUSEL_ALBUM" | "IMAGE" | "REELS";
    recommended_angle: string;
    goal: "reach" | "saves" | "engagement" | "followers" | "education";
  }>;
  active_learning_observations: string[];
  active_experiments_count: number;
  recommended_posting_cadence: {
    posts_per_week: number;
    preferred_days: string[];
    preferred_hours_utc: number[];
  };
}

/**
 * Phase 20 — Content Strategy Engine (`nexsai_strategy`).
 * Synthesizes recent performance, research trends, content gaps, brand pillars,
 * and learned observations into clear weekly priorities.
 */
export async function generateCurrentStrategy(
  focusGoal?: "reach" | "saves" | "engagement" | "followers" | "balanced"
): Promise<WeeklyStrategyFocus> {
  const [opportunities, state] = await Promise.all([
    findContentOpportunities({ limit: 5 }),
    loadDatabaseState(),
  ]);

  const priorities = opportunities.ranked_opportunities
    .slice(0, 4)
    .map((opp, index) => ({
      priority_rank: index + 1,
      focus_area: opp.topic,
      content_pillar: opp.content_pillar,
      reason: opp.why_this_opportunity.join("; "),
      recommended_format: opp.recommended_format,
      recommended_angle: opp.recommended_angle,
      goal:
        focusGoal && focusGoal !== "balanced" ? focusGoal : opp.goal,
    }));

  return {
    generated_at: new Date().toISOString(),
    brand_handle: state.brand.instagram_handle,
    weekly_priorities: priorities,
    active_learning_observations: state.learned_observations
      .slice(0, 5)
      .map((o) => o.observation),
    active_experiments_count: state.experiments.filter(
      (e) => e.status === "ACTIVE"
    ).length,
    recommended_posting_cadence: state.brand.posting_cadence,
  };
}

export interface SevenDayPlanDayItem {
  day_number: number;
  day_name: string;
  scheduled_date: string;
  topic: string;
  content_pillar: ContentPillarId;
  format: "CAROUSEL_ALBUM" | "IMAGE" | "REELS";
  goal: "reach" | "saves" | "engagement" | "followers" | "education";
  hook_idea: string;
  angle: string;
  reason: string;
  is_experiment_slot: boolean;
  saved_plan_id?: string;
}

const WEEKDAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

/**
 * Phase 21 — 7-Day Content Planner (`nexsai_plan_week`).
 * Generates a balanced 7-day content calendar across pillars without repetitive topics,
 * including dedicated experimental slots, and optionally saves drafts to the database.
 */
export async function generateSevenDayPlan(params: {
  focus_theme?: string;
  save_as_drafts?: boolean;
} = {}): Promise<{
  week_starting: string;
  focus_theme: string;
  days: SevenDayPlanDayItem[];
}> {
  const [oppsResult, state] = await Promise.all([
    findContentOpportunities({
      focus_topic: params.focus_theme,
      limit: 7,
    }),
    loadDatabaseState(),
  ]);

  const pillars = state.brand.content_pillars;
  const opps = oppsResult.ranked_opportunities;
  const baseDate = new Date();

  const days: SevenDayPlanDayItem[] = [];

  for (let i = 0; i < 7; i++) {
    const dayName = WEEKDAYS[i];
    const targetDate = new Date(baseDate.getTime() + i * 86400 * 1000);
    const dateStr = targetDate.toISOString().split("T")[0];

    // Rotate pillars across the 7 days to prevent repetitive topics
    const pillar = pillars[i % pillars.length];
    const matchedOpp = opps[i];
    const isExperimentSlot = i === 2 || i === 5; // Wednesday & Saturday experiment slots

    const topic = matchedOpp
      ? matchedOpp.topic
      : pillar.example_topics[i % pillar.example_topics.length] ??
        `${pillar.name} Deep Dive`;

    const format = isExperimentSlot
      ? i === 2
        ? "CAROUSEL_ALBUM"
        : "REELS"
      : matchedOpp?.recommended_format ??
        pillar.preferred_formats[0] ??
        "CAROUSEL_ALBUM";

    const hookIdea =
      matchedOpp?.recommended_hook ??
      `🚀 Top 3 takeaways on ${topic.slice(0, 48)}`;

    const angle =
      matchedOpp?.recommended_angle ??
      `Actionable breakdown tailored for ${state.brand.brand_name} audience.`;

    const reason = isExperimentSlot
      ? `Experimental slot testing ${format} hook & save-CTA conversion for pillar '${pillar.name}'.`
      : matchedOpp?.why_this_opportunity[0] ??
        `Maintains balanced weekly pillar distribution (${pillar.name}: ${pillar.target_share_pct}% target).`;

    let savedPlanId: string | undefined;
    if (params.save_as_drafts) {
      const saved = await saveContentPlan({
        topic,
        content_pillar: pillar.id,
        format,
        goal: pillar.primary_goal,
        scheduled_time: `${dateStr}T10:00:00Z`,
        status: "DRAFT",
        hook: hookIdea,
        caption: `${hookIdea}\n\n• Key insight 1\n• Key insight 2\n• Key insight 3\n\n🔔 Follow ${state.brand.instagram_handle} for daily AI & tech insights\n\n${state.brand.default_hashtags.slice(0, 5).join(" ")}`,
        cta: state.brand.cta_preferences[0] ?? "Follow @nexsaicommunity",
        hashtags: state.brand.default_hashtags.slice(0, 5),
        visual_brief: `${state.brand.visual_identity.theme} — ${format} covering ${topic}`,
      });
      savedPlanId = saved.id;
    }

    days.push({
      day_number: i + 1,
      day_name: dayName,
      scheduled_date: dateStr,
      topic,
      content_pillar: pillar.id,
      format,
      goal: pillar.primary_goal,
      hook_idea: hookIdea,
      angle,
      reason,
      is_experiment_slot: isExperimentSlot,
      ...(savedPlanId ? { saved_plan_id: savedPlanId } : {}),
    });
  }

  return {
    week_starting: baseDate.toISOString().split("T")[0],
    focus_theme:
      params.focus_theme ?? "Balanced AI Tools, Tech Explained & Breakthroughs",
    days,
  };
}

/**
 * Phase 22 & 23 — Content Creation & Approval Workflow (`nexsai_create_content`).
 * Provides structured context, brand constraints, and persists a content-plan record
 * in the approval lifecycle: DRAFT -> REVIEW -> APPROVED -> PUBLISHED -> ANALYZING.
 */
export async function createOrUpdateContentBrief(params: {
  plan_id?: string;
  topic: string;
  content_pillar?: ContentPillarId;
  format?: "IMAGE" | "CAROUSEL_ALBUM" | "REELS";
  goal?: "reach" | "saves" | "engagement" | "followers" | "education";
  hook?: string;
  headline?: string;
  caption?: string;
  cta?: string;
  hashtags?: string[];
  visual_brief?: string;
  carousel_slides?: string[];
  image_url?: string;
  scheduled_time?: string;
  status?: ContentPlanRecord["status"];
}): Promise<{
  plan: ContentPlanRecord;
  brand_constraints_applied: {
    max_caption_length: number;
    recommended_hashtag_count: string;
    aspect_ratios: string[];
    voice_style: string;
  };
  approval_workflow_next_step: string;
}> {
  const state = await loadDatabaseState();
  const pillarId = params.content_pillar ?? "ai_tools_productivity";
  const format = params.format ?? "CAROUSEL_ALBUM";
  const goal = params.goal ?? "saves";

  const hook =
    params.hook ??
    (format === "CAROUSEL_ALBUM"
      ? `🚀 Top 3 Things You Can Do With ${params.topic}:`
      : `👀 Ever wondered how ${params.topic} actually works?`);

  const cta =
    params.cta ??
    (goal === "saves"
      ? "💾 Save this guide for your next workflow & follow @nexsaicommunity"
      : "🔔 Follow @nexsaicommunity for daily AI & tech insights");

  const hashtags =
    params.hashtags && params.hashtags.length > 0
      ? params.hashtags
      : state.brand.default_hashtags.slice(0, 6);

  const defaultSlides =
    format === "CAROUSEL_ALBUM"
      ? [
          `Slide 1 (Hook): ${params.headline ?? hook}`,
          `Slide 2 (Core Problem / Context): Why ${params.topic} matters right now`,
          `Slide 3 (Step 1 / Capability 1): Practical breakdown with concrete example`,
          `Slide 4 (Step 2 / Capability 2): Key workflow or performance comparison`,
          `Slide 5 (Step 3 / Trade-off): Pro tip or limitation to keep in mind`,
          `Slide 6 (Summary & CTA): Quick recap + ${cta}`,
        ]
      : undefined;

  const caption =
    params.caption ??
    [
      hook,
      "",
      `• Point 1: Core capability of ${params.topic}`,
      "• Point 2: Practical workflow or benchmark",
      "• Point 3: Key trade-off to know",
      "",
      cta,
      "",
      hashtags.join(" "),
    ].join("\n");

  const visualBrief =
    params.visual_brief ??
    `Dark-mode tech card (${
      format === "REELS" ? "9:16 1080x1920" : "4:5 1080x1350"
    }). Bold headline '${
      params.headline ?? params.topic
    }', clean iconography, high-contrast electric cyan/white typography on deep zinc background.`;

  const status = params.status ?? "DRAFT";

  const savedPlan = await saveContentPlan({
    id: params.plan_id,
    topic: params.topic,
    content_pillar: pillarId,
    format,
    goal,
    scheduled_time: params.scheduled_time,
    status,
    hook,
    headline: params.headline ?? params.topic,
    caption,
    cta,
    hashtags,
    visual_brief: visualBrief,
    carousel_slides: params.carousel_slides ?? defaultSlides,
    image_url: params.image_url,
  });

  const nextStepMap: Record<ContentPlanRecord["status"], string> = {
    DRAFT:
      "Review the generated hook, caption, and visual brief with the user. Update status to 'REVIEW' or 'APPROVED' once refined.",
    REVIEW:
      "Awaiting human approval. Once approved by the user, transition status to 'APPROVED'.",
    APPROVED:
      "Content is approved! Provide a publicly accessible HTTPS image_url and call `instagram_publish` with `confirm: false` to preview, then `confirm: true` to publish.",
    SCHEDULED:
      "Content plan is scheduled in the NEXSAI calendar queue.",
    PUBLISHED:
      "Post is live! Call `nexsai_analyze_post` after 24–48 hours to benchmark performance.",
    ANALYZING:
      "Performance tracking in progress.",
    ARCHIVED: "Archived content plan.",
  };

  return {
    plan: savedPlan,
    brand_constraints_applied: {
      max_caption_length: 2200,
      recommended_hashtag_count: "5 to 8 focused tags",
      aspect_ratios: state.brand.visual_identity.aspect_ratios,
      voice_style: state.brand.voice_and_tone.style,
    },
    approval_workflow_next_step: nextStepMap[savedPlan.status],
  };
}

export { updateContentPlanStatus };

