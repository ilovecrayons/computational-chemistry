import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { config } from "../config";
import { atomicMediaWrite, mediaPath } from "./storage";

const execute = promisify(execFile);

export async function createVideoPoster(
  assetPath: string,
  id: string,
): Promise<string> {
  const temporary = path.join(
    config.mediaDir,
    `${id}-poster.${randomUUID()}.part.jpg`,
  );
  try {
    const source = await mediaPath(assetPath);
    await execute(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        source,
        "-frames:v",
        "1",
        "-vf",
        "scale=480:-2",
        temporary,
      ],
      { timeout: 30_000, maxBuffer: 128 * 1024 },
    );
    const relative = `${id}-poster.jpg`;
    await atomicMediaWrite(relative, await readFile(temporary));
    return relative;
  } catch {
    // ffmpeg is optional for real generation. The video stays playable, with an
    // explicitly neutral local poster instead of a fabricated generated frame.
    const relative = `${id}-poster.svg`;
    await atomicMediaWrite(
      relative,
      '<svg xmlns="http://www.w3.org/2000/svg" width="540" height="960" viewBox="0 0 540 960"><rect width="540" height="960" fill="#F6F4EF"/><text x="270" y="440" text-anchor="middle" font-family="sans-serif" font-size="30" fill="#111111">Your video is ready</text><text x="270" y="485" text-anchor="middle" font-family="sans-serif" font-size="22" fill="#67645F">Press play to see the meme.</text></svg>',
    );
    return relative;
  } finally {
    await unlink(temporary).catch(() => {});
  }
}
