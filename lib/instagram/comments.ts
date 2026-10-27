import { instagramGraphRequest } from "./client";
import type {
  InstagramCommentItem,
  InstagramCommentModerationResult,
  InstagramCommentReplyResult,
  InstagramCommentsListResponse,
  InstagramPaging,
} from "./types";
import { logMcpOperation } from "../utils/logger";
import { NexsaiMcpError } from "../utils/errors";

const COMMENT_FIELDS = [
  "id",
  "text",
  "timestamp",
  "username",
  "from",
  "like_count",
  "hidden",
  "parent_id",
  "replies{id,text,timestamp,username,from,like_count,hidden}",
].join(",");

export interface ListInstagramCommentsParams {
  media_id: string;
  limit?: number;
  after?: string;
  before?: string;
}

interface RawCommentsResponse {
  data?: InstagramCommentItem[];
  paging?: InstagramPaging;
}

/**
 * Retrieves comments (and nested replies) for a specific Instagram media post.
 * Strips raw paging URLs so access tokens are never leaked.
 */
export async function getInstagramComments(
  params: ListInstagramCommentsParams,
  toolName = "instagram_comments"
): Promise<InstagramCommentsListResponse> {
  const limit = params.limit ?? 25;

  const raw = await instagramGraphRequest<RawCommentsResponse>({
    path: `/${encodeURIComponent(params.media_id)}/comments`,
    method: "GET",
    queryParams: {
      fields: COMMENT_FIELDS,
      limit,
      after: params.after,
      before: params.before,
    },
    operationName: "getInstagramComments",
    toolName,
  });

  const comments = (raw.data ?? []).map((c) => ({
    ...c,
    username: c.username ?? c.from?.username,
    replies: c.replies?.data
      ? {
          data: c.replies.data.map((r) => ({
            ...r,
            username: r.username ?? r.from?.username,
          })),
        }
      : undefined,
  }));

  return {
    media_id: params.media_id,
    count: comments.length,
    comments,
    paging: raw.paging
      ? {
          cursors: raw.paging.cursors,
          has_next_page: Boolean(raw.paging.next),
          has_previous_page: Boolean(raw.paging.previous),
        }
      : undefined,
  };
}

export interface ReplyToInstagramCommentParams {
  comment_id: string;
  message: string;
  confirm?: boolean;
}

/**
 * Replies to an Instagram comment on a post owned by the connected account.
 * Requires `confirm=true` before posting; returns a preview when `confirm=false`.
 */
export async function replyToInstagramComment(
  params: ReplyToInstagramCommentParams,
  toolName = "instagram_comment_reply"
): Promise<InstagramCommentReplyResult> {
  const trimmedMessage = params.message.trim();
  if (!trimmedMessage) {
    throw new NexsaiMcpError({
      category: "Validation error",
      message: "Reply message cannot be empty.",
    });
  }
  if (trimmedMessage.length > 2200) {
    throw new NexsaiMcpError({
      category: "Validation error",
      message: `Reply message length (${trimmedMessage.length}) exceeds Instagram maximum of 2200 characters.`,
    });
  }

  const confirm = params.confirm === true;
  if (!confirm) {
    const previewMsg = [
      "Comment reply preview",
      "",
      `Target Comment ID: ${params.comment_id}`,
      `Reply Message: ${trimmedMessage}`,
      "",
      "No reply was posted.",
      "",
      "Set confirm=true to post this reply.",
    ].join("\n");

    logMcpOperation({
      level: "info",
      tool: toolName,
      operation: "replyToInstagramComment:preview",
      success: true,
      message: "Returned comment reply preview (confirm=false).",
    });

    return {
      posted: false,
      confirm_required: true,
      preview: {
        comment_id: params.comment_id,
        message: trimmedMessage,
        message_length: trimmedMessage.length,
      },
      message: previewMsg,
    };
  }

  const response = await instagramGraphRequest<{ id?: string }>({
    path: `/${encodeURIComponent(params.comment_id)}/replies`,
    method: "POST",
    formBody: {
      message: trimmedMessage,
    },
    operationName: "replyToInstagramComment:post",
    toolName,
  });

  if (!response.id) {
    throw new NexsaiMcpError({
      category: "Instagram API error",
      message: "Instagram API did not return a reply ID.",
    });
  }

  return {
    success: true,
    posted: true,
    comment_id: params.comment_id,
    reply_id: response.id,
    message: "Reply posted successfully.",
  };
}

export interface HideInstagramCommentParams {
  comment_id: string;
  hide?: boolean;
  confirm?: boolean;
}

/**
 * Hides or unhides an Instagram comment on media owned by the connected account.
 * Requires `confirm=true` before executing.
 */
export async function moderateHideInstagramComment(
  params: HideInstagramCommentParams,
  toolName = "instagram_hide_comment"
): Promise<InstagramCommentModerationResult> {
  const hide = params.hide ?? true;
  const action = hide ? "hide" : "unhide";
  const confirm = params.confirm === true;

  if (!confirm) {
    const previewMsg = [
      `Comment moderation preview (${action})`,
      "",
      `Target Comment ID: ${params.comment_id}`,
      `Action: ${action} comment (hide=${hide})`,
      "",
      "No moderation action was taken.",
      "",
      "Set confirm=true to execute this action.",
    ].join("\n");

    logMcpOperation({
      level: "info",
      tool: toolName,
      operation: `moderateHideInstagramComment:preview:${action}`,
      success: true,
      message: `Returned ${action} comment preview (confirm=false).`,
    });

    return {
      executed: false,
      confirm_required: true,
      action,
      comment_id: params.comment_id,
      message: previewMsg,
    };
  }

  await instagramGraphRequest<{ success?: boolean }>({
    path: `/${encodeURIComponent(params.comment_id)}`,
    method: "POST",
    queryParams: {
      hide,
    },
    operationName: `moderateHideInstagramComment:${action}`,
    toolName,
  });

  return {
    success: true,
    executed: true,
    action,
    comment_id: params.comment_id,
    message: `Comment ${params.comment_id} was ${
      hide ? "hidden" : "unhidden"
    } successfully.`,
  };
}

export interface DeleteInstagramCommentParams {
  comment_id: string;
  confirm?: boolean;
}

/**
 * Permanently deletes an Instagram comment on media owned by the connected account.
 * Destructive action — strictly requires `confirm=true`.
 */
export async function deleteInstagramComment(
  params: DeleteInstagramCommentParams,
  toolName = "instagram_delete_comment"
): Promise<InstagramCommentModerationResult> {
  const confirm = params.confirm === true;

  if (!confirm) {
    const previewMsg = [
      "Destructive action preview (delete comment)",
      "",
      `Target Comment ID: ${params.comment_id}`,
      "Action: Permanently delete comment",
      "",
      "No comment was deleted.",
      "",
      "Set confirm=true to permanently delete this comment.",
    ].join("\n");

    logMcpOperation({
      level: "info",
      tool: toolName,
      operation: "deleteInstagramComment:preview",
      success: true,
      message: "Returned delete comment preview (confirm=false).",
    });

    return {
      executed: false,
      confirm_required: true,
      action: "delete",
      comment_id: params.comment_id,
      message: previewMsg,
    };
  }

  await instagramGraphRequest<{ success?: boolean }>({
    path: `/${encodeURIComponent(params.comment_id)}`,
    method: "DELETE",
    operationName: "deleteInstagramComment:delete",
    toolName,
  });

  return {
    success: true,
    executed: true,
    action: "delete",
    comment_id: params.comment_id,
    message: `Comment ${params.comment_id} was permanently deleted.`,
  };
}

