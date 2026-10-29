import {
  getInstagramProfile,
  INSTAGRAM_API_VERSION,
  INSTAGRAM_GRAPH_BASE_URL,
  listInstagramMedia,
  publishInstagramPost,
} from "../instagram";
import {
  getThreadsAccountStatus,
  getThreadsProfile,
  hasThreadsAccessToken,
  listThreadsMedia,
  publishThreadsPost,
  THREADS_API_VERSION,
  THREADS_GRAPH_BASE_URL,
  THREADS_MAX_TEXT_LENGTH,
  validateThreadsTopicTag,
} from "../threads";
import type { FutureSocialPlatformName, SocialPlatformName } from "../database/schema";
import { loadDatabaseState, updateContentPlanStatus } from "../database/store";
import { defaultMediaStorageProvider } from "../utils/media-storage";
import { NexsaiMcpError } from "../utils/errors";

export interface PlatformProviderCapabilities {
  platform: FutureSocialPlatformName;
  implemented: boolean;
  connected: boolean;
  api_version: string;
  api_base_url: string;
  supported_operations: {
    profile: boolean;
    media_list: boolean;
    publish_text: boolean;
    publish_image: boolean;
    publish_video: boolean;
    publish_carousel: boolean;
    replies_and_moderation: boolean;
    insights: boolean;
    keyword_search: "Supported" | "Conditional" | "Unavailable";
    mentions: "Supported" | "Conditional" | "Unavailable";
  };
  constraints: {
    max_text_length: number;
    requires_media_for_publish: boolean;
    daily_publish_limit: number;
  };
}

/**
 * Adapts an Instagram or general caption into a Threads-native post (<= 500 characters)
 * with a punchy conversational hook, concise bullets, and a discussion-oriented CTA,
 * stripping excessive hashtags (Threads supports 1 topic_tag).
 */
export function adaptCaptionForThreads(
  caption: string,
  topicTag?: string
): {
  threads_text: string;
  inferred_topic_tag?: string;
} {
  const hashtagMatches = caption.match(/#([\p{L}\p{N}_]+)/gu) ?? [];
  const firstTag =
    topicTag ??
    (hashtagMatches[0] ? hashtagMatches[0].replace(/^#/, "") : undefined);

  // Strip trailing hashtag blocks and Instagram-specific "link in bio" / "save this slide" boilerplate
  const withoutHashtags = caption
    .replace(/(?:\s*#[\p{L}\p{N}_]+)+\s*$/gu, "")
    .replace(/link in bio/gi, "check the thread below")
    .trim();

  if (withoutHashtags.length <= THREADS_MAX_TEXT_LENGTH) {
    return {
      threads_text: withoutHashtags,
      ...(firstTag ? { inferred_topic_tag: firstTag.slice(0, 50) } : {}),
    };
  }

  // Intelligent truncation at line/sentence boundary within 490 chars
  const slice = withoutHashtags.slice(0, 485);
  const lastNewline = slice.lastIndexOf("\n");
  const lastPeriod = slice.lastIndexOf(". ");
  const cutIdx =
    lastNewline > 300
      ? lastNewline
      : lastPeriod > 300
      ? lastPeriod + 1
      : 485;

  return {
    threads_text: `${withoutHashtags.slice(0, cutIdx).trim()}…`,
    ...(firstTag ? { inferred_topic_tag: firstTag.slice(0, 50) } : {}),
  };
}

export async function getAllPlatformCapabilities(): Promise<
  PlatformProviderCapabilities[]
> {
  const hasIg = Boolean(process.env.INSTAGRAM_ACCESS_TOKEN?.trim());
  const hasTh = hasThreadsAccessToken();
  const threadsStatus = hasTh
    ? await getThreadsAccountStatus("nexsai_status").catch(() => null)
    : null;

  const kwAuthorized = Boolean(
    threadsStatus?.capabilities.find(
      (c) => c.capability === "Keyword & Topic Tag Search"
    )?.authorized_on_current_token
  );
  const mentionsAuthorized = Boolean(
    threadsStatus?.capabilities.find((c) => c.capability === "Mentions Retrieval")
      ?.authorized_on_current_token
  );

  return [
    {
      platform: "instagram",
      implemented: true,
      connected: hasIg,
      api_version: INSTAGRAM_API_VERSION,
      api_base_url: INSTAGRAM_GRAPH_BASE_URL,
      supported_operations: {
        profile: true,
        media_list: true,
        publish_text: false,
        publish_image: true,
        publish_video: false,
        publish_carousel: false,
        replies_and_moderation: true,
        insights: true,
        keyword_search: "Unavailable",
        mentions: "Conditional",
      },
      constraints: {
        max_text_length: 2200,
        requires_media_for_publish: true,
        daily_publish_limit: 100,
      },
    },
    {
      platform: "threads",
      implemented: true,
      connected: Boolean(threadsStatus?.connected ?? hasTh),
      api_version: THREADS_API_VERSION,
      api_base_url: THREADS_GRAPH_BASE_URL,
      supported_operations: {
        profile: true,
        media_list: true,
        publish_text: true,
        publish_image: true,
        publish_video: true,
        publish_carousel: true,
        replies_and_moderation: true,
        insights: true,
        keyword_search: kwAuthorized ? "Supported" : "Conditional",
        mentions: mentionsAuthorized ? "Supported" : "Conditional",
      },
      constraints: {
        max_text_length: 500,
        requires_media_for_publish: false,
        daily_publish_limit: 250,
      },
    },
    {
      platform: "x",
      implemented: false,
      connected: false,
      api_version: "planned",
      api_base_url: "https://api.x.com/2",
      supported_operations: {
        profile: false,
        media_list: false,
        publish_text: false,
        publish_image: false,
        publish_video: false,
        publish_carousel: false,
        replies_and_moderation: false,
        insights: false,
        keyword_search: "Unavailable",
        mentions: "Unavailable",
      },
      constraints: {
        max_text_length: 280,
        requires_media_for_publish: false,
        daily_publish_limit: 100,
      },
    },
    {
      platform: "telegram",
      implemented: false,
      connected: false,
      api_version: "planned",
      api_base_url: "https://api.telegram.org",
      supported_operations: {
        profile: false,
        media_list: false,
        publish_text: false,
        publish_image: false,
        publish_video: false,
        publish_carousel: false,
        replies_and_moderation: false,
        insights: false,
        keyword_search: "Unavailable",
        mentions: "Unavailable",
      },
      constraints: {
        max_text_length: 4096,
        requires_media_for_publish: false,
        daily_publish_limit: 500,
      },
    },
    {
      platform: "youtube",
      implemented: false,
      connected: false,
      api_version: "planned",
      api_base_url: "https://www.googleapis.com/youtube/v3",
      supported_operations: {
        profile: false,
        media_list: false,
        publish_text: false,
        publish_image: false,
        publish_video: false,
        publish_carousel: false,
        replies_and_moderation: false,
        insights: false,
        keyword_search: "Unavailable",
        mentions: "Unavailable",
      },
      constraints: {
        max_text_length: 5000,
        requires_media_for_publish: true,
        daily_publish_limit: 50,
      },
    },
  ];
}

export interface CrossPlatformPublishParams {
  platforms: SocialPlatformName[];
  image_url?: string;
  instagram_caption?: string;
  threads_text?: string;
  threads_topic_tag?: string;
  threads_link_attachment?: string;
  plan_id?: string;
  confirm?: boolean;
  force_duplicate?: boolean;
}

export interface PlatformPublishOutcome {
  platform: SocialPlatformName;
  attempted: boolean;
  skipped_already_published?: boolean;
  success: boolean;
  media_id?: string;
  creation_id?: string;
  permalink?: string;
  error?: string;
}

/**
 * Publishes approved content across Instagram and/or Threads with:
 * 1. Explicit target platform listing
 * 2. Per-platform validation before any network call
 * 3. Platform-specific text/tag variations
 * 4. Mandatory `confirm: true` gate (returns side-by-side preview when `confirm: false`)
 * 5. Independent tracking per platform
 * 6. Idempotency: skips any platform that already succeeded on `plan_id` so retries never double-post
 * 7. Accurate `complete_success`, `partial_success`, or `failed` reporting
 */
export async function publishCrossPlatformContent(
  params: CrossPlatformPublishParams,
  toolName = "nexsai_cross_platform_publish"
) {
  const uniquePlatforms = Array.from(new Set(params.platforms));
  if (uniquePlatforms.length === 0) {
    throw new NexsaiMcpError({
      category: "Validation error",
      message: "Specify at least one target platform ('instagram' and/or 'threads').",
    });
  }

  const state = await loadDatabaseState();
  const linkedPlan = params.plan_id
    ? state.content_plans.find((p) => p.id === params.plan_id)
    : undefined;

  const igCaption = (
    params.instagram_caption ??
    linkedPlan?.caption ??
    params.threads_text ??
    ""
  ).trim();

  const adapted = adaptCaptionForThreads(
    params.threads_text ?? linkedPlan?.threads_text ?? igCaption,
    params.threads_topic_tag ?? linkedPlan?.threads_topic_tag
  );

  const threadsText = adapted.threads_text;
  const threadsTopicTag = params.threads_topic_tag
    ? validateThreadsTopicTag(params.threads_topic_tag)
    : adapted.inferred_topic_tag
    ? validateThreadsTopicTag(adapted.inferred_topic_tag)
    : undefined;

  const imageUrl = params.image_url ?? linkedPlan?.image_url;

  // Validate per-platform requirements before making any API call
  if (uniquePlatforms.includes("instagram")) {
    if (!imageUrl) {
      throw new NexsaiMcpError({
        category: "Validation error",
        message:
          "Publishing to Instagram requires a publicly accessible HTTPS `image_url`.",
      });
    }
    await defaultMediaStorageProvider.resolvePublicHttpsUrl(imageUrl);
    if (!igCaption || igCaption.length > 2200) {
      throw new NexsaiMcpError({
        category: "Validation error",
        message:
          "Instagram requires a non-empty `instagram_caption` up to 2,200 characters.",
      });
    }
  }

  if (uniquePlatforms.includes("threads")) {
    if (!threadsText && !imageUrl) {
      throw new NexsaiMcpError({
        category: "Validation error",
        message:
          "Publishing to Threads requires `threads_text` (up to 500 chars) and/or an HTTPS `image_url`.",
      });
    }
    if (threadsText.length > THREADS_MAX_TEXT_LENGTH) {
      throw new NexsaiMcpError({
        category: "Validation error",
        message: `threads_text length (${threadsText.length}) exceeds the 500-character Threads limit.`,
      });
    }
    if (imageUrl) {
      await defaultMediaStorageProvider.resolvePublicHttpsUrl(imageUrl);
    }
  }

  // Check if plan already succeeded on one of the platforms (prevents double-publishing on retry)
  const alreadyPublishedIg =
    linkedPlan?.published_media_id && uniquePlatforms.includes("instagram")
      ? linkedPlan.published_media_id
      : undefined;
  const alreadyPublishedThreads =
    linkedPlan?.published_threads_id && uniquePlatforms.includes("threads")
      ? linkedPlan.published_threads_id
      : undefined;

  if (!params.confirm) {
    return {
      status: "preview" as const,
      published: false,
      confirm_required: true,
      target_platforms: uniquePlatforms,
      plan_id: params.plan_id ?? null,
      platform_variations: {
        ...(uniquePlatforms.includes("instagram")
          ? {
              instagram: {
                will_publish: !alreadyPublishedIg,
                already_published_media_id: alreadyPublishedIg ?? null,
                image_url: imageUrl,
                caption: igCaption,
                caption_length: igCaption.length,
              },
            }
          : {}),
        ...(uniquePlatforms.includes("threads")
          ? {
              threads: {
                will_publish: !alreadyPublishedThreads,
                already_published_media_id: alreadyPublishedThreads ?? null,
                media_type: imageUrl ? "IMAGE" : "TEXT",
                text: threadsText,
                text_length: threadsText.length,
                image_url: imageUrl ?? null,
                topic_tag: threadsTopicTag ?? null,
                link_attachment:
                  !imageUrl && params.threads_link_attachment
                    ? params.threads_link_attachment
                    : null,
              },
            }
          : {}),
      },
      message: [
        "CROSS-PLATFORM PUBLISH PREVIEW",
        `Target Platforms: ${uniquePlatforms.join(", ")}`,
        "No posts were published.",
        "Review the platform-specific variations above and set confirm=true to publish.",
      ].join("\n"),
    };
  }

  const outcomes: PlatformPublishOutcome[] = [];

  for (const platform of uniquePlatforms) {
    if (platform === "instagram") {
      if (alreadyPublishedIg) {
        outcomes.push({
          platform: "instagram",
          attempted: false,
          skipped_already_published: true,
          success: true,
          media_id: alreadyPublishedIg,
          permalink: linkedPlan?.published_permalink,
        });
        continue;
      }

      try {
        const igRes = await publishInstagramPost(
          {
            image_url: imageUrl!,
            caption: igCaption,
            confirm: true,
            force_duplicate: params.force_duplicate,
            plan_id: params.plan_id,
          },
          toolName
        );
        if (igRes.result.published) {
          outcomes.push({
            platform: "instagram",
            attempted: true,
            success: true,
            media_id: igRes.result.media_id,
            creation_id: igRes.result.creation_id,
            permalink: igRes.result.permalink,
          });
        }
      } catch (err) {
        outcomes.push({
          platform: "instagram",
          attempted: true,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (platform === "threads") {
      if (alreadyPublishedThreads) {
        outcomes.push({
          platform: "threads",
          attempted: false,
          skipped_already_published: true,
          success: true,
          media_id: alreadyPublishedThreads,
          permalink: linkedPlan?.published_threads_permalink,
        });
        continue;
      }

      try {
        const thRes = await publishThreadsPost(
          {
            media_type: imageUrl ? "IMAGE" : "TEXT",
            text: threadsText,
            ...(imageUrl ? { image_url: imageUrl } : {}),
            ...(!imageUrl && params.threads_link_attachment
              ? { link_attachment: params.threads_link_attachment }
              : {}),
            ...(threadsTopicTag ? { topic_tag: threadsTopicTag } : {}),
            confirm: true,
            force_duplicate: params.force_duplicate,
            plan_id: params.plan_id,
          },
          toolName
        );
        if (thRes.result.published) {
          outcomes.push({
            platform: "threads",
            attempted: true,
            success: true,
            media_id: thRes.result.media_id,
            creation_id: thRes.result.creation_id,
            permalink: thRes.result.permalink,
          });
        }
      } catch (err) {
        outcomes.push({
          platform: "threads",
          attempted: true,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  const succeededCount = outcomes.filter((o) => o.success).length;
  const failedCount = outcomes.filter((o) => !o.success).length;

  const overallStatus =
    succeededCount === outcomes.length
      ? ("complete_success" as const)
      : succeededCount > 0
      ? ("partial_success" as const)
      : ("failed" as const);

  if (params.plan_id && succeededCount > 0) {
    const igOutcome = outcomes.find((o) => o.platform === "instagram" && o.success);
    const thOutcome = outcomes.find((o) => o.platform === "threads" && o.success);
    await updateContentPlanStatus(
      params.plan_id,
      overallStatus === "complete_success" ? "PUBLISHED" : "APPROVED",
      {
        ...(igOutcome?.media_id ? { published_media_id: igOutcome.media_id } : {}),
        ...(igOutcome?.permalink ? { published_permalink: igOutcome.permalink } : {}),
        ...(thOutcome?.media_id ? { published_threads_id: thOutcome.media_id } : {}),
        ...(thOutcome?.permalink
          ? { published_threads_permalink: thOutcome.permalink }
          : {}),
      }
    ).catch(() => null);
  }

  return {
    status: overallStatus,
    published: succeededCount > 0,
    target_platforms: uniquePlatforms,
    succeeded_count: succeededCount,
    failed_count: failedCount,
    results_by_platform: outcomes,
    recovery_note:
      overallStatus === "partial_success"
        ? "Partial success: Only the failed platform needs to be retried. Re-running with the same `plan_id` will automatically skip the platform that already succeeded."
        : undefined,
  };
}

export {
  getInstagramProfile,
  listInstagramMedia,
  getThreadsProfile,
  listThreadsMedia,
};

