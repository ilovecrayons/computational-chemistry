import { randomUUID } from "node:crypto";
import { db } from "../../../db";
import { memes } from "../../../db/schema";
import { jsonError, requireUser } from "../../../lib/api";
import { atomicMediaWrite } from "../../../lib/media/storage";

export const runtime = "nodejs";
const MAX_MEDIA_BYTES = 50 * 1024 * 1024;
const extensions: Record<string, { extension: string; type: "image" | "video" }> = {
  "image/jpeg": { extension: "jpg", type: "image" },
  "image/png": { extension: "png", type: "image" },
  "image/webp": { extension: "webp", type: "image" },
  "video/mp4": { extension: "mp4", type: "video" },
  "video/webm": { extension: "webm", type: "video" },
  "video/quicktime": { extension: "mov", type: "video" },
};
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const form = await request.formData();
    const file = form.get("media") ?? form.get("video");
    const caption = String(form.get("caption") || "").trim();
    const media = file instanceof File ? extensions[file.type] : undefined;
    if (!(file instanceof File) || !media)
      return Response.json(
        {
          error: {
            code: "MEDIA_REQUIRED",
            message: "Choose a photo or short video to post.",
          },
        },
        { status: 400 },
      );
    if (file.size < 1 || file.size > MAX_MEDIA_BYTES)
      return Response.json(
        { error: { code: "MEDIA_TOO_LARGE", message: "Posts must be smaller than 50 MB." } },
        { status: 413 },
      );
    if (caption.length > 220)
      return Response.json(
        { error: { code: "CAPTION_TOO_LONG", message: "Keep captions under 220 characters." } },
        { status: 400 },
      );
    const id = randomUUID();
    const assetPath = `posts/${user.id}/${id}.${media.extension}`;
    await atomicMediaWrite(assetPath, new Uint8Array(await file.arrayBuffer()));
    const now = new Date();
    db.insert(memes)
      .values({
        id: `post-${id}`,
        type: media.type,
        prompt: "Private user upload",
        caption: caption || "A little shared nonsense.",
        tags: { uploaded: 1 },
        chaos: 1,
        taxonomyVersion: 1,
        assetPath,
        posterPath: null,
        status: "ready",
        model: "upload",
        providerRequestId: null,
        failure: null,
        createdAt: now,
        completedAt: now,
        idempotencyKey: null,
        requestedBy: user.id,
      })
      .run();
    return Response.json({ id: `post-${id}` }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
