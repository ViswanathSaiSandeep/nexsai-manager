import { NextResponse, connection } from "next/server";
import { captureAnalyticsSnapshot } from "../../../lib/analytics/analysis";
import { detectContentPatterns } from "../../../lib/analytics/patterns";
import {
  getDatabaseStorageInfo,
  loadDatabaseState,
} from "../../../lib/database/store";
import { executeNexsaiResearch } from "../../../lib/research/search";
import { INSTAGRAM_API_VERSION } from "../../../lib/instagram/client";
import {
  analyzeThreadsPerformance,
  getThreadsAccountStatus,
  hasThreadsAccessToken,
  THREADS_API_VERSION,
} from "../../../lib/threads";

export async function GET() {
  await connection();
  try {
    const state = await loadDatabaseState();

    const [liveIgSnapshot, threadsStatus, liveThreadsAnalysis] =
      await Promise.all([
        captureAnalyticsSnapshot({ limit: 8 }, "dashboard_api").catch(
          () => null
        ),
        getThreadsAccountStatus("dashboard_api").catch(() => null),
        hasThreadsAccessToken()
          ? analyzeThreadsPerformance({ limit: 8 }, "dashboard_api").catch(
              () => null
            )
          : Promise.resolve(null),
      ]);

    if (state.research_items.length === 0) {
      await executeNexsaiResearch(
        { topic: "AI tools LLM models developer tech", limit: 5 },
        "dashboard_api"
      ).catch(() => null);
    }

    const updatedState = await loadDatabaseState();
    const igPatterns = detectContentPatterns(
      liveIgSnapshot?.enriched_posts ?? [],
      updatedState.brand.content_pillars
    );

    const igAccount =
      liveIgSnapshot?.account ??
      updatedState.accounts.find((a) => a.platform === "instagram") ??
      null;

    const threadsAccount =
      threadsStatus?.profile ??
      updatedState.accounts.find((a) => a.platform === "threads") ??
      null;

    return NextResponse.json({
      ok: true,
      server_version: "3.0.0",
      api_version: INSTAGRAM_API_VERSION,
      threads_api_version: THREADS_API_VERSION,
      storage: getDatabaseStorageInfo(),
      account: igAccount,
      account_day_insights: liveIgSnapshot?.account_day_insights ?? {},
      threads: {
        connected: Boolean(threadsStatus?.connected),
        token_configured: Boolean(threadsStatus?.token_configured),
        profile: threadsAccount,
        publishing_limit: threadsStatus?.publishing_limit ?? null,
        capabilities: threadsStatus?.capabilities ?? [],
        account_insights:
          liveThreadsAnalysis?.account_context.account_insights_summary ?? null,
        posts: liveThreadsAnalysis?.OBSERVATION.posts ?? [],
        averages: liveThreadsAnalysis?.CALCULATION.averages ?? null,
        error: threadsStatus?.error ?? null,
      },
      brand: updatedState.brand,
      media: updatedState.media.slice(0, 16),
      performance_snapshots: updatedState.performance_snapshots.slice(0, 20),
      classifications: updatedState.classifications.slice(0, 16),
      patterns: {
        by_format: igPatterns.by_format,
        by_pillar: igPatterns.by_pillar,
        by_hook_type: igPatterns.by_hook_type,
        content_gaps: igPatterns.content_gaps,
      },
      research_items: updatedState.research_items.slice(0, 10),
      content_plans: updatedState.content_plans.slice(0, 14),
      experiments: updatedState.experiments,
      learned_observations: updatedState.learned_observations.slice(0, 10),
      competitors: updatedState.competitors,
      audit_logs: updatedState.audit_logs.slice(0, 15),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to load dashboard state",
      },
      { status: 500 }
    );
  }
}
