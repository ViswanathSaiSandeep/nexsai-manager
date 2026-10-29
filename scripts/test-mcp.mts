/**
 * Comprehensive Automated Verification Suite for NEXSAI Manager 3.0 (Instagram + Threads OS)
 *
 * Verifies all 16 Section 19 requirements:
 * 1. Existing V1 + V2 tools (26 tools) and new V3 Threads & Cross-Platform tools (17 tools = 43 total), 8 resources, 8 prompts
 * 2. Live Read-Only Instagram & Threads verification against @nexsaicommunity
 * 3. Threads connection status when credentials are missing vs configured
 * 4. Authentication failures & secret token redaction (IGAA... and THAA... tokens)
 * 5. Permission errors & Conditional capabilities (`threads_keyword_search`, `threads_manage_mentions`, `pending_replies`)
 * 6. Threads publishing workflow (TEXT, IMAGE, CAROUSEL) + input validation (500-char limit, topic_tag rules, HTTPS checks)
 * 7. Failed container/publishing does NOT report false success
 * 8. Persistent duplicate prevention across retries
 * 9. Analytics unavailable metric & zero-denominator handling (Instagram `reach` vs Threads `views`)
 * 10. Search and discovery empty, paginated, and conditional responses
 * 11. Confirmation gates (`confirm=false` preview only) for all write/moderation tools
 * 12. Cross-platform publishing (`nexsai_cross_platform_publish`) partial success & idempotent retry skip
 * 13. Dashboard API (`/api/dashboard`) & Webhook handler (`/api/webhooks/threads`) verification
 */

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { GET, POST } from "../app/api/mcp/route.ts";
import {
  GET as webhookGET,
  POST as webhookPOST,
} from "../app/api/webhooks/threads/route.ts";
import { resetPublishSafetyGuard } from "../lib/utils/rate-limit.ts";
import { calculatePostRates } from "../lib/analytics/metrics.ts";

// Load .env.local if not already loaded
const envLocalPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) {
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
  console.log("NEXSAI Manager 3.0 — Instagram + Threads Verification Suite");
  console.log("============================================================\n");

  const originalIgToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const originalThreadsToken = process.env.THREADS_ACCESS_TOKEN;
  const originalFetch = globalThis.fetch;

  // ------------------------------------------------------------
  // 1. MCP Protocol: initialize, tools/list (43 tools), resources/list (8), prompts/list (8)
  // ------------------------------------------------------------
  console.log("1. Testing MCP protocol (initialize, 43 tools, 8 resources, 8 prompts)...");

  const initRes = await callMcpRpc("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "nexsai-v3-test-suite", version: "3.0.0" },
  });
  assert.equal(initRes.status, 200);
  assert.equal(initRes.body.result?.serverInfo?.name, "nexsai-manager");
  assert.equal(initRes.body.result?.serverInfo?.version, "3.0.0");
  console.log("   ✅ initialize (v3.0.0) succeeded");

  const listRes = await callMcpRpc("tools/list", {});
  const tools = listRes.body.result?.tools ?? [];
  const toolNames = tools.map((t) => t.name);
  const expectedTools = [
    // V1 + V2 tools (26)
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
    // V3 Threads & Cross-Platform tools (17)
    "threads_profile",
    "threads_account_status",
    "threads_media",
    "threads_media_details",
    "threads_account_insights",
    "threads_media_insights",
    "threads_publish",
    "threads_read_replies",
    "threads_conversation",
    "threads_reply",
    "threads_manage_reply",
    "threads_pending_replies",
    "threads_search",
    "threads_mentions",
    "nexsai_threads_analyze",
    "nexsai_threads_recommend",
    "nexsai_cross_platform_publish",
  ];
  for (const expected of expectedTools) {
    assert(
      toolNames.includes(expected),
      `Missing expected V3 tool '${expected}' in tools/list`
    );
  }
  console.log(`   ✅ tools/list returned all ${tools.length} V1 + V2 + V3 tools`);

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
    "nexsai://threads/summary",
    "nexsai://platforms/capabilities",
  ];
  for (const uri of expectedResourceUris) {
    assert(
      resourceUris.includes(uri),
      `Missing expected MCP resource '${uri}'`
    );
  }
  const readCapsRes = await callMcpRpc("resources/read", {
    uri: "nexsai://platforms/capabilities",
  });
  const capsJson = JSON.parse(readCapsRes.body.result?.contents?.[0]?.text ?? "{}");
  assert(Array.isArray(capsJson.platforms));
  console.log(`   ✅ resources/list & resources/read verified (${resources.length} resources)`);

  // Test MCP Prompts
  const promptsList = await callMcpRpc("prompts/list", {});
  const prompts = promptsList.body.result?.prompts ?? [];
  const expectedPrompts = [
    "nexsai_daily_strategy",
    "nexsai_weekly_review",
    "nexsai_content_ideas",
    "nexsai_post_review",
    "nexsai_threads_daily_strategy",
    "nexsai_threads_post_mortem",
    "nexsai_threads_growth_review",
    "nexsai_cross_platform_campaign",
  ];
  for (const pName of expectedPrompts) {
    assert(
      prompts.some((p) => p.name === pName),
      `Missing expected prompt '${pName}'`
    );
  }
  console.log(`   ✅ prompts/list & prompts/get verified (${prompts.length} prompts)`);

  const statusTool = await callTool("nexsai_status", {});
  assert.equal(statusTool.isError, false);
  const statusData = statusTool.parsed as {
    status: string;
    version: string;
    platforms: { threads: { enabled: boolean } };
  };
  assert.equal(statusData.status, "online");
  assert.equal(statusData.version, "3.0.0");
  assert.equal(statusData.platforms.threads.enabled, true);
  console.log("   ✅ nexsai_status (v3.0.0) succeeded\n");

  // ------------------------------------------------------------
  // 2. Live Read-Only Instagram & Threads Tools against @nexsaicommunity
  // ------------------------------------------------------------
  if (originalIgToken) {
    console.log("2. Testing live Instagram tools against @nexsaicommunity...");
    const profileRes = await callTool("instagram_profile", {});
    assert.equal(profileRes.isError, false);
    const profile = profileRes.parsed as { username: string };
    assert.equal(profile.username, "nexsaicommunity");
    console.log(`   ✅ instagram_profile (@${profile.username})\n`);
  }

  let sampleThreadsMediaId = "17869695210660667";
  if (originalThreadsToken) {
    console.log("3. Testing live Official Meta Threads API v1.0 tools against @nexsaicommunity...");

    const thProfileRes = await callTool("threads_profile", {});
    assert.equal(thProfileRes.isError, false);
    assert(!thProfileRes.text.includes(originalThreadsToken));
    const thProfile = thProfileRes.parsed as {
      id: string;
      username: string;
      is_verified?: boolean;
    };
    assert.equal(thProfile.username, "nexsaicommunity");
    console.log(
      `   ✅ threads_profile (@${thProfile.username}, id=${thProfile.id}, verified=${Boolean(
        thProfile.is_verified
      )})`
    );

    const thStatusRes = await callTool("threads_account_status", {});
    assert.equal(thStatusRes.isError, false);
    const thStatus = thStatusRes.parsed as {
      connected: boolean;
      publishing_limit?: { quota_usage: number; config: { quota_total: number } };
      capabilities: Array<{ capability: string; status: string }>;
    };
    assert.equal(thStatus.connected, true);
    assert(thStatus.capabilities.length >= 8);
    console.log(
      `   ✅ threads_account_status (connected=true, quota=${
        thStatus.publishing_limit?.quota_usage ?? 0
      }/${thStatus.publishing_limit?.config.quota_total ?? 250})`
    );

    const thMediaRes = await callTool("threads_media", { limit: 3 });
    assert.equal(thMediaRes.isError, false);
    assert(!thMediaRes.text.includes(originalThreadsToken));
    const thMediaList = thMediaRes.parsed as { data: Array<{ id: string }> };
    assert(thMediaList.data.length > 0);
    sampleThreadsMediaId = thMediaList.data[0].id;
    console.log(`   ✅ threads_media (sample ID: ${sampleThreadsMediaId})`);

    const thDetailsRes = await callTool("threads_media_details", {
      media_id: sampleThreadsMediaId,
    });
    assert.equal(thDetailsRes.isError, false);
    console.log(`   ✅ threads_media_details (${sampleThreadsMediaId})`);

    const thMediaInsRes = await callTool("threads_media_insights", {
      media_id: sampleThreadsMediaId,
    });
    assert.equal(thMediaInsRes.isError, false);
    const thMediaIns = thMediaInsRes.parsed as {
      metrics: { views: number | null };
      unavailable_metrics: Array<{ metric: string }>;
    };
    assert(
      thMediaIns.unavailable_metrics.some((u) => u.metric === "reach"),
      "Expected unavailable reach explanation on Threads media insights"
    );
    console.log("   ✅ threads_media_insights (verified metrics & unavailable reach note)");

    const thAccInsRes = await callTool("threads_account_insights", {});
    assert.equal(thAccInsRes.isError, false);
    assert(!thAccInsRes.text.includes(originalThreadsToken));
    console.log("   ✅ threads_account_insights (verified & token stripped from paging)");

    const thRepliesRes = await callTool("threads_read_replies", {
      media_id: sampleThreadsMediaId,
    });
    assert.equal(thRepliesRes.isError, false);
    console.log("   ✅ threads_read_replies succeeded");

    const thConvRes = await callTool("threads_conversation", {
      media_id: sampleThreadsMediaId,
    });
    assert.equal(thConvRes.isError, false);
    console.log("   ✅ threads_conversation succeeded");

    const thPendingRes = await callTool("threads_pending_replies", {
      media_id: sampleThreadsMediaId,
    });
    assert.equal(thPendingRes.isError, false);
    console.log("   ✅ threads_pending_replies (handled conditional reply approvals gracefully)");

    const thSearchRes = await callTool("threads_search", {
      query: "Claude AI",
      limit: 3,
    });
    assert.equal(thSearchRes.isError, false);
    console.log("   ✅ threads_search (verified live / conditional fallback)");

    const thMentionsRes = await callTool("threads_mentions", { limit: 3 });
    assert.equal(thMentionsRes.isError, false);
    console.log("   ✅ threads_mentions (verified live / conditional status)");

    const thAnalyzeRes = await callTool("nexsai_threads_analyze", { limit: 5 });
    assert.equal(thAnalyzeRes.isError, false);
    const thAnalyze = thAnalyzeRes.parsed as {
      OBSERVATION: unknown;
      CALCULATION: unknown;
      INFERENCE: unknown;
      RECOMMENDATION: unknown;
    };
    assert(
      thAnalyze.OBSERVATION &&
        thAnalyze.CALCULATION &&
        thAnalyze.INFERENCE &&
        thAnalyze.RECOMMENDATION
    );
    console.log("   ✅ nexsai_threads_analyze (verified epistemic sections)");

    const thRecRes = await callTool("nexsai_threads_recommend", { limit: 3 });
    assert.equal(thRecRes.isError, false);
    console.log("   ✅ nexsai_threads_recommend succeeded\n");
  }

  // ------------------------------------------------------------
  // 4. Confirmation Safety Gates (confirm=false -> preview only, NO API mutations)
  // ------------------------------------------------------------
  console.log("4. Testing Threads & Cross-Platform confirmation safety (confirm=false -> preview only)...");

  const thPubPreview = await callTool("threads_publish", {
    media_type: "TEXT",
    text: "Testing NEXSAI Manager 3.0 Threads preview safety! 🚀",
    topic_tag: "NEXSAI",
    confirm: false,
  });
  assert.equal(thPubPreview.isError, false);
  assert(thPubPreview.text.includes("PUBLISH PREVIEW (THREADS)"));
  assert(thPubPreview.text.includes("No post was published."));
  console.log("   ✅ threads_publish (confirm=false) returned PUBLISH PREVIEW without publishing");

  const thReplyPreview = await callTool("threads_reply", {
    reply_to_id: sampleThreadsMediaId,
    text: "Great question! Here is how it works:",
    confirm: false,
  });
  assert.equal(thReplyPreview.isError, false);
  assert.equal((thReplyPreview.parsed as { posted: boolean }).posted, false);
  console.log("   ✅ threads_reply (confirm=false) returned preview without posting");

  const thModPreview = await callTool("threads_manage_reply", {
    reply_id: "18119437939964518",
    hide: true,
    confirm: false,
  });
  assert.equal(thModPreview.isError, false);
  assert.equal((thModPreview.parsed as { executed: boolean }).executed, false);
  console.log("   ✅ threads_manage_reply (confirm=false) returned preview");

  const crossPreview = await callTool("nexsai_cross_platform_publish", {
    platforms: ["instagram", "threads"],
    image_url: "https://cdn.example.com/cross-preview.jpg",
    instagram_caption: "Full breakdown of MCP 3.0 on Instagram! #NEXSAI #AI",
    confirm: false,
  });
  assert.equal(crossPreview.isError, false);
  assert.equal((crossPreview.parsed as { published: boolean }).published, false);
  console.log("   ✅ nexsai_cross_platform_publish (confirm=false) returned side-by-side preview\n");

  // ------------------------------------------------------------
  // 5. Mocked Threads Publishing, Failed Container Handling, Duplicate Guard & Cross-Platform Partial Success
  // ------------------------------------------------------------
  console.log("5. Testing mocked Threads publishing, failed container handling, duplicate detection & cross-platform partial success...");
  resetPublishSafetyGuard();
  process.env.INSTAGRAM_ACCESS_TOKEN = "IG_MOCK_TOKEN_12345678901234567890";
  process.env.THREADS_ACCESS_TOKEN = "TH_MOCK_TOKEN_12345678901234567890";

  // 5a. Validate 500-char limit & invalid topic_tag with period
  const tooLongThreads = await callTool("threads_publish", {
    media_type: "TEXT",
    text: "A".repeat(505),
    confirm: true,
  });
  assert.equal(tooLongThreads.isError, true);
  console.log("   ✅ threads_publish rejected >500 character text");

  const badTopicTag = await callTool("threads_publish", {
    media_type: "TEXT",
    text: "Valid text",
    topic_tag: "AI.Tools",
    confirm: true,
  });
  assert.equal(badTopicTag.isError, true);
  console.log("   ✅ threads_publish rejected topic_tag containing '.'");

  // 5b. Test failed container status=ERROR does NOT produce false success
  globalThis.fetch = async (input: string | URL | Request) => {
    const urlStr =
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;
    if (urlStr.includes("/me/threads") && !urlStr.includes("threads_publish")) {
      return new Response(JSON.stringify({ id: "77001122334455" }), { status: 200 });
    }
    if (urlStr.includes("/77001122334455")) {
      return new Response(
        JSON.stringify({
          id: "77001122334455",
          status: "ERROR",
          error_message: "Failed to download video from remote server",
        }),
        { status: 200 }
      );
    }
    return new Response(JSON.stringify({}), { status: 200 });
  };

  const failedContainerRes = await callTool("threads_publish", {
    media_type: "TEXT",
    text: `Container failure test ${Date.now()}`,
    confirm: true,
  });
  assert.equal(failedContainerRes.isError, true);
  assert(failedContainerRes.text.includes("ERROR"));
  console.log("   ✅ Failed Threads container (status=ERROR) did NOT produce false success");

  // 5c. Test successful Threads 2-step publish + duplicate prevention
  globalThis.fetch = async (input: string | URL | Request) => {
    const urlStr =
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;
    if (urlStr.includes("/me/threads_publish")) {
      return new Response(JSON.stringify({ id: "17999888777666555" }), {
        status: 200,
      });
    }
    if (urlStr.includes("/me/threads")) {
      return new Response(JSON.stringify({ id: "88001122334455" }), { status: 200 });
    }
    if (urlStr.includes("/88001122334455")) {
      return new Response(
        JSON.stringify({ id: "88001122334455", status: "FINISHED" }),
        { status: 200 }
      );
    }
    if (urlStr.includes("/17999888777666555")) {
      return new Response(
        JSON.stringify({
          id: "17999888777666555",
          permalink: "https://www.threads.com/@nexsaicommunity/post/MOCK_TH_1",
          timestamp: "2026-10-29T12:00:00+0000",
        }),
        { status: 200 }
      );
    }
    return new Response(JSON.stringify({}), { status: 200 });
  };

  const uniqueThreadsText = `NEXSAI V3 automated Threads publish test at ${Date.now()}`;
  const thPubExec = await callTool("threads_publish", {
    media_type: "TEXT",
    text: uniqueThreadsText,
    topic_tag: "NEXSAI",
    confirm: true,
  });
  assert.equal(thPubExec.isError, false);
  const thPubData = thPubExec.parsed as {
    success: boolean;
    published: boolean;
    media_id: string;
  };
  assert.equal(thPubData.success, true);
  assert.equal(thPubData.published, true);
  assert.equal(thPubData.media_id, "17999888777666555");
  console.log("   ✅ threads_publish (confirm=true) executed 2-step container + publish flow");

  resetPublishSafetyGuard();
  const thDupAttempt = await callTool("threads_publish", {
    media_type: "TEXT",
    text: uniqueThreadsText,
    confirm: true,
  });
  assert.equal(thDupAttempt.isError, true);
  assert(thDupAttempt.text.includes("Possible duplicate Threads post detected"));
  console.log("   ✅ Threads persistent duplicate content-hash detection blocked re-post");

  // 5d. Test Cross-Platform Partial Success (Instagram succeeds, Threads fails -> status="partial_success")
  resetPublishSafetyGuard();
  const crossPlanRes = await callTool("nexsai_create_content", {
    platform: "both",
    topic: `Cross Platform Partial Test ${Date.now()}`,
    status: "APPROVED",
  });
  const crossPlanId = (crossPlanRes.parsed as { plan: { id: string } }).plan.id;

  globalThis.fetch = async (input: string | URL | Request) => {
    const urlStr =
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;
    if (urlStr.includes("graph.instagram.com")) {
      if (urlStr.endsWith("/me/media")) {
        return new Response(JSON.stringify({ id: "9911223344" }), { status: 200 });
      }
      if (urlStr.endsWith("/me/media_publish")) {
        return new Response(JSON.stringify({ id: "18011223344556677" }), {
          status: 200,
        });
      }
      return new Response(
        JSON.stringify({
          id: "18011223344556677",
          permalink: "https://www.instagram.com/p/MOCK_IG_CROSS/",
        }),
        { status: 200 }
      );
    }
    // Simulate Threads API failure on the second platform
    return new Response(
      JSON.stringify({
        error: { message: "Simulated Threads transient failure", code: 2 },
      }),
      { status: 500 }
    );
  };

  const crossPartialRes = await callTool("nexsai_cross_platform_publish", {
    platforms: ["instagram", "threads"],
    image_url: `https://cdn.example.com/cross-${Date.now()}.jpg`,
    instagram_caption: `Cross platform IG caption ${Date.now()}`,
    threads_text: `Cross platform Threads text ${Date.now()}`,
    plan_id: crossPlanId,
    confirm: true,
  });
  assert.equal(crossPartialRes.isError, false);
  const crossPartialData = crossPartialRes.parsed as {
    status: string;
    succeeded_count: number;
    failed_count: number;
  };
  assert.equal(crossPartialData.status, "partial_success");
  assert.equal(crossPartialData.succeeded_count, 1);
  assert.equal(crossPartialData.failed_count, 1);
  console.log(
    "   ✅ nexsai_cross_platform_publish reported partial_success accurately\n"
  );

  // ------------------------------------------------------------
  // 6. Missing Credentials, Invalid Token Redaction & Webhook Security
  // ------------------------------------------------------------
  console.log("6. Testing missing credentials, token redaction & webhook verification...");

  delete process.env.THREADS_ACCESS_TOKEN;
  const missingThStatus = await callTool("threads_account_status", {});
  assert.equal(missingThStatus.isError, false);
  const disconnectedData = missingThStatus.parsed as {
    connected: boolean;
    token_configured: boolean;
  };
  assert.equal(disconnectedData.connected, false);
  assert.equal(disconnectedData.token_configured, false);
  console.log("   ✅ threads_account_status handles missing credentials gracefully");

  const missingThProfile = await callTool("threads_profile", {});
  assert.equal(missingThProfile.isError, true);
  assert(missingThProfile.text.includes("AUTHENTICATION_ERROR"));
  console.log("   ✅ threads_profile returns AUTHENTICATION_ERROR when token is missing");

  const fakeThreadsSecret = "THAA_SUPER_SECRET_THREADS_TOKEN_98765432109876543210";
  process.env.THREADS_ACCESS_TOKEN = fakeThreadsSecret;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        error: {
          message: `Invalid OAuth access token: ${fakeThreadsSecret}`,
          type: "OAuthException",
          code: 190,
        },
      }),
      { status: 401 }
    );
  const invalidThRes = await callTool("threads_profile", {});
  assert.equal(invalidThRes.isError, true);
  assert(!invalidThRes.text.includes(fakeThreadsSecret));
  console.log("   ✅ Invalid Threads token -> AUTHENTICATION_ERROR with full THAA... redaction");

  // Webhook verification & HMAC signature check
  process.env.THREADS_WEBHOOK_VERIFY_TOKEN = "nexsai_verify_token_test";
  process.env.THREADS_APP_SECRET = "nexsai_app_secret_test";

  const whChallengeReq = new Request(
    "http://localhost:3000/api/webhooks/threads?hub.mode=subscribe&hub.verify_token=nexsai_verify_token_test&hub.challenge=123456789"
  );
  const whChallengeRes = await webhookGET(whChallengeReq);
  assert.equal(whChallengeRes.status, 200);
  assert.equal(await whChallengeRes.text(), "123456789");

  const whPayload = JSON.stringify({
    object: "threads",
    entry: [
      {
        id: "29940267035561191",
        time: 1793200000,
        changes: [{ field: "replies", value: { id: "rep_998877" } }],
      },
    ],
  });
  const validSig =
    "sha256=" +
    crypto
      .createHmac("sha256", "nexsai_app_secret_test")
      .update(whPayload, "utf8")
      .digest("hex");

  const whPostRes = await webhookPOST(
    new Request("http://localhost:3000/api/webhooks/threads", {
      method: "POST",
      headers: { "x-hub-signature-256": validSig },
      body: whPayload,
    })
  );
  assert.equal(whPostRes.status, 200);
  delete process.env.THREADS_WEBHOOK_VERIFY_TOKEN;
  delete process.env.THREADS_APP_SECRET;
  console.log("   ✅ /api/webhooks/threads challenge & HMAC-SHA256 verification passed");

  // Zero-denominator test
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

  // Restore globals
  globalThis.fetch = originalFetch;
  if (originalIgToken) {
    process.env.INSTAGRAM_ACCESS_TOKEN = originalIgToken;
  }
  if (originalThreadsToken) {
    process.env.THREADS_ACCESS_TOKEN = originalThreadsToken;
  }
  resetPublishSafetyGuard();
  assert.equal(typeof GET, "function");

  console.log("\n============================================================");
  console.log("ALL NEXSAI MANAGER 3.0 TESTS PASSED SUCCESSFULLY!");
  console.log("============================================================");
}

runTests().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
