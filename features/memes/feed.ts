import { randomUUID } from "node:crypto";
import { and, eq, lte } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db";
import { memes, notifications, reactions } from "../../db/schema";
import { ApiFailure } from "../../lib/api";
import type { Reaction } from "../../lib/contracts";
import { loadTastes, type MemeRow } from "../matching/engine";
import { socialMemeDTO } from "../social/social";
import { requireProfile } from "../profile/profile";
import { isAvailableMeme } from "./availability";
import { TOPICS } from "./taxonomy";
// A fixed library snapshot is ordered independently of reactions, so cursor pages do not
// shift when the user reacts. The greedy coverage pass mixes topic, format, tone and chaos.
export function coverageOrder<
  T extends {
    id: string;
    type: string;
    tags: Record<string, number>;
    chaos: number;
  },
>(library: T[]): T[] {
  const remaining = [...library].sort((a, b) => a.id.localeCompare(b.id));
  const ordered: T[] = [];
  const seen: Record<string, number> = {};
  let previousTopics: string[] = [];
  while (remaining.length) {
    const wantsVideo =
      ordered.length === 4 ||
      ordered.length === 10 ||
      (ordered.length > 10 && (ordered.length - 10) % 12 === 0);
    const preferredType = wantsVideo ? "video" : "image";
    const hasType = remaining.some((meme) => meme.type === preferredType);
    let bestIndex = 0,
      bestCost = Infinity;
    for (let index = 0; index < remaining.length; index++) {
      const meme = remaining[index];
      if (hasType && meme.type !== preferredType) continue;
      const tags = Object.keys(meme.tags);
      const cost =
        tags.reduce((sum, tag) => sum + (seen[tag] ?? 0), 0) / tags.length +
        (seen[`chaos:${meme.chaos}`] ?? 0) * 0.25 +
        previousTopics.filter((topic) => tags.includes(topic)).length * 5;
      if (cost < bestCost) {
        bestIndex = index;
        bestCost = cost;
      }
    }
    const [next] = remaining.splice(bestIndex, 1);
    ordered.push(next);
    for (const tag of Object.keys(next.tags)) seen[tag] = (seen[tag] ?? 0) + 1;
    seen[`chaos:${next.chaos}`] = (seen[`chaos:${next.chaos}`] ?? 0) + 1;
    previousTopics = TOPICS.filter((topic) => topic in next.tags);
  }
  return ordered;
}
const feedCursor = z.object({
  at: z.number().int().nonnegative(),
  last: z.string().max(100),
});
export function getFeed(userId: string, cursor: string | null) {
  requireProfile(userId);
  let snapshot = { at: Date.now(), last: "" };
  if (cursor) {
    try {
      if (cursor.length > 500) throw new Error("oversized");
      snapshot = feedCursor.parse(
        JSON.parse(Buffer.from(cursor, "base64url").toString()),
      );
      if (snapshot.at > Date.now()) throw new Error("future");
    } catch {
      throw new ApiFailure(
        400,
        "INVALID_CURSOR",
        "This feed cursor is invalid. Refresh your feed.",
      );
    }
  }
  const library = coverageOrder(
    db
      .select()
      .from(memes)
      .where(lte(memes.createdAt, new Date(snapshot.at)))
      .all(),
  );
  const lastIndex = snapshot.last
    ? library.findIndex((meme) => meme.id === snapshot.last)
    : -1;
  if (snapshot.last && lastIndex < 0)
    throw new ApiFailure(
      400,
      "INVALID_CURSOR",
      "The feed changed. Refresh to continue.",
    );
  const history = db
    .select()
    .from(reactions)
    .where(eq(reactions.userId, userId))
    .all();
  const reacted = new Set(history.map((reaction) => reaction.memeId));
  const available = library
    .slice(lastIndex + 1)
    .filter((meme) => isAvailableMeme(meme, userId) && !reacted.has(meme.id));
  const page = available.slice(0, 10);
  const last = page.at(-1);
  let displayPage: MemeRow[] = page;
  if (history.length >= 15 && page.length > 3) {
    const weights = loadTastes().tastes.get(userId)?.weights ?? {};
    const exploratoryCount = Math.ceil(page.length * 0.3);
    const relevance = (meme: MemeRow) =>
      Object.entries(meme.tags).reduce(
        (sum, [tag, weight]) => sum + weight * (weights[tag] ?? 0),
        0,
      );
    displayPage = [
      ...page.slice(0, exploratoryCount),
      ...page
        .slice(exploratoryCount)
        .sort(
          (a, b) => relevance(b) - relevance(a) || a.id.localeCompare(b.id),
        ),
    ];
  }
  return {
    memes: displayPage.map((meme) => socialMemeDTO(meme, userId)),
    nextCursor:
      available.length > page.length && last
        ? Buffer.from(
            JSON.stringify({ at: snapshot.at, last: last.id }),
          ).toString("base64url")
        : null,
    reactionCount: history.length,
  };
}
export const reactionInput = z.object({
  memeId: z.string().min(1).max(100),
  reaction: z.enum(["like", "pass", "strong-like"]),
});
export function setReaction(
  userId: string,
  memeId: string,
  reaction: Reaction,
) {
  requireProfile(userId);
  reactionInput.parse({ memeId, reaction });
  const meme = db
    .select()
    .from(memes)
    .where(eq(memes.id, memeId))
    .get();
  if (!meme || !isAvailableMeme(meme, userId))
    throw new ApiFailure(
      404,
      "MEME_NOT_FOUND",
      "This meme is no longer available.",
    );
  const now = new Date();
  db.insert(reactions)
    .values({ userId, memeId, reaction, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [reactions.userId, reactions.memeId],
      set: { reaction, updatedAt: now },
    })
    .run();
  if (
    meme.requestedBy &&
    meme.requestedBy !== userId &&
    reaction !== "pass"
  ) {
    db.insert(notifications)
      .values({
        id: randomUUID(),
        recipientId: meme.requestedBy,
        actorId: userId,
        type: "like",
        message: "liked your post",
        memeId,
        matchId: null,
        createdAt: now,
        readAt: null,
      })
      .run();
  }
  return {
    tags: Object.keys(meme.tags).slice(0, 3),
    reactionCount: db
      .select({ memeId: reactions.memeId })
      .from(reactions)
      .where(eq(reactions.userId, userId))
      .all().length,
  };
}
