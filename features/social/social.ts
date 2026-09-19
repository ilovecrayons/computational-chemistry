import { randomUUID } from "node:crypto";
import { and, desc, eq, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db";
import {
  memes,
  notifications,
  postComments,
  reactions,
  savedMemes,
  users,
} from "../../db/schema";
import { ApiFailure } from "../../lib/api";
import type {
  AppNotification,
  FeedComment,
  Meme,
} from "../../lib/contracts";
import { memeDTO, type MemeRow } from "../matching/engine";
import { requireProfile } from "../profile/profile";
import { isAvailableMeme } from "../memes/availability";

function readyMeme(memeId: string, viewerId: string): MemeRow {
  const meme = db
    .select()
    .from(memes)
    .where(eq(memes.id, memeId))
    .get();
  if (!meme || !isAvailableMeme(meme, viewerId))
    throw new ApiFailure(404, "POST_NOT_FOUND", "This post is unavailable.");
  return meme;
}

export function socialMemeDTO(row: MemeRow, viewerId: string): Meme {
  const likes = db
    .select({ memeId: reactions.memeId })
    .from(reactions)
    .where(
      and(
        eq(reactions.memeId, row.id),
        or(
          eq(reactions.reaction, "like"),
          eq(reactions.reaction, "strong-like"),
        ),
      ),
    )
    .all().length;
  const commentCount = db
    .select({ id: postComments.id })
    .from(postComments)
    .where(eq(postComments.memeId, row.id))
    .all().length;
  const saved = Boolean(
    db
      .select({ memeId: savedMemes.memeId })
      .from(savedMemes)
      .where(
        and(
          eq(savedMemes.userId, viewerId),
          eq(savedMemes.memeId, row.id),
        ),
      )
      .get(),
  );
  const author = row.requestedBy
    ? db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(eq(users.id, row.requestedBy))
        .get() ?? null
    : null;
  return {
    ...memeDTO(row),
    author,
    likeCount: likes,
    commentCount,
    saved,
  };
}

export function getPost(userId: string, memeId: string): Meme {
  requireProfile(userId);
  return socialMemeDTO(readyMeme(memeId, userId), userId);
}

export function getComments(userId: string, memeId: string): FeedComment[] {
  requireProfile(userId);
  readyMeme(memeId, userId);
  return db
    .select()
    .from(postComments)
    .where(eq(postComments.memeId, memeId))
    .orderBy(desc(postComments.createdAt), desc(postComments.id))
    .limit(100)
    .all()
    .map((comment) => {
      const author = db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(eq(users.id, comment.userId))
        .get();
      return {
        id: comment.id,
        memeId: comment.memeId,
        author: author ?? { id: comment.userId, name: "Someone" },
        body: comment.body,
        createdAt: comment.createdAt.toISOString(),
      };
    })
    .reverse();
}

export const commentInput = z.object({
  body: z.string().trim().min(1).max(500),
});

export function addComment(userId: string, memeId: string, input: unknown) {
  requireProfile(userId);
  const value = commentInput.parse(input);
  const meme = readyMeme(memeId, userId);
  const row = {
    id: randomUUID(),
    memeId,
    userId,
    body: value.body,
    createdAt: new Date(),
  };
  db.transaction((tx) => {
    tx.insert(postComments).values(row).run();
    if (meme.requestedBy && meme.requestedBy !== userId) {
      tx.insert(notifications)
        .values({
          id: randomUUID(),
          recipientId: meme.requestedBy,
          actorId: userId,
          type: "comment",
          message: "commented on your post",
          memeId,
          matchId: null,
          createdAt: row.createdAt,
          readAt: null,
        })
        .run();
    }
  });
  const author = db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  return {
    id: row.id,
    memeId: row.memeId,
    author: author ?? { id: userId, name: "You" },
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  } satisfies FeedComment;
}

export function toggleSave(userId: string, memeId: string) {
  requireProfile(userId);
  readyMeme(memeId, userId);
  const existing = db
    .select()
    .from(savedMemes)
    .where(
      and(eq(savedMemes.userId, userId), eq(savedMemes.memeId, memeId)),
    )
    .get();
  if (existing) {
    db.delete(savedMemes)
      .where(
        and(eq(savedMemes.userId, userId), eq(savedMemes.memeId, memeId)),
      )
      .run();
    return { saved: false };
  }
  db.insert(savedMemes)
    .values({ userId, memeId, createdAt: new Date() })
    .run();
  return { saved: true };
}

export function getSavedMemes(userId: string): Meme[] {
  requireProfile(userId);
  return db
    .select({ meme: memes })
    .from(savedMemes)
    .innerJoin(memes, eq(savedMemes.memeId, memes.id))
    .where(eq(savedMemes.userId, userId))
    .orderBy(desc(savedMemes.createdAt))
    .limit(100)
    .all()
    .filter(({ meme }) => isAvailableMeme(meme, userId))
    .map(({ meme }) => socialMemeDTO(meme, userId));
}

export function getUserPosts(userId: string, viewerId = userId): Meme[] {
  requireProfile(userId);
  return db
    .select()
    .from(memes)
    .where(eq(memes.requestedBy, userId))
    .orderBy(desc(memes.createdAt), desc(memes.id))
    .limit(60)
    .all()
    .filter((meme) => isAvailableMeme(meme, viewerId))
    .map((meme) => socialMemeDTO(meme, viewerId));
}

export function getNotifications(userId: string): AppNotification[] {
  requireProfile(userId);
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.recipientId, userId))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(100)
    .all()
    .map((notification) => {
      const actor = notification.actorId
        ? db
            .select({ id: users.id, name: users.name })
            .from(users)
            .where(eq(users.id, notification.actorId))
            .get() ?? null
        : null;
      return {
        id: notification.id,
        type: notification.type,
        message: notification.message,
        actor,
        memeId: notification.memeId,
        matchId: notification.matchId,
        createdAt: notification.createdAt.toISOString(),
        readAt: notification.readAt?.toISOString() ?? null,
      };
    });
}

export function markNotificationsRead(userId: string) {
  requireProfile(userId);
  db.update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.recipientId, userId)))
    .run();
  return { ok: true };
}
