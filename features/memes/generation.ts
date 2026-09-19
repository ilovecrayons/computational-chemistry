import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import { z } from "zod";
import { db, sqlite } from "../../db";
import { memes } from "../../db/schema";
import { ApiFailure } from "../../lib/api";
import type { Generation } from "../../lib/contracts";
import { downloadProviderMedia } from "../../lib/media/storage";
import { createVideoPoster } from "../../lib/media/video-poster";
import {
  generateImage,
  IMAGE_MODEL,
  pollVideo,
  requireXaiKey,
  startVideo,
  VIDEO_MODEL,
} from "../../lib/xai/client";
import { mapVideoState, XaiFailure } from "../../lib/xai/video";
import {
  buildPrompt,
  FORMATS,
  tagsFor,
  TAXONOMY_VERSION,
  TONES,
  TOPICS,
} from "./taxonomy";

export const generationInput = z
  .object({
    tone: z.enum(TONES),
    format: z.enum(FORMATS),
    topics: z
      .array(z.enum(TOPICS))
      .min(1)
      .max(2)
      .refine(
        (value) => new Set(value).size === value.length,
        "Choose different topics.",
      ),
    chaos: z.number().int().min(1).max(5),
    idempotencyKey: z
      .string()
      .min(8)
      .max(128)
      .regex(/^[a-zA-Z0-9_-]+$/, "Use a unique alphanumeric request key."),
  })
  .strict();

type MemeRow = typeof memes.$inferSelect;
const globalJobs = globalThis as typeof globalThis & {
  memeantPolls?: Map<string, Promise<Generation>>;
  memeantLastPoll?: Map<string, number>;
};
const polling = (globalJobs.memeantPolls ??= new Map());
const lastPoll = (globalJobs.memeantLastPoll ??= new Map());

function publicGeneration(row: MemeRow): Generation {
  if (row.type === "x")
    throw new ApiFailure(
      404,
      "GENERATION_NOT_FOUND",
      "External X posts are not generation jobs.",
    );
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    failure: row.failure,
    src:
      row.status === "ready" && row.assetPath ? `/api/media/${row.id}` : null,
  };
}

function expireAbandoned(): void {
  const now = new Date();
  db.update(memes)
    .set({
      status: "failed",
      failure:
        "This request was interrupted before its result could be persisted. No automatic paid retry was started.",
      completedAt: now,
    })
    .where(
      and(
        inArray(memes.status, ["queued", "generating"]),
        inArray(memes.type, ["image", "video"]),
        isNull(memes.providerRequestId),
        lt(memes.createdAt, new Date(Date.now() - 10 * 60_000)),
      ),
    )
    .run();
  db.update(memes)
    .set({
      status: "expired",
      failure:
        "This video request exceeded the 30-minute local polling window. No automatic paid retry was started.",
      completedAt: now,
    })
    .where(
      and(
        inArray(memes.status, ["queued", "generating"]),
        inArray(memes.type, ["image", "video"]),
        eq(memes.type, "video"),
        lt(memes.createdAt, new Date(Date.now() - 30 * 60_000)),
      ),
    )
    .run();
}

export async function beginGeneration(
  type: "image" | "video",
  raw: unknown,
  requestedBy: string,
): Promise<Generation> {
  const input = generationInput.parse(raw);
  const prompt = buildPrompt({ ...input, topics: [...input.topics].sort() });
  const key = createHash("sha256")
    .update(`${requestedBy}:${input.idempotencyKey}`)
    .digest("hex");
  // A committed reservation is the sole authority to make a paid request. A restarted
  // process never resubmits an existing reservation, even if the provider outcome is unknown.
  const reservation = sqlite
    .transaction(() => {
      expireAbandoned();
      const existing = db
        .select()
        .from(memes)
        .where(eq(memes.idempotencyKey, key))
        .get();
      if (existing) {
        if (existing.type !== type || existing.prompt !== prompt)
          throw new ApiFailure(
            409,
            "IDEMPOTENCY_CONFLICT",
            "This request key was already used with different generation settings.",
          );
        return { row: existing, fresh: false };
      }
      try {
        requireXaiKey();
      } catch (error) {
        if (error instanceof XaiFailure)
          throw new ApiFailure(503, error.code, error.message);
        throw error;
      }
      const active = db
        .select({ id: memes.id })
        .from(memes)
        .where(inArray(memes.status, ["queued", "generating"]))
        .limit(2)
        .all();
      if (active.length >= 2)
        throw new ApiFailure(
          429,
          "GENERATION_BUSY",
          "Two generation requests are already active. Finish or poll them before starting another.",
        );
      const id = randomUUID();
      db.insert(memes)
        .values({
          id,
          type,
          prompt,
          caption: `An original xAI-generated ${type} meme.`,
          tags: tagsFor(input),
          chaos: input.chaos,
          taxonomyVersion: TAXONOMY_VERSION,
          status: "generating",
          model: type === "image" ? IMAGE_MODEL : VIDEO_MODEL,
          createdAt: new Date(),
          idempotencyKey: key,
          requestedBy,
        })
        .run();
      return {
        row: db.select().from(memes).where(eq(memes.id, id)).get()!,
        fresh: true,
      };
    })
    .immediate();
  if (!reservation.fresh) return publicGeneration(reservation.row);
  const id = reservation.row.id;
  try {
    if (type === "video") {
      const providerRequestId = await startVideo(prompt);
      db.update(memes).set({ providerRequestId }).where(eq(memes.id, id)).run();
    } else {
      const url = await generateImage(prompt);
      const assetPath = await downloadProviderMedia(url, id, "image");
      db.update(memes)
        .set({ status: "ready", assetPath, completedAt: new Date() })
        .where(eq(memes.id, id))
        .run();
    }
  } catch (error) {
    const failure =
      error instanceof XaiFailure
        ? error.message
        : "The generated media could not be persisted. No automatic paid retry was started.";
    db.update(memes)
      .set({ status: "failed", failure, completedAt: new Date() })
      .where(eq(memes.id, id))
      .run();
  }
  return publicGeneration(
    db.select().from(memes).where(eq(memes.id, id)).get()!,
  );
}

export async function getGeneration(id: string): Promise<Generation> {
  expireAbandoned();
  const row = db.select().from(memes).where(eq(memes.id, id)).get();
  if (!row)
    throw new ApiFailure(
      404,
      "GENERATION_NOT_FOUND",
      "This generation does not exist.",
    );
  if (row.type === "x")
    throw new ApiFailure(
      404,
      "GENERATION_NOT_FOUND",
      "External X posts are not generation jobs.",
    );
  if (
    row.status !== "generating" ||
    row.type !== "video" ||
    !row.providerRequestId
  )
    return publicGeneration(row);
  if ((lastPoll.get(id) ?? 0) > Date.now() - 5_000)
    return publicGeneration(row);
  const operation = (async () => {
    lastPoll.set(id, Date.now());
    if (lastPoll.size > 100) {
      for (const [key, time] of lastPoll)
        if (time < Date.now() - 30_000) lastPoll.delete(key);
    }
    try {
      const state = mapVideoState(await pollVideo(row.providerRequestId!));
      if (state.status === "ready") {
        const assetPath = await downloadProviderMedia(state.url, id, "video");
        const posterPath = await createVideoPoster(assetPath, id);
        db.update(memes)
          .set({
            status: "ready",
            assetPath,
            posterPath,
            completedAt: new Date(),
            failure: null,
          })
          .where(eq(memes.id, id))
          .run();
      } else if (state.status === "failed" || state.status === "expired") {
        db.update(memes)
          .set({
            status: state.status,
            failure: state.failure,
            completedAt: new Date(),
          })
          .where(eq(memes.id, id))
          .run();
      }
    } catch (error) {
      if (
        error instanceof XaiFailure &&
        (error.transient ||
          error.code === "XAI_NOT_CONFIGURED" ||
          error.code === "XAI_ACCESS_DENIED")
      ) {
        throw new ApiFailure(503, error.code, error.message);
      }
      const expired =
        error instanceof XaiFailure &&
        (error.code === "XAI_NOT_FOUND" || error.code === "MEDIA_EXPIRED");
      const failure =
        error instanceof XaiFailure
          ? error.message
          : "The video could not be saved safely. No automatic paid retry was started.";
      db.update(memes)
        .set({
          status: expired ? "expired" : "failed",
          failure,
          completedAt: new Date(),
        })
        .where(eq(memes.id, id))
        .run();
    }
    return publicGeneration(
      db.select().from(memes).where(eq(memes.id, id)).get()!,
    );
  })();
  polling.set(id, operation);
  try {
    return await operation;
  } finally {
    polling.delete(id);
  }
}

export function recentGenerations(): Generation[] {
  expireAbandoned();
  return db
    .select()
    .from(memes)
    .where(
      and(
        isNotNull(memes.idempotencyKey),
        inArray(memes.type, ["image", "video"]),
      ),
    )
    .orderBy(desc(memes.createdAt), desc(memes.id))
    .limit(30)
    .all()
    .map(publicGeneration);
}
