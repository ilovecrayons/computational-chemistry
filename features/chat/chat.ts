import { randomUUID } from "node:crypto";
import { and, desc, eq, isNotNull, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db";
import {
  matches,
  memes,
  messages,
  notifications,
  reactions,
} from "../../db/schema";
import { ApiFailure } from "../../lib/api";
import type { ChatMessage } from "../../lib/contracts";
import { memeDTO } from "../matching/engine";
import { isAvailableMeme } from "../memes/availability";
import { authorizedMatch, matchDTO } from "../matches/matches";

function messageMemeDTO(
  memeId: string | null,
  viewerId: string,
): ChatMessage["meme"] {
  if (!memeId) return null;
  const meme = db
    .select()
    .from(memes)
    .where(eq(memes.id, memeId))
    .get();
  if (!meme || !isAvailableMeme(meme, viewerId)) return null;
  try {
    return memeDTO(meme);
  } catch {
    return null;
  }
}
const cursorInput = z.object({
  matchId: z.string(),
  at: z.number().int().nonnegative(),
  id: z.string().max(100),
});
export function getMessages(
  userId: string,
  matchId: string,
  cursor: string | null,
) {
  const match = authorizedMatch(userId, matchId);
  let boundary;
  if (cursor) {
    try {
      if (cursor.length > 600) throw new Error("oversized");
      const decoded = cursorInput.parse(
        JSON.parse(Buffer.from(cursor, "base64url").toString()),
      );
      if (decoded.matchId !== matchId) throw new Error("wrong match");
      boundary = or(
        lt(messages.createdAt, new Date(decoded.at)),
        and(
          eq(messages.createdAt, new Date(decoded.at)),
          lt(messages.id, decoded.id),
        ),
      );
    } catch {
      throw new ApiFailure(
        400,
        "INVALID_CURSOR",
        "This message cursor is invalid.",
      );
    }
  }
  const rows = db
    .select()
    .from(messages)
    .where(and(eq(messages.matchId, matchId), boundary))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(31)
    .all();
  const page = rows.slice(0, 30);
  const oldest = page.at(-1);
  return {
    messages: page
      .reverse()
      .map((row): ChatMessage => ({
        id: row.id,
        senderId: row.senderId,
        body: row.body,
        memeId: row.memeId,
        meme: messageMemeDTO(row.memeId, userId),
        createdAt: row.createdAt.toISOString(),
      })),
    nextCursor:
      rows.length > 30 && oldest
        ? Buffer.from(
            JSON.stringify({
              matchId,
              at: oldest.createdAt.valueOf(),
              id: oldest.id,
            }),
          ).toString("base64url")
        : null,
    match: matchDTO(match, userId),
  };
}
export const messageInput = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write a message first.")
    .max(2000, "Keep messages under 2,000 characters."),
  memeId: z.string().min(1).max(100).optional(),
});
export function sendMessage(
  userId: string,
  matchId: string,
  input: unknown,
): { message: ChatMessage } {
  const value = messageInput.parse(input);
  return db.transaction((tx) => {
    const match = authorizedMatch(userId, matchId);
    const openerClaimed =
      tx
        .update(matches)
        .set({ openerConsumedAt: new Date() })
        .where(
          and(
            eq(matches.id, matchId),
            eq(matches.openerSenderId, userId),
            isNotNull(matches.openerMemeId),
            isNull(matches.openerConsumedAt),
          ),
        )
        .run().changes > 0;
    let memeId = value.memeId ?? null;
    if (openerClaimed) {
      memeId = null;
      if (match.openerMemeId) {
        const opener = tx
          .select()
          .from(memes)
          .where(eq(memes.id, match.openerMemeId))
          .get();
        if (
          opener &&
          isAvailableMeme(opener, match.userA) &&
          isAvailableMeme(opener, match.userB)
        )
          memeId = opener.id;
      }
    } else if (memeId) {
      const meme = tx
        .select()
        .from(memes)
        .where(eq(memes.id, memeId))
        .get();
      const positive = tx
        .select()
        .from(reactions)
        .where(
          and(
            eq(reactions.memeId, memeId),
            or(
              eq(reactions.userId, match.userA),
              eq(reactions.userId, match.userB),
            ),
            or(
              eq(reactions.reaction, "like"),
              eq(reactions.reaction, "strong-like"),
            ),
          ),
        )
        .all();
      if (
        !meme ||
        !isAvailableMeme(meme, match.userA) ||
        !isAvailableMeme(meme, match.userB) ||
        positive.length !== 2
      )
        throw new ApiFailure(
          403,
          "MEME_NOT_SHARED",
          "Only a ready meme that both of you liked can be shared.",
        );
    }
    const row = {
      id: randomUUID(),
      matchId,
      senderId: userId,
      body: value.body,
      memeId,
      createdAt: new Date(),
    };
    tx.insert(messages).values(row).run();
    tx.insert(notifications)
      .values({
        id: randomUUID(),
        recipientId: match.userA === userId ? match.userB : match.userA,
        actorId: userId,
        type: "message",
        message: "sent you a message",
        memeId: row.memeId,
        matchId,
        createdAt: row.createdAt,
        readAt: null,
      })
      .run();
    return {
      message: {
        id: row.id,
        senderId: row.senderId,
        body: row.body,
        memeId: row.memeId,
        meme: messageMemeDTO(row.memeId, userId),
        createdAt: row.createdAt.toISOString(),
      },
    };
  });
}
