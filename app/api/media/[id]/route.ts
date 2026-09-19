import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { eq } from "drizzle-orm";
import { db } from "../../../../db";
import { memes } from "../../../../db/schema";
import { ApiFailure, jsonError, requireUser } from "../../../../lib/api";
import { mediaPath } from "../../../../lib/media/storage";

export const runtime = "nodejs";
const mimeTypes: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
};

type RouteContext = { params: Promise<{ id: string }> };

async function serve(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    await requireUser(request);
    const { id } = await context.params;
    const meme = db.select().from(memes).where(eq(memes.id, id)).get();
    const poster = new URL(request.url).searchParams.get("poster") === "1";
    const asset = poster ? meme?.posterPath : meme?.assetPath;
    if (!meme || meme.status !== "ready" || !asset)
      throw new ApiFailure(
        404,
        "MEDIA_NOT_FOUND",
        "This media is unavailable.",
      );
    let filename: string;
    let info;
    try {
      filename = await mediaPath(asset);
      info = await stat(filename);
    } catch {
      throw new ApiFailure(
        404,
        "MEDIA_NOT_FOUND",
        "This media is unavailable.",
      );
    }
    const mime = mimeTypes[path.extname(filename).toLowerCase()];
    if (!info.isFile() || !mime)
      throw new ApiFailure(
        404,
        "MEDIA_NOT_FOUND",
        "This media is unavailable.",
      );
    const etag = `"${meme.id}-${poster ? "poster" : "asset"}-${info.size}-${Math.trunc(info.mtimeMs)}"`;
    const headers = new Headers({
      "Content-Type": mime,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, no-store",
      ETag: etag,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "Cross-Origin-Resource-Policy": "same-origin",
    });
    let start = 0;
    let end = info.size - 1;
    let partial = false;
    const range = request.headers.get("range");
    const ifRange = request.headers.get("if-range");
    if (range && (!ifRange || ifRange === etag)) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      let invalid = !match || (!match[1] && !match[2]);
      if (match && !invalid) {
        if (!match[1]) {
          const suffix = Number(match[2]);
          invalid = !Number.isSafeInteger(suffix) || suffix <= 0;
          start = Math.max(0, info.size - suffix);
        } else {
          start = Number(match[1]);
          const requestedEnd = match[2] ? Number(match[2]) : info.size - 1;
          invalid =
            !Number.isSafeInteger(start) ||
            !Number.isSafeInteger(requestedEnd) ||
            requestedEnd < start;
          end = Math.min(requestedEnd, info.size - 1);
        }
        invalid ||= start >= info.size || end < start;
      }
      if (invalid) {
        headers.set("Content-Range", `bytes */${info.size}`);
        return new Response(null, { status: 416, headers });
      }
      partial = true;
      headers.set("Content-Range", `bytes ${start}-${end}/${info.size}`);
    }
    headers.set("Content-Length", String(Math.max(0, end - start + 1)));
    if (request.method === "HEAD" || info.size === 0)
      return new Response(null, { status: partial ? 206 : 200, headers });
    const stream = createReadStream(filename, { start, end });
    const cancel = () => stream.destroy();
    request.signal.addEventListener("abort", cancel, { once: true });
    stream.once("close", () =>
      request.signal.removeEventListener("abort", cancel),
    );
    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
      status: partial ? 206 : 200,
      headers,
    });
  } catch (error) {
    return jsonError(error);
  }
}

export const GET = serve;
export const HEAD = serve;
