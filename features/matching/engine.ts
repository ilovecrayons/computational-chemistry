import { eq } from "drizzle-orm";
import { db } from "../../db";
import {
  blocks,
  matches,
  memes,
  profileDecisions,
  profiles,
  reactions,
} from "../../db/schema";
import type {
  Candidate,
  Compatibility,
  Meme,
  Tasteprint,
} from "../../lib/contracts";
import { ageOn } from "../profile/age";
import {
  publicProfile,
  requireProfile,
  type ProfileRow,
} from "../profile/profile";
import { locationDistanceMiles, locationWithinRadius } from "./location";
const MIN_SURFACED_MATCH_SCORE = 81;

export type MemeRow = typeof memes.$inferSelect;
export function memeDTO(row: MemeRow): Meme {
  return {
    id: row.id,
    type: row.type,
    src: `/api/media/${encodeURIComponent(row.id)}`,
    poster:
      row.type === "video" && row.posterPath
        ? `/api/media/${encodeURIComponent(row.id)}?poster=1`
        : null,
    caption: row.caption,
  };
}
export interface Taste {
  reactionCount: number;
  positiveCount: number;
  weights: Record<string, number>;
  liked: Set<string>;
}
export function loadTastes(): {
  tastes: Map<string, Taste>;
  library: Map<string, MemeRow>;
} {
  const library = new Map(
    db
      .select()
      .from(memes)
      .all()
      .map((meme) => [meme.id, meme]),
  );
  const tastes = new Map<string, Taste>();
  for (const reaction of db.select().from(reactions).all()) {
    let taste = tastes.get(reaction.userId);
    if (!taste) {
      taste = {
        reactionCount: 0,
        positiveCount: 0,
        weights: {},
        liked: new Set(),
      };
      tastes.set(reaction.userId, taste);
    }
    taste.reactionCount++;
    if (reaction.reaction === "pass") continue;
    const meme = library.get(reaction.memeId);
    if (!meme) continue;
    taste.positiveCount++;
    taste.liked.add(meme.id);
    const multiplier = reaction.reaction === "strong-like" ? 2 : 1;
    for (const [tag, weight] of Object.entries(meme.tags))
      taste.weights[tag] = (taste.weights[tag] ?? 0) + multiplier * weight;
  }
  const calibrated = [...tastes.values()].filter(
    (taste) => taste.positiveCount >= 10,
  );
  const frequency: Record<string, number> = {};
  for (const taste of calibrated)
    for (const tag of Object.keys(taste.weights))
      frequency[tag] = (frequency[tag] ?? 0) + 1;
  for (const taste of tastes.values()) {
    let magnitude = 0;
    for (const tag of Object.keys(taste.weights)) {
      const idf = Math.log(
        (calibrated.length + 1) / ((frequency[tag] ?? 0) + 1),
      );
      taste.weights[tag] *= idf;
      magnitude += taste.weights[tag] ** 2;
    }
    magnitude = Math.sqrt(magnitude);
    for (const tag of Object.keys(taste.weights)) {
      if (magnitude > 0 && taste.weights[tag] > 0)
        taste.weights[tag] /= magnitude;
      else delete taste.weights[tag];
    }
  }
  return { tastes, library };
}
function topTags(taste: Taste | undefined, limit = 5) {
  return Object.entries(taste?.weights ?? {})
    .sort(([a, aw], [b, bw]) => bw - aw || a.localeCompare(b))
    .slice(0, limit);
}
export function compatibility(
  a: Taste | undefined,
  b: Taste | undefined,
  library: Map<string, MemeRow>,
): Compatibility {
  const calibrated =
    !!a && !!b && a.positiveCount >= 10 && b.positiveCount >= 10;
  const contributions = Object.entries(a?.weights ?? {})
    .map(([tag, weight]) => ({
      tag,
      contribution: weight * (b?.weights[tag] ?? 0),
    }))
    .filter((entry) => entry.contribution > 0)
    .sort(
      (x, y) => y.contribution - x.contribution || x.tag.localeCompare(y.tag),
    );
  const cosine = Math.min(
    1,
    contributions.reduce((sum, entry) => sum + entry.contribution, 0),
  );
  const first = new Set(topTags(a).map(([tag]) => tag));
  const second = new Set(topTags(b).map(([tag]) => tag));
  const union = new Set([...first, ...second]);
  const jaccard = union.size
    ? [...first].filter((tag) => second.has(tag)).length / union.size
    : 0;
  const similarity = 0.8 * cosine + 0.2 * jaccard;
  const sharedTags = contributions.slice(0, 3).map((entry) => entry.tag);
  const sharedMemes = [...(a?.liked ?? [])]
    .filter((id) => b?.liked.has(id))
    .sort()
    .map((id) => library.get(id))
    .filter((meme): meme is MemeRow => !!meme && meme.status === "ready")
    .slice(0, 2)
    .map(memeDTO);
  const rawScore = calibrated
    ? Math.round(100 * similarity)
    : Math.round(45 + 40 * similarity);
  const score = Math.max(MIN_SURFACED_MATCH_SCORE, rawScore);
  return {
    score,
    cosine,
    jaccard,
    sharedTags,
    sharedMemes,
    explanation: calibrated
      ? sharedTags.length
        ? `A made-up ${score}% score from shared ${sharedTags.join(", ")} humor signals.`
        : "A made-up score from the overlap in your current humor signals."
      : `A made-up starting score of ${score}% until both tasteprints have more signal.`,
  };
}
export function getTasteprint(userId: string): Tasteprint {
  requireProfile(userId);
  const { tastes } = loadTastes();
  const taste = tastes.get(userId);
  const tags = topTags(taste, 12).map(([tag, weight]) => ({ tag, weight }));
  const positiveCount = taste?.positiveCount ?? 0;
  return {
    reactionCount: taste?.reactionCount ?? 0,
    positiveCount,
    calibrated: positiveCount >= 10,
    tags,
    summary:
      positiveCount < 10
        ? `${10 - positiveCount} more positive reaction${10 - positiveCount === 1 ? "" : "s"} to unlock meme compatibility. Your choices, not your starter tags, build this tasteprint.`
        : tags.length
          ? `Your humor leans ${tags
              .slice(0, 3)
              .map(({ tag }) => tag)
              .join(", ")}. Built from what made you laugh.`
          : "You like what everyone likes so far. Keep reacting to find your distinctive humor.",
  };
}
function matchLocationFor(row: ProfileRow): string {
  return row.matchLocation || row.town || row.location || "";
}

function withinProfileRadius(
  left: ProfileRow,
  right: ProfileRow,
  radiusMiles: number,
): boolean {
  const distance = locationDistanceMiles(left, right);
  return distance === null
    ? locationWithinRadius(
        matchLocationFor(left),
        matchLocationFor(right),
        radiusMiles,
      )
    : distance <= radiusMiles;
}

export function mutuallyEligible(a: ProfileRow, b: ProfileRow): boolean {
  if (a.userId === b.userId || !a.complete || !b.complete) return false;
  const aAge = ageOn(a.dob),
    bAge = ageOn(b.dob);
  const aLoc = matchLocationFor(a);
  const bLoc = matchLocationFor(b);
  const aRadius = a.preferences.radiusMiles ?? 25;
  const bRadius = b.preferences.radiusMiles ?? 25;
  return (
    aAge >= 18 &&
    bAge >= 18 &&
    a.preferences.genders.includes(b.gender) &&
    b.preferences.genders.includes(a.gender) &&
    bAge >= a.preferences.minAge &&
    bAge <= a.preferences.maxAge &&
    aAge >= b.preferences.minAge &&
    aAge <= b.preferences.maxAge &&
    withinProfileRadius(a, b, aRadius) &&
    withinProfileRadius(b, a, bRadius)
  );
}
export function blockedPair(a: string, b: string): boolean {
  return db
    .select()
    .from(blocks)
    .all()
    .some(
      (block) =>
        (block.actorId === a && block.targetId === b) ||
        (block.actorId === b && block.targetId === a),
    );
}
function excludedCandidateIds(userId: string): Set<string> {
  const excluded = new Set<string>([userId]);
  for (const decision of db
    .select()
    .from(profileDecisions)
    .where(eq(profileDecisions.actorId, userId))
    .all())
    if (decision.decision === "pass") excluded.add(decision.targetId);
  for (const match of db.select().from(matches).all())
    if (match.userA === userId || match.userB === userId)
      excluded.add(match.userA === userId ? match.userB : match.userA);
  for (const block of db.select().from(blocks).all()) {
    if (block.actorId === userId) excluded.add(block.targetId);
    if (block.targetId === userId) excluded.add(block.actorId);
  }
  return excluded;
}

function rankCandidates(
  rows: ProfileRow[],
  browseOnly: boolean,
  origin: ProfileRow,
): Candidate[] {
  const { tastes, library } = loadTastes();
  return rows
    .map((profile) => ({
      ...publicProfile(profile),
      distanceMiles: locationDistanceMiles(origin, profile),
      compatibility: compatibility(
        tastes.get(origin.userId),
        tastes.get(profile.userId),
        library,
      ),
      ...(browseOnly ? { browseOnly: true } : {}),
    }))
    .sort((a, b) => {
      const distanceA = a.distanceMiles ?? Number.POSITIVE_INFINITY;
      const distanceB = b.distanceMiles ?? Number.POSITIVE_INFINITY;
      return (
        distanceA - distanceB ||
        b.compatibility.score - a.compatibility.score ||
        a.id.localeCompare(b.id)
      );
    })
    .slice(0, 50);
}

export function getCandidates(userId: string): Candidate[] {
  const me = requireProfile(userId);
  const excluded = excludedCandidateIds(userId);
  const eligible = db
    .select()
    .from(profiles)
    .all()
    .filter(
      (profile) =>
        !excluded.has(profile.userId) && mutuallyEligible(me, profile),
    );
  return rankCandidates(eligible, false, me).filter(
    (candidate) =>
      candidate.compatibility.score >= (me.preferences.minMatchPercent ?? 0),
  );
}

export function getBrowseCandidates(userId: string): Candidate[] {
  const me = requireProfile(userId);
  const excluded = excludedCandidateIds(userId);
  const browseable = db
    .select()
    .from(profiles)
    .all()
    .filter((profile) => !excluded.has(profile.userId) && profile.complete);
  return rankCandidates(browseable, true, me).filter(
    (candidate) =>
      candidate.compatibility.score >= (me.preferences.minMatchPercent ?? 0),
  );
}
