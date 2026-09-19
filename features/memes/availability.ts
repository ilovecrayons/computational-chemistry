import { and, eq, or } from "drizzle-orm";
import { db } from "../../db";
import { blocks, memes } from "../../db/schema";
import type { XPost } from "../../lib/contracts";

export type MemeRow = typeof memes.$inferSelect;

const X_MEDIA_TYPES: Record<XPost["mediaType"], true> = {
  image: true,
  video: true,
  mixed: true,
  text: true,
  unknown: true,
};

/** Validate only metadata needed to render an official X embed. */
export function isValidXPost(value: unknown): value is XPost {
  if (!value || typeof value !== "object") return false;
  const post = value as Partial<XPost>;
  if (
    typeof post.id !== "string" ||
    !/^\d+$/.test(post.id) ||
    typeof post.author !== "string" ||
    !post.author.trim() ||
    typeof post.url !== "string" ||
    typeof post.mediaType !== "string" ||
    !(post.mediaType in X_MEDIA_TYPES)
  )
    return false;
  try {
    const url = new URL(post.url);
    if (url.protocol !== "https:") return false;
    if (!/^(?:www\.)?(?:x|twitter)\.com$/i.test(url.hostname)) return false;
    const status = url.pathname.match(/\/status\/(\d+)(?:\/)?$/i);
    return status?.[1] === post.id;
  } catch {
    return false;
  }
}

/** A ready local post has persisted media; an X post has complete source metadata. */
export function isReadyMeme(row: MemeRow): boolean {
  if (row.status !== "ready") return false;
  if (row.type === "x") return isValidXPost(row.xPost);
  return (row.type === "image" || row.type === "video") && !!row.assetPath;
}

/** Blocked upload authors cannot be read or acted on by the other participant. */
export function isAvailableMeme(row: MemeRow, viewerId?: string): boolean {
  if (!isReadyMeme(row)) return false;
  if (!viewerId || !row.requestedBy || row.requestedBy === viewerId) return true;
  return !db
    .select({ actorId: blocks.actorId })
    .from(blocks)
    .where(
      or(
        and(eq(blocks.actorId, viewerId), eq(blocks.targetId, row.requestedBy)),
        and(eq(blocks.actorId, row.requestedBy), eq(blocks.targetId, viewerId)),
      ),
    )
    .get();
}
