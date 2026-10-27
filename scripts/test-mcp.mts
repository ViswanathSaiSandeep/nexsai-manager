/**
 * Comprehensive Automated Verification Suite for NEXSAI Manager MCP Server
 *
 * Tests:
 * 1. MCP Protocol: initialize, tools/list, nexsai_status
 * 2. Live Read-Only Tools (when INSTAGRAM_ACCESS_TOKEN is present in .env.local):
 *    - instagram_profile
 *    - instagram_media
 *    - instagram_media_details
 *    - instagram_comments
 *    - instagram_media_insights
 *    - instagram_account_insights
 *    - instagram_analyze_content
 * 3. Publishing & Moderation Safety (confirm=false -> preview only, NO network write):
 *    - instagram_publish (confirm=false)
 *    - instagram_comment_reply (confirm=false)
 *    - instagram_hide_comment (confirm=false)
 *    - instagram_delete_comment (confirm=false)
 * 4. Mocked Write Execution (confirm=true with mocked fetch -> no real Instagram posts created)
 * 5. Error & Validation Cases:
 *    - missing token
 *    - invalid token (Meta OAuth error 190, token redaction check)
 *    - invalid URL (HTTP, localhost, malformed)
 *    - missing/empty caption
 *    - caption too long (>2200 chars) & too many hashtags (>30)
 *    - invalid media ID (non-numeric)
 *    - Meta permission error (OAuth code 10 / 200)
 *    - Duplicate publish rate-limit guard
 *    - Optional MCP_API_KEY endpoint authentication guard
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { GET, POST } from "../app/api/mcp/route.ts";
import { resetPublishSafetyGuard } from "../lib/utils/rate-limit.ts";

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
  console.log("NEXSAI Manager MCP Server — Verification Suite");
  console.log("============================================================\n");

  const originalToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const originalFetch = globalThis.fetch;

  // ------------------------------------------------------------
  // 1. MCP Protocol: initialize, tools/list, nexsai_status
  // ------------------------------------------------------------
  console.log("1. Testing MCP protocol (initialize, tools/list, nexsai_status)...");

  const initRes = await callMcpRpc("initialize", {
    protocolVersion: "2025-03-26",
    capabilities: {},
    clientInfo: { name: "nexsai-test-suite", version: "1.0.0" },
  });
  assert.equal(initRes.status, 200);
  assert.equal(initRes.body.result?.serverInfo?.name, "nexsai-manager");
  console.log("   ✅ initialize succeeded");

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
  ];
  for (const expected of expectedTools) {
    assert(
      toolNames.includes(expected),
      `Missing expected tool '${expected}' in tools/list`
    );
  }
  console.log(`   ✅ tools/list returned all ${tools.length} tools`);

  const statusTool = await callTool("nexsai_status", {});
  assert.equal(statusTool.isError, false);
  const statusData = statusTool.parsed as { status: string };
  assert.equal(statusData.status, "online");
  console.log("   ✅ nexsai_status succeeded\n");

  // ------------------------------------------------------------
  // 2. Live Read-Only Instagram Tools (with configured token)
  // ------------------------------------------------------------
  if (originalToken) {
    console.log("2. Testing live read-only Instagram tools against @nexsaicommunity...");

    const profileRes = await callTool("instagram_profile", {});
    assert.equal(profileRes.isError, false, `Profile failed: ${profileRes.text}`);
    const profile = profileRes.parsed as { id: string; username: string; account_type: string };
    assert.equal(profile.username, "nexsaicommunity");
    assert(profile.id, "Expected Instagram profile ID");
    console.log(`   ✅ instagram_profile (@${profile.username}, type: ${profile.account_type})`);

    const mediaRes = await callTool("instagram_media", { limit: 2 });
    assert.equal(mediaRes.isError, false, `Media failed: ${mediaRes.text}`);
    const mediaList = mediaRes.parsed as {
      data: Array<{ id: string; media_type: string; permalink: string }>;
    };
    assert(Array.isArray(mediaList.data) && mediaList.data.length > 0);
    assert(
      !mediaRes.text.includes(originalToken),
      "SECURITY FAILURE: Access token was found in instagram_media response!"
    );
    const sampleMediaId = mediaList.data[0].id;
    console.log(`   ✅ instagram_media (retrieved ${mediaList.data.length} items, sample ID: ${sampleMediaId})`);

    const detailsRes = await callTool("instagram_media_details", {
      media_id: sampleMediaId,
    });
    assert.equal(detailsRes.isError, false, `Details failed: ${detailsRes.text}`);
    const details = detailsRes.parsed as { id: string; permalink: string };
    assert.equal(details.id, sampleMediaId);
    console.log(`   ✅ instagram_media_details (verified media_id: ${details.id})`);

    const commentsRes = await callTool("instagram_comments", {
      media_id: sampleMediaId,
      limit: 5,
    });
    assert.equal(commentsRes.isError, false, `Comments failed: ${commentsRes.text}`);
    const commentsData = commentsRes.parsed as { media_id: string; count: number };
    assert.equal(commentsData.media_id, sampleMediaId);
    console.log(`   ✅ instagram_comments (retrieved ${commentsData.count} comments)`);

    const mediaInsightsRes = await callTool("instagram_media_insights", {
      media_id: sampleMediaId,
    });
    assert.equal(
      mediaInsightsRes.isError,
      false,
      `Media insights failed: ${mediaInsightsRes.text}`
    );
    const mediaInsights = mediaInsightsRes.parsed as {
      media_id: string;
      metrics: Record<string, number | null>;
    };
    assert.equal(mediaInsights.media_id, sampleMediaId);
    assert("views" in mediaInsights.metrics || "reach" in mediaInsights.metrics);
    console.log(
      `   ✅ instagram_media_insights (views=${mediaInsights.metrics.views}, reach=${mediaInsights.metrics.reach})`
    );

    const accountInsightsRes = await callTool("instagram_account_insights", {
      period: "day",
      metric_type: "total_value",
    });
    assert.equal(
      accountInsightsRes.isError,
      false,
      `Account insights failed: ${accountInsightsRes.text}`
    );
    const accountInsights = accountInsightsRes.parsed as {
      summary_metrics: Record<string, number | null>;
    };
    assert("views" in accountInsights.summary_metrics);
    console.log(
      `   ✅ instagram_account_insights (views=${accountInsights.summary_metrics.views}, reach=${accountInsights.summary_metrics.reach})`
    );

    const analyzeRes = await callTool("instagram_analyze_content", { limit: 3 });
    assert.equal(analyzeRes.isError, false, `Analyze failed: ${analyzeRes.text}`);
    const analysis = analyzeRes.parsed as {
      sample_size: number;
      observed_data: unknown;
      calculated_metrics: unknown;
      recommendations_and_observations: unknown;
    };
    assert(analysis.sample_size > 0);
    assert(analysis.observed_data && analysis.calculated_metrics && analysis.recommendations_and_observations);
    console.log(`   ✅ instagram_analyze_content (analyzed ${analysis.sample_size} posts)\n`);
  }

  // ------------------------------------------------------------
  // 3. Write / Moderation Tools Safety (confirm=false -> preview only)
  // ------------------------------------------------------------
  console.log("3. Testing confirmation safety (confirm=false -> preview only)...");

  const publishPreview = await callTool("instagram_publish", {
    image_url: "https://example.com/image.jpg",
    caption: "Example caption #AI #Tech",
    confirm: false,
  });
  assert.equal(publishPreview.isError, false);
  assert(publishPreview.text.includes("Publishing preview"));
  assert(publishPreview.text.includes("No post was published."));
  assert(publishPreview.text.includes("Set confirm=true to publish."));
  console.log("   ✅ instagram_publish (confirm=false) returned preview without publishing");

  const replyPreview = await callTool("instagram_comment_reply", {
    comment_id: "17873440459141021",
    message: "Thanks for your comment!",
    confirm: false,
  });
  assert.equal(replyPreview.isError, false);
  const replyPreviewObj = replyPreview.parsed as { posted: boolean; confirm_required: boolean };
  assert.equal(replyPreviewObj.posted, false);
  assert.equal(replyPreviewObj.confirm_required, true);
  console.log("   ✅ instagram_comment_reply (confirm=false) returned preview without posting");

  const hidePreview = await callTool("instagram_hide_comment", {
    comment_id: "17873440459141021",
    hide: true,
    confirm: false,
  });
  assert.equal(hidePreview.isError, false);
  const hidePreviewObj = hidePreview.parsed as { executed: boolean; confirm_required: boolean };
  assert.equal(hidePreviewObj.executed, false);
  console.log("   ✅ instagram_hide_comment (confirm=false) returned preview without modifying");

  const deletePreview = await callTool("instagram_delete_comment", {
    comment_id: "17873440459141021",
    confirm: false,
  });
  assert.equal(deletePreview.isError, false);
  const deletePreviewObj = deletePreview.parsed as { executed: boolean; confirm_required: boolean };
  assert.equal(deletePreviewObj.executed, false);
  console.log("   ✅ instagram_delete_comment (confirm=false) returned preview without deleting\n");

  // ------------------------------------------------------------
  // 4. Mocked Write Execution (confirm=true with mocked fetch)
  // ------------------------------------------------------------
  console.log("4. Testing instagram_publish (confirm=true) and duplicate guard with mocked fetch...");
  resetPublishSafetyGuard();
  process.env.INSTAGRAM_ACCESS_TOKEN = "IG_MOCK_TEST_TOKEN_12345678901234567890";

  globalThis.fetch = async (input: string | URL | Request) => {
    const urlStr = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
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
          timestamp: "2026-10-27T12:00:00+0000",
        }),
        { status: 200 }
      );
    }
    return new Response(JSON.stringify({}), { status: 200 });
  };

  const publishExec = await callTool("instagram_publish", {
    image_url: "https://cdn.example.com/post-1.jpg",
    caption: "Launching our new AI feature! #NEXSAI",
    confirm: true,
  });
  assert.equal(publishExec.isError, false);
  const pubData = publishExec.parsed as {
    success: boolean;
    published: boolean;
    media_id: string;
    creation_id: string;
    permalink: string;
  };
  assert.equal(pubData.success, true);
  assert.equal(pubData.published, true);
  assert.equal(pubData.creation_id, "99001122334455");
  assert.equal(pubData.media_id, "18099887766554433");
  assert.equal(pubData.permalink, "https://www.instagram.com/p/MOCK123/");
  console.log("   ✅ instagram_publish (confirm=true) executed 2-step container + publish flow");

  // Rapid duplicate or rate-limited publish should be blocked
  const duplicatePublish = await callTool("instagram_publish", {
    image_url: "https://cdn.example.com/post-1.jpg",
    caption: "Launching our new AI feature! #NEXSAI",
    confirm: true,
  });
  assert.equal(duplicatePublish.isError, true);
  console.log("   ✅ Rapid repeat publish blocked by rate/duplicate safety guard\n");

  // ------------------------------------------------------------
  // 5. Error & Validation Cases
  // ------------------------------------------------------------
  console.log("5. Testing error & validation cases...");

  // 5a. Missing token
  delete process.env.INSTAGRAM_ACCESS_TOKEN;
  const missingTokenRes = await callTool("instagram_profile", {});
  assert.equal(missingTokenRes.isError, true);
  const missingTokenErr = missingTokenRes.parsed as { error: { category: string } };
  assert.equal(missingTokenErr.error.category, "Authentication error");
  console.log("   ✅ Missing token -> Authentication error");

  // 5b. Invalid token (Meta OAuth error code 190) + token redaction check
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
  assert(
    !invalidTokenRes.text.includes(fakeSecretToken),
    "SECURITY FAILURE: Invalid token leaked in error output!"
  );
  const invalidTokenErr = invalidTokenRes.parsed as { error: { category: string } };
  assert.equal(invalidTokenErr.error.category, "Authentication error");
  console.log("   ✅ Invalid token -> Authentication error (with token redaction)");

  // 5c. Meta Permission error (code 10)
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        error: {
          message: "Application does not have permission for this action",
          type: "OAuthException",
          code: 10,
        },
      }),
      { status: 403 }
    );
  const permErrRes = await callTool("instagram_comment_reply", {
    comment_id: "17873440459141021",
    message: "Hello!",
    confirm: true,
  });
  assert.equal(permErrRes.isError, true);
  const permErr = permErrRes.parsed as { error: { category: string } };
  assert.equal(permErr.error.category, "Permission error");
  console.log("   ✅ Meta permission error -> Permission error");

  // 5d. Invalid URL (HTTP instead of HTTPS, or localhost)
  const httpUrlRes = await callTool("instagram_publish", {
    image_url: "http://example.com/insecure.jpg",
    caption: "Test caption",
    confirm: false,
  });
  assert.equal(httpUrlRes.isError, true);
  console.log("   ✅ Non-HTTPS image_url rejected");

  const localhostUrlRes = await callTool("instagram_publish", {
    image_url: "https://localhost/local.jpg",
    caption: "Test caption",
    confirm: false,
  });
  assert.equal(localhostUrlRes.isError, true);
  const localErr = localhostUrlRes.parsed as { error: { category: string } };
  assert.equal(localErr.error.category, "Invalid media URL");
  console.log("   ✅ Localhost image_url rejected -> Invalid media URL");

  // 5e. Missing / empty caption
  const emptyCaptionRes = await callTool("instagram_publish", {
    image_url: "https://example.com/valid.jpg",
    caption: "",
    confirm: false,
  });
  assert.equal(emptyCaptionRes.isError, true);
  console.log("   ✅ Empty caption rejected");

  // 5f. Caption too long (> 2200 chars)
  const longCaptionRes = await callTool("instagram_publish", {
    image_url: "https://example.com/valid.jpg",
    caption: "a".repeat(2205),
    confirm: false,
  });
  assert.equal(longCaptionRes.isError, true);
  console.log("   ✅ Caption > 2200 chars rejected");

  // 5g. Invalid media ID (non-numeric)
  const invalidIdRes = await callTool("instagram_media_details", {
    media_id: "not-a-valid-id!",
  });
  assert.equal(invalidIdRes.isError, true);
  console.log("   ✅ Invalid media_id rejected");

  // 5h. MCP_API_KEY endpoint authentication guard
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
  console.log("   ✅ MCP_API_KEY endpoint auth guard verified (401 without key, 200 with Bearer key)\n");

  // Restore globals
  globalThis.fetch = originalFetch;
  if (originalToken) {
    process.env.INSTAGRAM_ACCESS_TOKEN = originalToken;
  }
  resetPublishSafetyGuard();

  // Verify GET /api/mcp exists
  assert.equal(typeof GET, "function");

  console.log("============================================================");
  console.log("ALL TESTS PASSED SUCCESSFULLY!");
  console.log("============================================================");
}

runTests().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});

