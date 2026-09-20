import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db";
import {
  blocks,
  matches,
  messages,
  notifications,
  profileDecisions,
  profiles,
  reports,
  users,
} from "../../db/schema";
import { ApiFailure } from "../../lib/api";
import type { Match } from "../../lib/contracts";
import {
  blockedPair,
  compatibility,
  loadTastes,
  mutuallyEligible,
} from "../matching/engine";
import { publicProfile, requireProfile } from "../profile/profile";

export type MatchRow = typeof matches.$inferSelect;
export function matchDTO(row: MatchRow, userId: string): Match {
  const otherId = row.userA === userId ? row.userB : row.userA;
  const other = db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, otherId))
    .get();
  if (!other)
    throw new ApiFailure(
      404,
      "MATCH_NOT_FOUND",
      "This match is no longer available.",
    );
  const last = db
    .select()
    .from(messages)
    .where(eq(messages.matchId, row.id))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(1)
    .get();
  return {
    id: row.id,
    profile: publicProfile(other),
    compatibility: row.compatibility,
    createdAt: row.createdAt.toISOString(),
    lastActivityAt: (last?.createdAt ?? row.createdAt).toISOString(),
    lastMessage: last?.body ?? null,
  };
}
export function authorizedMatch(userId: string, matchId: string): MatchRow {
  requireProfile(userId);
  const match = db
    .select()
    .from(matches)
    .where(
      and(
        eq(matches.id, matchId),
        isNull(matches.unmatchedAt),
        or(eq(matches.userA, userId), eq(matches.userB, userId)),
      ),
    )
    .get();
  if (!match || blockedPair(match.userA, match.userB))
    throw new ApiFailure(
      404,
      "MATCH_NOT_FOUND",
      "This active match is not available to you.",
    );
  return match;
}
export function getMatches(userId: string): Match[] {
  requireProfile(userId);
  return db
    .select()
    .from(matches)
    .where(
      and(
        isNull(matches.unmatchedAt),
        or(eq(matches.userA, userId), eq(matches.userB, userId)),
      ),
    )
    .orderBy(desc(matches.createdAt), desc(matches.id))
    .all()
    .filter((match) => !blockedPair(match.userA, match.userB))
    .map((match) => matchDTO(match, userId));
}
export const decisionInput = z.object({
  targetId: z.string().min(1).max(100),
  decision: z.enum(["like", "pass"]),
});
export function decideProfile(
  userId: string,
  targetId: string,
  decision: "like" | "pass",
): { match: Match | null } {
  decisionInput.parse({ targetId, decision });
  return db.transaction((tx) => {
    const me = requireProfile(userId);
    if (targetId === userId || blockedPair(userId, targetId))
      throw new ApiFailure(
        404,
        "PROFILE_NOT_FOUND",
        "This profile is not available.",
      );
    const [userA, userB] = [userId, targetId].sort();
    const existing = tx
      .select()
      .from(matches)
      .where(and(eq(matches.userA, userA), eq(matches.userB, userB)))
      .get();
    if (existing) {
      if (existing.unmatchedAt)
        throw new ApiFailure(409, "MATCH_ENDED", "This match has ended.");
      return { match: matchDTO(existing, userId) };
    }
    const other = tx
      .select()
      .from(profiles)
      .where(eq(profiles.userId, targetId))
      .get();
    if (!other || !other.complete)
      throw new ApiFailure(
        404,
        "PROFILE_NOT_FOUND",
        "This profile is not available.",
      );
    const eligible = mutuallyEligible(me, other);
    const now = new Date();
    tx.insert(profileDecisions)
      .values({ actorId: userId, targetId, decision, createdAt: now })
      .onConflictDoUpdate({
        target: [profileDecisions.actorId, profileDecisions.targetId],
        set: { decision, createdAt: now },
      })
      .run();
    if (decision === "pass" || !eligible) return { match: null };
    const { tastes, library } = loadTastes();
    const row = {
      id: randomUUID(),
      userA,
      userB,
      compatibility: compatibility(
        tastes.get(userId),
        tastes.get(targetId),
        library,
      ),
      createdAt: now,
      unmatchedAt: null,
    };
    tx.insert(matches)
      .values(row)
      .onConflictDoNothing({ target: [matches.userA, matches.userB] })
      .run();
    const persisted = tx
      .select()
      .from(matches)
      .where(and(eq(matches.userA, userA), eq(matches.userB, userB)))
      .get()!;
    tx.insert(notifications)
      .values({
        id: randomUUID(),
        recipientId: userId,
        actorId: targetId,
        type: "match",
        message: "You matched. Say something.",
        memeId: null,
        matchId: persisted.id,
        createdAt: now,
        readAt: null,
      })
      .run();
    tx.insert(notifications)
      .values({
        id: randomUUID(),
        recipientId: targetId,
        actorId: userId,
        type: "match",
        message: "You matched. Say something.",
        memeId: null,
        matchId: persisted.id,
        createdAt: now,
        readAt: null,
      })
      .run();
    return { match: matchDTO(persisted, userId) };
  });
}
export const safetyInput = z
  .object({
    targetId: z.string().min(1).max(100),
    action: z.enum(["block", "report", "unmatch"]),
    reason: z.string().trim().max(1000).optional(),
  })
  .refine((value) => value.action !== "report" || !!value.reason, {
    path: ["reason"],
    message: "Tell us briefly what happened.",
  });
export function safetyAction(userId: string, input: unknown) {
  requireProfile(userId);
  const { targetId, action, reason } = safetyInput.parse(input);
  if (
    targetId === userId ||
    !db.select({ id: users.id }).from(users).where(eq(users.id, targetId)).get()
  )
    throw new ApiFailure(
      404,
      "PROFILE_NOT_FOUND",
      "This profile is not available.",
    );
  db.transaction((tx) => {
    const now = new Date();
    const pair = or(
      and(eq(matches.userA, userId), eq(matches.userB, targetId)),
      and(eq(matches.userA, targetId), eq(matches.userB, userId)),
    );
    if (action === "report") {
      tx.insert(reports)
        .values({
          id: randomUUID(),
          actorId: userId,
          targetId,
          reason: reason!,
          createdAt: now,
        })
        .run();
      return;
    }
    if (action === "block")
      tx.insert(blocks)
        .values({ actorId: userId, targetId, createdAt: now })
        .onConflictDoNothing()
        .run();
    if (
      action === "unmatch" &&
      !tx.select({ id: matches.id }).from(matches).where(pair).get()
    )
      throw new ApiFailure(
        404,
        "MATCH_NOT_FOUND",
        "No match exists with this person.",
      );
    tx.update(matches)
      .set({ unmatchedAt: now })
      .where(and(pair, isNull(matches.unmatchedAt)))
      .run();
    tx.delete(profileDecisions)
      .where(
        or(
          and(
            eq(profileDecisions.actorId, userId),
            eq(profileDecisions.targetId, targetId),
          ),
          and(
            eq(profileDecisions.actorId, targetId),
            eq(profileDecisions.targetId, userId),
          ),
        ),
      )
      .run();
  });
  return { ok: true };
}
