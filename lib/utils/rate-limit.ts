import { NexsaiMcpError } from "./errors";

/**
 * Simple in-memory rate-limiting and duplicate-publishing guard (Phase 13).
 *
 * Protects against accidental repeated publishing or rapid duplicate write operations
 * within the same server instance without requiring an external database.
 */

interface PublishRecord {
  fingerprint: string;
  timestampMs: number;
  mediaId: string;
}

// Minimum cooldown between identical (image_url + caption) publish calls: 5 minutes
const DUPLICATE_PUBLISH_WINDOW_MS = 5 * 60 * 1000;

// Minimum interval between any two actual publish executions: 10 seconds
const MIN_PUBLISH_INTERVAL_MS = 10 * 1000;

const recentPublishes: PublishRecord[] = [];
let lastPublishTimestampMs = 0;

function createPublishFingerprint(imageUrl: string, caption: string): string {
  return `${imageUrl.trim()}::${caption.trim()}`;
}

function pruneExpired(now: number): void {
  while (
    recentPublishes.length > 0 &&
    now - recentPublishes[0].timestampMs > DUPLICATE_PUBLISH_WINDOW_MS
  ) {
    recentPublishes.shift();
  }
}

/**
 * Checks whether a publish request is safe to execute (not a rapid duplicate or rate violation).
 * Throws NexsaiMcpError if blocked.
 */
export function checkPublishSafetyGuard(
  imageUrl: string,
  caption: string,
  now: number = Date.now()
): void {
  pruneExpired(now);

  if (
    lastPublishTimestampMs > 0 &&
    now - lastPublishTimestampMs < MIN_PUBLISH_INTERVAL_MS
  ) {
    const waitSec = Math.ceil(
      (MIN_PUBLISH_INTERVAL_MS - (now - lastPublishTimestampMs)) / 1000
    );
    throw new NexsaiMcpError({
      category: "Rate limit error",
      message: `Publish rate protection triggered: another post was published less than ${
        MIN_PUBLISH_INTERVAL_MS / 1000
      } seconds ago. Please wait ${waitSec}s before publishing again.`,
    });
  }

  const fingerprint = createPublishFingerprint(imageUrl, caption);
  const duplicate = recentPublishes.find((r) => r.fingerprint === fingerprint);
  if (duplicate) {
    const secondsAgo = Math.round((now - duplicate.timestampMs) / 1000);
    throw new NexsaiMcpError({
      category: "Duplicate publish protection",
      message: `Duplicate publish blocked: An identical post (same image_url and caption) was already published ${secondsAgo} seconds ago (media_id: ${duplicate.mediaId}).`,
    });
  }
}

/**
 * Records a completed publish operation so subsequent identical calls within the window are blocked.
 */
export function recordSuccessfulPublish(
  imageUrl: string,
  caption: string,
  mediaId: string,
  now: number = Date.now()
): void {
  pruneExpired(now);
  lastPublishTimestampMs = now;
  recentPublishes.push({
    fingerprint: createPublishFingerprint(imageUrl, caption),
    timestampMs: now,
    mediaId,
  });
}

/**
 * Resets the in-memory publish guard state (used in unit tests).
 */
export function resetPublishSafetyGuard(): void {
  recentPublishes.length = 0;
  lastPublishTimestampMs = 0;
}

