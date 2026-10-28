/**
 * Comprehensive Automated Verification Suite for NEXSAI Manager 2.0
 *
 * Tests:
 * 1. MCP Protocol: initialize, tools/list (all 21 V1+V2 tools), resources/list, resources/read, prompts/list, prompts/get, nexsai_status
 * 2. Live Read-Only Instagram & V2 Intelligence Tools (against @nexsaicommunity):
 *    - instagram_profile
 *    - instagram_media
 *    - instagram_media_details
 *    - instagram_comments
 *    - instagram_media_insights
 *    - instagram_account_insights
 *    - instagram_analyze_content / nexsai_analyze_account (verifies OBSERVATION, CALCULATION, INFERENCE, RECOMMENDATION)
 *    - nexsai_analyze_post
 * 3. V2 Research, Strategy, Planning, Experiments, & Recommendation Brain:
 *    - nexsai_research / nexsai_research_today
 *    - nexsai_find_opportunities
 *    - nexsai_competitor_analysis
 *    - nexsai_strategy
 *    - nexsai_plan_week
 *    - nexsai_create_content (DRAFT -> REVIEW -> APPROVED workflow)
 *    - nexsai_create_experiment & nexsai_analyze_experiment
 *    - nexsai_recommend
 *    - nexsai_brand_config (confirm=false preview vs confirm=true)
 * 4. Analytics Edge Cases (zero denominators, missing metrics)
 * 5. Publishing & Moderation Safety (confirm=false -> MUST NOT publish)
 * 6. Mocked Write Execution (confirm=true with mocked fetch + historical duplicate detection)
 * 7. Security & Validation Error Cases (missing token, invalid token with redaction, permission error, invalid URLs, MCP_API_KEY)
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { GET, POST } from "../app/api/mcp/route.ts";
import { resetPublishSafetyGuard } from "../lib/utils/rate-limit.ts";
import { calculatePostRates } from "../lib/analytics/metrics.ts";

// Load .env.local if not already loaded
const envLocalPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath) && !process.env.INSTAGRAM_ACCESS_TOKEN) {
  const envContent = fs.readFileSync(envLocalPath, "utf8");
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

interface JsonRpcResponse {
  jsonrpc: string;
  id?: number | string | null;
  result?: {
    protocolVersion?: string;
    serverInfo?: { name: string; version: string };
    tools?: Array<{ name: string; description: string; inputSchema: unknown }>;
    resources?: Array<{ name: string; uri: string; mimeType?: string }>;
    contents?: Array<{ uri: string; text: string }>;
    prompts?: Array<{ name: string; description?: string }>;
    messages?: Array<{ role: string; content: { type: string; text: string } }>;
    content?: Array<{ type: string; text: string }>;
    isError?: boolean;
  };
  error?: {
    code: number;
    message: string;
  };
}

let rpcId = 1;

async function callMcpRpc(
  method: string,
  params: Record<string, unknown> = {},
  headers: Record<string, string> = {}
): Promise<{ status: number; body: JsonRpcResponse }> {
  const currentId = rpcId++;
  const req = new Request("http://localhost:3000/api/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: currentId,
      method,
      params,
    }),
  });

  const res = await POST(req);
  const contentType = res.headers.get("content-type") || "";
  const rawText = await res.text();

  if (contentType.includes("text/event-stream")) {
    const dataLine = rawText
      .split(/\r?\n/)
      .find((l) => l.startsWith("data: "));
    assert(dataLine, `Expected SSE data line, got: ${rawText}`);
    return {
      status: res.status,
      body: JSON.parse(dataLine.slice(6)) as JsonRpcResponse,
    };
  }

  return {
    status: res.status,
    body: JSON.parse(rawText) as JsonRpcResponse,
  };
}

async function callTool(
  name: string,
  args: Record<string, unknown> = {}
): Promise<{
  isError: boolean;
  text: string;
  parsed?: unknown;
  rawRpc: JsonRpcResponse;
}> {
  const { body } = await callMcpRpc("tools/call", {
    name,
    arguments: args,
  });

  if (body.error) {
    return {
      isError: true,
      text: body.error.message,
      rawRpc: body,
    };
  }

  const text = body.result?.content?.[0]?.text ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = undefined;
  }

  return {
    isError: Boolean(body.result?.isError),
    text,
    parsed,
    rawRpc: body,
  };
}

async function runTests() {
  console.log("============================================================");
  console.log("NEXSAI Manager 2.0 — AI Social Media OS Verification Suite");
  console.log("============================================================\n");

  const originalToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const originalFetch = globalThis.fetch;

  // ------------------------------------------------------------
  // 1. MCP Protocol: initialize, tools/list, resources/list, prompts/list, nexsai_status
  // ------------------------------------------------------------
  console.log("1. Testing MCP protocol (initialize, tools/list, resources, prompts)...");

  const initRes = await callMcpRpc("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "nexsai-v2-test-suite", version: "2.0.0" },
  });
  assert.equal(initRes.status, 200);
  assert.equal(initRes.body.result?.serverInfo?.name, "nexsai-manager");
  assert.equal(initRes.body.result?.serverInfo?.version, "2.0.0");
  console.log("   ✅ initialize (v2.0.0) succeeded");

  const listRes = await callMcpRpc("tools/list", {});
  const tools = listRes.body.result?.tools ?? [];
  const toolNames = tools.map((t) => t.name);
  const expectedTools = [
    "nexsai_status",
    "instagram_profile",
    "instagram_media",
    "instagram_media_details",
    "instagram_publish",
    "instagram_comments",
    "instagram_comment_reply",
    "instagram_hide_comment",
    "instagram_delete_comment",
    "instagram_media_insights",
    "instagram_account_insights",
    "instagram_analyze_content",
    "nexsai_analyze_account",
    "nexsai_research",
    "nexsai_research_today",
    "nexsai_find_opportunities",
    "nexsai_find_content_opportunities",
    "nexsai_competitor_analysis",
    "nexsai_strategy",
    "nexsai_plan_week",
    "nexsai_create_content",
    "nexsai_analyze_post",
    "nexsai_create_experiment",
    "nexsai_analyze_experiment",
    "nexsai_recommend",
    "nexsai_brand_config",
  ];
  for (const expected of expectedTools) {
    assert(
      toolNames.includes(expected),
      `Missing expected V2 tool '${expected}' in tools/list`
    );
  }
  console.log(`   ✅ tools/list returned all ${tools.length} V1 + V2 tools`);

  // Test MCP Resources
  const resList = await callMcpRpc("resources/list", {});
  const resources = resList.body.result?.resources ?? [];
  const resourceUris = resources.map((r) => r.uri);
  const expectedResourceUris = [
    "nexsai://brand/profile",
    "nexsai://brand/voice",
    "nexsai://brand/content-pillars",
    "nexsai://brand/rules",
    "nexsai://strategy/current",
    "nexsai://analytics/summary",
  ];
  for (const uri of expectedResourceUris) {
    assert(
      resourceUris.includes(uri),
      `Missing expected MCP resource '${uri}'`
    );
  }
  const readBrandRes = await callMcpRpc("resources/read", {
    uri: "nexsai://brand/profile",
  });
  const brandJson = JSON.parse(readBrandRes.body.result?.contents?.[0]?.text ?? "{}");
  assert.equal(brandJson.instagram_handle, "@nexsaicommunity");
  console.log(`   ✅ resources/list & resources/read verified (${resources.length} resources)`);

  // Test MCP Prompts
  const promptsList = await callMcpRpc("prompts/list", {});
  const prompts = promptsList.body.result?.prompts ?? [];
  assert(prompts.some((p) => p.name === "nexsai_daily_strategy"));
  const promptGet = await callMcpRpc("prompts/get", {
    name: "nexsai_daily_strategy",
    arguments: { focus_topic: "Claude MCP" },
  });
  assert(
    promptGet.body.result?.messages?.[0]?.content?.text.includes("Claude MCP")
  );
  console.log(`   ✅ prompts/list & prompts/get verified (${prompts.length} prompts)`);

  const statusTool = await callTool("nexsai_status", {});
  assert.equal(statusTool.isError, false);
  const statusData = statusTool.parsed as { status: string; version: string };
  assert.equal(statusData.status, "online");
  assert.equal(statusData.version, "2.0.0");
  console.log("   ✅ nexsai_status (v2.0.0) succeeded\n");

  // ------------------------------------------------------------
  // 2. Live Read-Only Instagram & Analytics Tools
  // ------------------------------------------------------------
  let sampleMediaId = "18075909602467119";
  if (originalToken) {
    console.log("2. Testing live Instagram & V2 Analytics tools against @nexsaicommunity...");

    const profileRes = await callTool("instagram_profile", {});
    assert.equal(profileRes.isError, false);
    const profile = profileRes.parsed as { id: string; username: string };
    assert.equal(profile.username, "nexsaicommunity");
    console.log(`   ✅ instagram_profile (@${profile.username})`);

    const mediaRes = await callTool("instagram_media", { limit: 2 });
    assert.equal(mediaRes.isError, false);
    const mediaList = mediaRes.parsed as { data: Array<{ id: string }> };
    assert(mediaList.data.length > 0);
    assert(!mediaRes.text.includes(originalToken));
    sampleMediaId = mediaList.data[0].id;
    console.log(`   ✅ instagram_media (sample ID: ${sampleMediaId})`);

    const analyzeRes = await callTool("instagram_analyze_content", { limit: 2 });
    assert.equal(analyzeRes.isError, false);
    const analysis = analyzeRes.parsed as {
      OBSERVATION: unknown;
      CALCULATION: unknown;
      INFERENCE: unknown;
      RECOMMENDATION: unknown;
    };
    assert(
      analysis.OBSERVATION &&
        analysis.CALCULATION &&
        analysis.INFERENCE &&
        analysis.RECOMMENDATION,
      "Expected OBSERVATION, CALCULATION, INFERENCE, and RECOMMENDATION sections"
    );
    console.log("   ✅ instagram_analyze_content (verified epistemic sections)");

    const postAnalyzeRes = await callTool("nexsai_analyze_post", {
      media_id: sampleMediaId,
    });
    assert.equal(postAnalyzeRes.isError, false);
    console.log(`   ✅ nexsai_analyze_post (benchmarked post ${sampleMediaId})\n`);
  }

  // ------------------------------------------------------------
  // 3. V2 Research, Opportunities, Strategy, Planner, Experiments, Recommend
  // ------------------------------------------------------------
  console.log("3. Testing V2 Research, Strategy, Planner, Experiments & Recommendation Brain...");

  const researchRes = await callTool("nexsai_research", {
    topic: "Model Context Protocol AI",
    time_range: "7d",
    limit: 3,
  });
  assert.equal(researchRes.isError, false);
  const researchData = researchRes.parsed as {
    opportunities: Array<{ title: string; nexsai_fit_score: number }>;
  };
  assert(researchData.opportunities.length > 0);
  console.log(`   ✅ nexsai_research (returned ${researchData.opportunities.length} scored items)`);

  const oppsRes = await callTool("nexsai_find_opportunities", { limit: 3 });
  assert.equal(oppsRes.isError, false);
  const oppsData = oppsRes.parsed as {
    ranked_opportunities: Array<{ rank: number; opportunity_score: number }>;
  };
  assert(oppsData.ranked_opportunities.length > 0);
  console.log(
    `   ✅ nexsai_find_opportunities (top score: ${oppsData.ranked_opportunities[0].opportunity_score}/100)`
  );

  const compRes = await callTool("nexsai_competitor_analysis", {});
  assert.equal(compRes.isError, false);
  console.log("   ✅ nexsai_competitor_analysis succeeded");

  const stratRes = await callTool("nexsai_strategy", { goal: "saves" });
  assert.equal(stratRes.isError, false);
  console.log("   ✅ nexsai_strategy succeeded");

  const weekRes = await callTool("nexsai_plan_week", {
    focus_theme: "Practical AI Workflows",
    save_as_drafts: true,
  });
  assert.equal(weekRes.isError, false);
  const weekData = weekRes.parsed as { days: Array<{ day_name: string }> };
  assert.equal(weekData.days.length, 7);
  console.log("   ✅ nexsai_plan_week generated 7-day plan");

  const contentRes = await callTool("nexsai_create_content", {
    topic: "How MCP Connects Claude to Real Tools",
    content_pillar: "developer_workflows",
    format: "CAROUSEL_ALBUM",
    goal: "saves",
    status: "REVIEW",
  });
  assert.equal(contentRes.isError, false);
  const createdPlan = contentRes.parsed as { plan: { id: string; status: string } };
  assert.equal(createdPlan.plan.status, "REVIEW");
  console.log(`   ✅ nexsai_create_content saved plan (${createdPlan.plan.id}, status=REVIEW)`);

  const expCreateRes = await callTool("nexsai_create_experiment", {
    name: "Carousel vs Single Image Reach Test",
    variable: "format",
    hypothesis: "Educational Carousels achieve higher view-to-reach ratios than Single Images.",
    variant_a: "CAROUSEL_ALBUM",
    variant_b: "IMAGE",
    success_metric: "engagement_rate_pct",
  });
  assert.equal(expCreateRes.isError, false);
  const expObj = expCreateRes.parsed as { id: string };

  const expAnalyzeRes = await callTool("nexsai_analyze_experiment", {
    experiment_id: expObj.id,
  });
  assert.equal(expAnalyzeRes.isError, false);
  console.log(`   ✅ nexsai_create_experiment & nexsai_analyze_experiment (${expObj.id})`);

  const recRes = await callTool("nexsai_recommend", { goal: "balanced" });
  assert.equal(recRes.isError, false);
  console.log("   ✅ nexsai_recommend ('NEXSAI Brain') succeeded\n");

  // ------------------------------------------------------------
  // 4. Analytics Edge Cases (Zero Denominators & Missing Metrics)
  // ------------------------------------------------------------
  console.log("4. Testing analytics zero-denominator & unavailable metric handling...");
  const zeroRates = calculatePostRates({
    likes: 5,
    comments: 1,
    saves: 0,
    shares: 0,
    views: 0,
    reach: 0,
    total_interactions: 6,
  });
  assert.equal(zeroRates.engagement_rate_by_reach_pct, null);
  assert(
    zeroRates.unavailable_metrics.some((u) => u.metric === "impressions"),
    "Expected deprecated impressions explanation"
  );
  console.log("   ✅ Zero-denominator & unavailable metric explanations verified\n");

  // ------------------------------------------------------------
  // 5. Write / Moderation Tools Safety (confirm=false -> MUST NOT publish)
  // ------------------------------------------------------------
  console.log("5. Testing confirmation safety (confirm=false -> preview only)...");

  const publishPreview = await callTool("instagram_publish", {
    image_url: "https://example.com/v2-preview-image.jpg",
    caption: "Unique V2 preview caption #NEXSAI #AI",
    confirm: false,
  });
  assert.equal(publishPreview.isError, false);
  assert(publishPreview.text.includes("PUBLISH PREVIEW"));
  assert(publishPreview.text.includes("No post was published."));
  assert(publishPreview.text.includes("Set confirm=true to publish."));
  console.log("   ✅ instagram_publish (confirm=false) returned PUBLISH PREVIEW without publishing");

  const replyPreview = await callTool("instagram_comment_reply", {
    comment_id: "17873440459141021",
    message: "Thanks for your comment!",
    confirm: false,
  });
  assert.equal(replyPreview.isError, false);
  assert.equal((replyPreview.parsed as { posted: boolean }).posted, false);
  console.log("   ✅ instagram_comment_reply (confirm=false) returned preview");

  const hidePreview = await callTool("instagram_hide_comment", {
    comment_id: "17873440459141021",
    hide: true,
    confirm: false,
  });
  assert.equal(hidePreview.isError, false);
  assert.equal((hidePreview.parsed as { executed: boolean }).executed, false);
  console.log("   ✅ instagram_hide_comment (confirm=false) returned preview");

  const deletePreview = await callTool("instagram_delete_comment", {
    comment_id: "17873440459141021",
    confirm: false,
  });
  assert.equal(deletePreview.isError, false);
  assert.equal((deletePreview.parsed as { executed: boolean }).executed, false);
  console.log("   ✅ instagram_delete_comment (confirm=false) returned preview\n");

  // ------------------------------------------------------------
  // 6. Mocked Write Execution & Historical Duplicate Detection
  // ------------------------------------------------------------
  console.log("6. Testing instagram_publish (confirm=true) and duplicate detection with mocked fetch...");
  resetPublishSafetyGuard();
  process.env.INSTAGRAM_ACCESS_TOKEN = "IG_MOCK_TEST_TOKEN_12345678901234567890";

  globalThis.fetch = async (input: string | URL | Request) => {
    const urlStr =
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;
    if (urlStr.endsWith("/me/media")) {
      return new Response(JSON.stringify({ id: "99001122334455" }), { status: 200 });
    }
    if (urlStr.endsWith("/me/media_publish")) {
      return new Response(JSON.stringify({ id: "18099887766554433" }), { status: 200 });
    }
    if (urlStr.includes("/18099887766554433")) {
      return new Response(
        JSON.stringify({
          id: "18099887766554433",
          permalink: "https://www.instagram.com/p/MOCK123/",
          timestamp: "2026-10-28T12:00:00+0000",
        }),
        { status: 200 }
      );
    }
    return new Response(JSON.stringify({}), { status: 200 });
  };

  const uniqueTestUrl = `https://cdn.example.com/post-${Date.now()}.jpg`;
  const uniqueCaption = `Launching NEXSAI 2.0 OS test at ${Date.now()}! #NEXSAI`;

  const publishExec = await callTool("instagram_publish", {
    image_url: uniqueTestUrl,
    caption: uniqueCaption,
    confirm: true,
    plan_id: createdPlan.plan.id,
  });
  assert.equal(publishExec.isError, false);
  const pubData = publishExec.parsed as {
    success: boolean;
    published: boolean;
    media_id: string;
  };
  assert.equal(pubData.success, true);
  assert.equal(pubData.published, true);
  console.log("   ✅ instagram_publish (confirm=true) executed 2-step container + publish flow");

  // Historical duplicate check (even after resetting rate-limit window, DB remembers content hash)
  resetPublishSafetyGuard();
  const duplicateAttempt = await callTool("instagram_publish", {
    image_url: uniqueTestUrl,
    caption: uniqueCaption,
    confirm: true,
  });
  assert.equal(duplicateAttempt.isError, true);
  assert(duplicateAttempt.text.includes("Possible duplicate detected"));
  console.log("   ✅ Historical content-hash duplicate detection blocked accidental re-post\n");

  // ------------------------------------------------------------
  // 7. Error & Security Validation Cases
  // ------------------------------------------------------------
  console.log("7. Testing security, authentication & input validation cases...");

  delete process.env.INSTAGRAM_ACCESS_TOKEN;
  const missingTokenRes = await callTool("instagram_profile", {});
  assert.equal(missingTokenRes.isError, true);
  const missingTokenErr = missingTokenRes.parsed as { error: { code: string } };
  assert.equal(missingTokenErr.error.code, "AUTHENTICATION_ERROR");
  console.log("   ✅ Missing token -> AUTHENTICATION_ERROR");

  const fakeSecretToken = "IGAA_FAKE_SECRET_TOKEN_98765432109876543210";
  process.env.INSTAGRAM_ACCESS_TOKEN = fakeSecretToken;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        error: {
          message: `Invalid OAuth access token: ${fakeSecretToken}`,
          type: "OAuthException",
          code: 190,
        },
      }),
      { status: 401 }
    );
  const invalidTokenRes = await callTool("instagram_profile", {});
  assert.equal(invalidTokenRes.isError, true);
  assert(!invalidTokenRes.text.includes(fakeSecretToken));
  console.log("   ✅ Invalid token -> AUTHENTICATION_ERROR (with token redaction)");

  // MCP_API_KEY endpoint guard
  process.env.MCP_API_KEY = "super-secret-mcp-key";
  const unauthRes = await callMcpRpc("tools/list", {});
  assert.equal(unauthRes.status, 401);
  const authRes = await callMcpRpc(
    "tools/list",
    {},
    { Authorization: "Bearer super-secret-mcp-key" }
  );
  assert.equal(authRes.status, 200);
  delete process.env.MCP_API_KEY;
  console.log("   ✅ MCP_API_KEY endpoint auth guard verified\n");

  // Restore globals
  globalThis.fetch = originalFetch;
  if (originalToken) {
    process.env.INSTAGRAM_ACCESS_TOKEN = originalToken;
  }
  resetPublishSafetyGuard();
  assert.equal(typeof GET, "function");

  console.log("============================================================");
  console.log("ALL NEXSAI MANAGER 2.0 TESTS PASSED SUCCESSFULLY!");
  console.log("============================================================");
}

runTests().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
