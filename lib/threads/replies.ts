import { threadsGraphRequest } from "./client";
import { publishThreadsPost } from "./publishing";
import type {
  ThreadsPaging,
  ThreadsRepliesListResponse,
  ThreadsReplyItem,
} from "./types";
import { NexsaiMcpError } from "../utils/errors";
import { logMcpOperation } from "../utils/logger";

export const THREADS_REPLY_FIELDS =
  "id,text,username,timestamp,media_type,permalink,hide_status,has_replies,root_post,replied_to,is_reply,is_reply_owned_by_me";

export interface ReadThreadsRepliesParams {
  media_id: string;
  reverse?: boolean;
  after?: string;
  before?: string;
}

/**
 * Retrieves immediate replies for a specific Threads post or reply (`GET /v1.0/{media_id}/replies`).
 * Strips raw `paging.next` and `paging.previous` URLs to prevent token exposure.
 */
export async function getThreadsReplies(
  params: ReadThreadsRepliesParams,
  toolName = "threads_read_replies"
): Promise<ThreadsRepliesListResponse> {
  const raw = await threadsGraphRequest<{
    data?: ThreadsReplyItem[];
    paging?: ThreadsPaging;
  }>({
    path: `/${encodeURIComponent(params.media_id)}/replies`,
    method: "GET",
    queryParams: {
      fields: THREADS_REPLY_FIELDS,
      ...(params.reverse !== undefined ? { reverse: params.reverse } : {}),
      ...(params.after ? { after: params.after } : {}),
      ...(params.before ? { before: params.before } : {}),
    },
    operationName: "getThreadsReplies",
    toolName,
  });

  const replies = raw.data ?? [];

  return {
    media_id: params.media_id,
    mode: "replies",
    count: replies.length,
    replies,
    paging: {
      ...(raw.paging?.cursors ? { cursors: raw.paging.cursors } : {}),
      has_next_page: Boolean(raw.paging?.next || raw.paging?.cursors?.after),
      has_previous_page: Boolean(
        raw.paging?.previous || raw.paging?.cursors?.before
      ),
    },
  };
}

/**
 * Retrieves the flat conversation thread under a root Threads post (`GET /v1.0/{media_id}/conversation`).
 */
export async function getThreadsConversation(
  params: ReadThreadsRepliesParams,
  toolName = "threads_conversation"
): Promise<ThreadsRepliesListResponse> {
  const raw = await threadsGraphRequest<{
    data?: ThreadsReplyItem[];
    paging?: ThreadsPaging;
  }>({
    path: `/${encodeURIComponent(params.media_id)}/conversation`,
    method: "GET",
    queryParams: {
      fields: THREADS_REPLY_FIELDS,
      ...(params.reverse !== undefined ? { reverse: params.reverse } : {}),
      ...(params.after ? { after: params.after } : {}),
      ...(params.before ? { before: params.before } : {}),
    },
    operationName: "getThreadsConversation",
    toolName,
  });

  const replies = raw.data ?? [];

  return {
    media_id: params.media_id,
    mode: "conversation",
    count: replies.length,
    replies,
    paging: {
      ...(raw.paging?.cursors ? { cursors: raw.paging.cursors } : {}),
      has_next_page: Boolean(raw.paging?.next || raw.paging?.cursors?.after),
      has_previous_page: Boolean(
        raw.paging?.previous || raw.paging?.cursors?.before
      ),
    },
  };
}

/**
 * Publishes a reply to a specific Threads post or reply (`reply_to_id`).
 * Strictly gated by `confirm: true`. When `confirm: false` (default), returns a preview without posting.
 */
export async function replyToThreadsPost(
  params: {
    reply_to_id: string;
    text: string;
    confirm?: boolean;
  },
  toolName = "threads_reply"
) {
  const text = params.text.trim();
  if (!text) {
    throw new NexsaiMcpError({
      category: "Validation error",
      message: "Reply text cannot be empty.",
    });
  }
  if (text.length > 500) {
    throw new NexsaiMcpError({
      category: "Validation error",
      message: `Threads reply text (${text.length} chars) cannot exceed 500 characters.`,
    });
  }

  if (!params.confirm) {
    logMcpOperation({
      level: "info",
      tool: toolName,
      operation: "replyToThreadsPost:preview",
      success: true,
      message: "Returned Threads reply preview (confirm=false).",
    });
    return {
      posted: false,
      confirm_required: true,
      preview: {
        platform: "threads",
        reply_to_id: params.reply_to_id,
        text,
        text_length: text.length,
      },
      message: `THREADS REPLY PREVIEW: Ready to reply to ${params.reply_to_id} with "${text}". No reply was posted. Set confirm=true to publish the reply.`,
    };
  }

  const pub = await publishThreadsPost(
    {
      media_type: "TEXT",
      text,
      reply_to_id: params.reply_to_id,
      confirm: true,
    },
    toolName
  );

  if (!pub.result.published) {
    return {
      posted: false,
      confirm_required: true,
      preview: pub.result.preview,
      message: pub.result.message,
    };
  }

  return {
    success: true,
    posted: true,
    platform: "threads",
    reply_to_id: params.reply_to_id,
    reply_id: pub.result.media_id,
    creation_id: pub.result.creation_id,
    ...(pub.result.permalink ? { permalink: pub.result.permalink } : {}),
    message: "Threads reply published successfully.",
  };
}

/**
 * Hides or unhides a reply on a Threads post owned by the authenticated user.
 * Official endpoint: `POST /v1.0/{reply_id}/manage_reply` with `hide=true|false`.
 * Gated by `confirm: true`.
 */
export async function manageThreadsReplyVisibility(
  params: {
    reply_id: string;
    hide?: boolean;
    confirm?: boolean;
  },
  toolName = "threads_manage_reply"
) {
  const hide = params.hide ?? true;
  const actionLabel = hide ? "hide" : "unhide";

  if (!params.confirm) {
    logMcpOperation({
      level: "info",
      tool: toolName,
      operation: `manageThreadsReplyVisibility:preview:${actionLabel}`,
      success: true,
      message: `Returned Threads ${actionLabel} reply preview (confirm=false).`,
    });
    return {
      executed: false,
      confirm_required: true,
      platform: "threads",
      action: actionLabel,
      reply_id: params.reply_id,
      message: `MODERATION PREVIEW: Ready to ${actionLabel} Threads reply ${params.reply_id}. No change made. Set confirm=true to execute.`,
    };
  }

  const res = await threadsGraphRequest<{ success?: boolean }>({
    path: `/${encodeURIComponent(params.reply_id)}/manage_reply`,
    method: "POST",
    formBody: {
      hide,
    },
    operationName: `manageThreadsReplyVisibility:${actionLabel}`,
    toolName,
  });

  return {
    success: Boolean(res.success ?? true),
    executed: true,
    platform: "threads",
    action: actionLabel,
    reply_id: params.reply_id,
    message: `Successfully executed '${actionLabel}' on Threads reply ${params.reply_id}.`,
  };
}

/**
 * Retrieves pending replies awaiting approval on a Threads post (`GET /v1.0/{media_id}/pending_replies`),
 * or approves/ignores a pending reply (`POST /v1.0/{reply_id}/manage_pending_reply`).
 *
 * Note: In the official Meta Threads API, `pending_replies` is Conditional — it only works on media posts
 * where reply approvals (`enable_reply_approvals=true`) were enabled. If reply approvals are not enabled
 * on the target post, Meta returns code 100 ("Reply approvals must be enabled for this media to access pending replies."),
 * which we handle cleanly and explain.
 */
export async function handleThreadsPendingReplies(
  params: {
    media_id?: string;
    reply_id?: string;
    approve?: boolean;
    confirm?: boolean;
    after?: string;
    before?: string;
  },
  toolName = "threads_pending_replies"
) {
  if (params.reply_id && params.approve !== undefined) {
    const actionLabel = params.approve ? "approve" : "ignore";
    if (!params.confirm) {
      return {
        executed: false,
        confirm_required: true,
        platform: "threads",
        action: actionLabel,
        reply_id: params.reply_id,
        message: `PENDING REPLY PREVIEW: Ready to ${actionLabel} pending Threads reply ${params.reply_id}. Set confirm=true to execute.`,
      };
    }

    const modRes = await threadsGraphRequest<{ success?: boolean }>({
      path: `/${encodeURIComponent(params.reply_id)}/manage_pending_reply`,
      method: "POST",
      formBody: {
        approve: params.approve,
      },
      operationName: `managePendingReply:${actionLabel}`,
      toolName,
    });

    return {
      success: Boolean(modRes.success ?? true),
      executed: true,
      platform: "threads",
      action: actionLabel,
      reply_id: params.reply_id,
      message: `Successfully executed '${actionLabel}' on pending Threads reply ${params.reply_id}.`,
    };
  }

  if (!params.media_id) {
    throw new NexsaiMcpError({
      category: "Validation error",
      message:
        "Provide `media_id` to list pending replies on a post, or `reply_id` + `approve` to moderate a specific pending reply.",
    });
  }

  try {
    const raw = await threadsGraphRequest<{
      data?: ThreadsReplyItem[];
      paging?: ThreadsPaging;
    }>({
      path: `/${encodeURIComponent(params.media_id)}/pending_replies`,
      method: "GET",
      queryParams: {
        fields: THREADS_REPLY_FIELDS,
        ...(params.after ? { after: params.after } : {}),
        ...(params.before ? { before: params.before } : {}),
      },
      operationName: "getThreadsPendingReplies",
      toolName,
    });

    const replies = raw.data ?? [];
    return {
      media_id: params.media_id,
      mode: "pending_replies" as const,
      capability_status: "Supported (Reply approvals enabled on this post)",
      count: replies.length,
      replies,
      paging: {
        ...(raw.paging?.cursors ? { cursors: raw.paging.cursors } : {}),
        has_next_page: Boolean(raw.paging?.next || raw.paging?.cursors?.after),
        has_previous_page: Boolean(
          raw.paging?.previous || raw.paging?.cursors?.before
        ),
      },
    };
  } catch (err) {
    if (
      err instanceof NexsaiMcpError &&
      /reply approvals must be enabled/i.test(err.message)
    ) {
      return {
        media_id: params.media_id,
        mode: "pending_replies" as const,
        capability_status: "Conditional",
        count: 0,
        replies: [],
        conditional_note:
          "Reply approvals are not enabled on this Threads post. Meta Threads API only exposes `/pending_replies` on posts published with `enable_reply_approvals=true`. Use `threads_read_replies` or `threads_conversation` to read standard replies on this post.",
      };
    }
    throw err;
  }
}

