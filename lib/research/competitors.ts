import { loadDatabaseState, saveDatabaseState } from "../database/store";
import type { CompetitorProfileRecord } from "../database/schema";

export interface CompetitorAnalysisOutput {
  purpose_note: string;
  tracked_competitors: CompetitorProfileRecord[];
  nexsai_differentiation_strategy: {
    underserved_angles: string[];
    format_advantages: string[];
    content_gaps_to_exploit: string[];
  };
}

/**
 * Phase 19 — Competitor Intelligence (`nexsai_competitor_analysis`).
 * Uses legitimate public positioning & tracked competitor archetypes to identify
 * differentiation gaps for @nexsaicommunity (never scrapes privately or copies).
 */
export async function analyzeCompetitorLandscape(params?: {
  focus_category?: string;
  add_or_update_competitor?: {
    handle: string;
    name: string;
    category: string;
    typical_formats: string[];
    core_topics: string[];
    strengths: string[];
    differentiation_gap_for_nexsai: string;
  };
}): Promise<CompetitorAnalysisOutput> {
  const state = await loadDatabaseState();

  if (params?.add_or_update_competitor) {
    const incoming = params.add_or_update_competitor;
    const existingIdx = state.competitors.findIndex(
      (c) => c.handle.toLowerCase() === incoming.handle.toLowerCase()
    );
    const record: CompetitorProfileRecord = {
      id:
        existingIdx >= 0
          ? state.competitors[existingIdx].id
          : `comp_${Date.now()}`,
      ...incoming,
      updated_at: new Date().toISOString(),
    };
    if (existingIdx >= 0) {
      state.competitors[existingIdx] = record;
    } else {
      state.competitors.push(record);
    }
    await saveDatabaseState(state);
  }

  const filtered = params?.focus_category
    ? state.competitors.filter((c) =>
        c.category.toLowerCase().includes(params.focus_category!.toLowerCase())
      )
    : state.competitors;

  return {
    purpose_note:
      "Competitor intelligence is strictly for identifying differentiation gaps for @nexsaicommunity — never copy competitor captions or unverified claims.",
    tracked_competitors: filtered.length > 0 ? filtered : state.competitors,
    nexsai_differentiation_strategy: {
      underserved_angles: [
        "Hands-on free workflows with top-tier models (Claude, ChatGPT, Gemini) instead of shallow lists of 10 paid SaaS websites",
        "Honest engineering trade-offs (e.g., why 120Hz uses more battery, when local AI beats cloud AI)",
        "Visual architecture diagrams that students and developers want to bookmark/save",
      ],
      format_advantages: [
        "Step-by-step 5–7 slide CAROUSEL_ALBUM tutorials with high view-to-reach retention",
        "High-contrast single IMAGE hardware/tech explainers with scannable bullet breakdowns",
      ],
      content_gaps_to_exploit: [
        "Explain Model Context Protocol (MCP) and agentic AI workflows simply for everyday builders",
        "Bridge smartphone/laptop hardware physics (NPUs, displays, silicon) with modern AI capabilities",
      ],
    },
  };
}

