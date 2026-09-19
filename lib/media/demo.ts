import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  open,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { memes } from "../../db/schema";
import { demoSpecs, TAXONOMY_VERSION } from "../../features/memes/taxonomy";
import { config } from "../config";
import { illustrateMeme } from "./illustrations";
import { atomicMediaWrite, mediaPath } from "./storage";

const execute = promisify(execFile);
let setup: Promise<void> | undefined;

export async function ensureDemoMedia(): Promise<void> {
  if (setup) return setup;
  setup = createLibrary();
  try {
    await setup;
  } finally {
    setup = undefined;
  }
}

async function createLibrary(): Promise<void> {
  await mkdir(config.mediaDir, { recursive: true });
  let ffmpegChecked = false;
  for (const spec of demoSpecs) {
    const existing = db.select().from(memes).where(eq(memes.id, spec.id)).get();
    if (existing?.status === "ready" && existing.assetPath) {
      try {
        const info = await stat(await mediaPath(existing.assetPath));
        if (info.isFile() && info.size > 0) {
          if (existing.posterPath)
            await stat(await mediaPath(existing.posterPath));
          continue;
        }
      } catch {
        /* Restore only missing offline demo assets; never remove paid media. */
      }
    }
    const assetPath = `${spec.id}.${spec.type === "image" ? "svg" : "mp4"}`;
    const posterPath = spec.type === "video" ? `${spec.id}-poster.svg` : null;
    const art = illustrateMeme(spec);
    if (spec.type === "image") {
      await atomicMediaWrite(assetPath, art);
    } else {
      if (!ffmpegChecked) {
        try {
          await execute("ffmpeg", ["-version"], {
            timeout: 10_000,
            maxBuffer: 128 * 1024,
          });
        } catch {
          throw new Error(
            "FFMPEG_UNAVAILABLE: Install ffmpeg (including librsvg and libx264 support), then run npm run media:demo again. The six demo videos are real silent animations; static substitutes are not used.",
          );
        }
        ffmpegChecked = true;
      }
      const directory = await mkdtemp(
        path.join(config.mediaDir, ".demo-video-"),
      );
      try {
        // Forty-eight distinct illustrated frames form a seamless six-second loop.
        for (let frame = 0; frame < 48; frame++) {
          await writeFile(
            path.join(directory, `${String(frame).padStart(3, "0")}.svg`),
            illustrateMeme(spec, frame / 48),
          );
        }
        const output = path.join(directory, "video.mp4");
        try {
          await execute(
            "ffmpeg",
            [
              "-hide_banner",
              "-loglevel",
              "error",
              "-y",
              "-framerate",
              "8",
              "-i",
              path.join(directory, "%03d.svg"),
              "-t",
              "6",
              "-r",
              "24",
              "-an",
              "-c:v",
              "libx264",
              "-preset",
              "fast",
              "-crf",
              "25",
              "-pix_fmt",
              "yuv420p",
              "-movflags",
              "+faststart",
              output,
            ],
            { timeout: 120_000, maxBuffer: 128 * 1024 },
          );
        } catch {
          throw new Error(
            "DEMO_VIDEO_FAILED: ffmpeg could not render the original SVG animation. Install an ffmpeg build with librsvg and libx264 support, then run npm run media:demo again.",
          );
        }
        const file = await open(output, "r");
        try {
          await file.sync();
        } finally {
          await file.close();
        }
        await rename(output, path.join(config.mediaDir, assetPath));
        const root = await open(config.mediaDir, "r");
        try {
          await root.sync();
        } finally {
          await root.close();
        }
        await atomicMediaWrite(posterPath!, art);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }
    const values = {
      type: spec.type,
      prompt: spec.prompt,
      caption: spec.caption,
      tags: spec.tags,
      chaos: spec.chaos,
      taxonomyVersion: TAXONOMY_VERSION,
      assetPath,
      posterPath,
      status: "ready" as const,
      model: "offline-illustration-v1",
      providerRequestId: null,
      failure: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      completedAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    db.insert(memes)
      .values({ id: spec.id, ...values })
      .onConflictDoUpdate({ target: memes.id, set: values })
      .run();
  }
}
