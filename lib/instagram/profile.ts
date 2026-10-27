import { instagramGraphRequest } from "./client";
import type { InstagramProfile } from "./types";
import { NexsaiMcpError } from "../utils/errors";

const PROFILE_FIELDS = [
  "id",
  "user_id",
  "username",
  "name",
  "account_type",
  "profile_picture_url",
  "biography",
  "website",
  "followers_count",
  "follows_count",
  "media_count",
].join(",");

/**
 * Retrieves the connected Instagram account profile from `graph.instagram.com/v24.0/me`.
 * Falls back gracefully to basic fields (`id,username,account_type`) only if an extended
 * metadata field is unsupported by the account type.
 */
export async function getInstagramProfile(
  toolName = "instagram_profile"
): Promise<InstagramProfile> {
  try {
    return await instagramGraphRequest<InstagramProfile>({
      path: "/me",
      method: "GET",
      queryParams: {
        fields: PROFILE_FIELDS,
      },
      operationName: "getInstagramProfile",
      toolName,
    });
  } catch (error) {
    if (
      error instanceof NexsaiMcpError &&
      (error.category === "Authentication error" ||
        error.category === "Rate limit error")
    ) {
      throw error;
    }
    // Fallback to minimal fields if any extended field is unsupported for a specific account state
    return await instagramGraphRequest<InstagramProfile>({
      path: "/me",
      method: "GET",
      queryParams: {
        fields: "id,username,account_type",
      },
      operationName: "getInstagramProfile:fallback",
      toolName,
    });
  }
}

