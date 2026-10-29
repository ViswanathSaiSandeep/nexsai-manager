import crypto from "node:crypto";
import { appendWebhookEvent } from "../../../../lib/database/store";
import { logMcpOperation } from "../../../../lib/utils/logger";

/**
 * Meta Threads & Instagram Webhook Endpoint (`/api/webhooks/threads`)
 *
 * - GET: Responds to Meta App Dashboard Webhook subscription verification (`hub.mode=subscribe`, `hub.verify_token`, `hub.challenge`).
 * - POST: Verifies `x-hub-signature-256` HMAC-SHA256 signature using `THREADS_APP_SECRET`,
 *   deduplicates incoming webhook events, and stores them in the NEXSAI database.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const verifyToken = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const expectedToken = process.env.THREADS_WEBHOOK_VERIFY_TOKEN?.trim();

  if (!expectedToken) {
    return Response.json(
      {
        ok: false,
        error:
          "THREADS_WEBHOOK_VERIFY_TOKEN is not configured in environment variables.",
      },
      { status: 503 }
    );
  }

  if (mode === "subscribe" && verifyToken === expectedToken && challenge) {
    logMcpOperation({
      level: "info",
      operation: "threadsWebhookVerify",
      success: true,
      message: "Verified Meta Threads webhook subscription challenge.",
    });
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return Response.json(
    { ok: false, error: "Invalid webhook verification token or hub.mode." },
    { status: 403 }
  );
}

function verifyMetaSignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.THREADS_APP_SECRET?.trim();
  if (!appSecret || !signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false;
  }
  const expectedHmac = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest("hex");
  const providedHmac = signatureHeader.slice(7).trim();
  const bufA = Buffer.from(expectedHmac);
  const bufB = Buffer.from(providedHmac);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  const hasAppSecret = Boolean(process.env.THREADS_APP_SECRET?.trim());

  if (hasAppSecret && !verifyMetaSignature(rawBody, signature)) {
    logMcpOperation({
      level: "warn",
      operation: "threadsWebhookReceive",
      success: false,
      errorType: "Authentication error",
      message: "Rejected Threads webhook with invalid x-hub-signature-256.",
    });
    return Response.json(
      { ok: false, error: "Invalid x-hub-signature-256 signature." },
      { status: 401 }
    );
  }

  try {
    const payload = JSON.parse(rawBody) as {
      object?: string;
      entry?: Array<{
        id?: string;
        time?: number;
        changes?: Array<{
          field?: string;
          value?: Record<string, unknown>;
        }>;
      }>;
    };

    const entries = payload.entry ?? [];
    let recordedCount = 0;

    for (const entry of entries) {
      for (const change of entry.changes ?? []) {
        const field = change.field ?? "unknown";
        const valId =
          typeof change.value?.id === "string"
            ? change.value.id
            : entry.id ?? String(entry.time ?? Date.now());
        const eventId = `wh_threads_${field}_${valId}_${entry.time ?? ""}`;

        const res = await appendWebhookEvent({
          id: eventId,
          platform: "threads",
          event_type: field,
          object_id: valId,
          verified_signature: hasAppSecret,
          summary: `Threads webhook event '${field}' on object ${valId}`,
        });
        if (res.recorded) recordedCount += 1;
      }
    }

    return Response.json({
      ok: true,
      recorded_events: recordedCount,
    });
  } catch {
    return Response.json(
      { ok: false, error: "Malformed JSON webhook payload." },
      { status: 400 }
    );
  }
}
