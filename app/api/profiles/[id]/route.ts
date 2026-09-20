import { eq } from "drizzle-orm";
import { db } from "../../../../db";
import { profiles } from "../../../../db/schema";
import { ApiFailure, jsonError, requireUser } from "../../../../lib/api";
import { publicProfile } from "../../../../features/profile/profile";
import { blockedPair } from "../../../../features/matching/engine";
import {
  getUserLikedPosts,
  getUserPosts,
} from "../../../../features/social/social";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const viewer = await requireUser(request);
    const { id } = await context.params;
    const profile = db
      .select()
      .from(profiles)
      .where(eq(profiles.userId, id))
      .get();
    if (!profile?.complete || blockedPair(profile.userId, viewer.id))
      throw new ApiFailure(
        404,
        "PROFILE_NOT_FOUND",
        "That profile is unavailable.",
      );
    return Response.json({
      profile: publicProfile(profile),
      posts: getUserPosts(profile.userId, viewer.id),
      likedPosts: getUserLikedPosts(profile.userId, viewer.id),
    });
  } catch (error) {
    return jsonError(error);
  }
}
