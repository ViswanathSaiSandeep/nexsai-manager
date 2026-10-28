import { NextResponse, connection } from "next/server";
import { captureAnalyticsSnapshot } from "../../../lib/analytics/analysis";
import { detectContentPatterns } from "../../../lib/analytics/patterns";
import { getDatabaseStorageInfo, loadDatabaseState } from "../../../lib/database/store";
import { executeNexsaiResearch } from "../../../lib/research/search";
import { INSTAGRAM_API_VERSION } from "../../../lib/instagram/client";

export async function GET() {
  await connection();
  try {
    const state = await loadDatabaseState();

    // Sync live Instagram snapshot if token is configured
    const liveSnapshot = await captureAnalyticsSnapshot(
      { limit: 8 },
      "dashboard_api"
    ).catch(() => null);

    // Ensure at least initial research items exist
    if (state.research_items.length === 0) {
      await executeNexsaiResearch(
        { topic: "AI tools LLM models developer tech", limit: 5 },
        "dashboard_api"
      ).catch(() => null);
    }

    const updatedState = await loadDatabaseState();
    const patterns = detectContentPatterns(
      liveSnapshot?.enriched_posts ?? [],
      updatedState.brand.content_pillars
    );

    return NextResponse.json({
      ok: true,
      server_version: "2.0.0",
      api_version: INSTAGRAM_API_VERSION,
      storage: getDatabaseStorageInfo(),
      account: liveSnapshot?.account ?? updatedState.accounts[0] ?? null,
      account_day_insights: liveSnapshot?.account_day_insights ?? {},
      brand: updatedState.brand,
      media: updatedState.media.slice(0, 12),
      performance_snapshots: updatedState.performance_snapshots.slice(0, 12),
      classifications: updatedState.classifications.slice(0, 12),
      patterns: {
        by_format: patterns.by_format,
        by_pillar: patterns.by_pillar,
        by_hook_type: patterns.by_hook_type,
        content_gaps: patterns.content_gaps,
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
        error: error instanceof Error ? error.message : "Failed to load dashboard state",
      },
      { status: 500 }
    );
  }
}

