import { parseArgs } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { beginGeneration, getGeneration } from "../features/memes/generation";
import { demoSpecs } from "../features/memes/taxonomy";
import { ApiFailure } from "../lib/api";
import { requireXaiKey } from "../lib/xai/client";
import { XaiFailure } from "../lib/xai/video";

class UsageError extends Error {}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      confirm: { type: "boolean", default: false },
      images: { type: "string", default: "60" },
      videos: { type: "string", default: "6" },
      batch: { type: "string" },
    },
    strict: true,
  });
  if (
    !values.confirm ||
    !values.batch ||
    !/^[a-zA-Z0-9_-]{1,70}$/.test(values.batch)
  ) {
    throw new UsageError(
      "Paid generation requires explicit consent and a stable batch key: npm run media:generate -- --confirm --batch pitch-2026 --images 60 --videos 6. Reuse the batch key to resume without duplicate charges. Verify current pricing and model access first.",
    );
  }
  const images = Number(values.images);
  const videos = Number(values.videos);
  if (
    !Number.isInteger(images) ||
    images < 0 ||
    images > 60 ||
    !Number.isInteger(videos) ||
    videos < 0 ||
    videos > 6 ||
    images + videos === 0
  )
    throw new UsageError(
      "Choose 0–60 images and 0–6 videos, with at least one asset.",
    );
  requireXaiKey();
  console.log(
    `Explicit paid batch ${values.batch}: ${images} images and ${videos} six-second videos. No automatic paid retries. Offline demo records are preserved.`,
  );
  const selected = [
    ...demoSpecs.filter((spec) => spec.type === "image").slice(0, images),
    ...demoSpecs.filter((spec) => spec.type === "video").slice(0, videos),
  ];
  let failures = 0;
  for (const spec of selected) {
    let generation = await beginGeneration(
      spec.type,
      {
        tone: spec.tone,
        format: spec.format,
        topics: spec.topics,
        chaos: spec.chaos,
        idempotencyKey: `${values.batch}-${spec.id}`,
      },
      "local-cli-admin",
    );
    console.log(`${spec.type} ${generation.id}: ${generation.status}`);
    // Polling does not create another generation. The finite window can be resumed
    // by re-running this explicit command with the same batch key.
    for (
      let attempt = 0;
      attempt < 180 &&
      (generation.status === "generating" || generation.status === "queued");
      attempt++
    ) {
      await delay(5_000);
      generation = await getGeneration(generation.id);
    }
    if (generation.status !== "ready") {
      failures++;
      console.error(
        `${generation.id}: ${generation.status}${generation.failure ? ` - ${generation.failure}` : " - polling window ended; resume with the same batch key."}`,
      );
      if (generation.status === "generating" || generation.status === "queued")
        break;
    } else
      console.log(`${generation.id}: ready, local asset ${generation.src}`);
  }
  if (failures) process.exitCode = 1;
}

main().catch((error) => {
  const known = error instanceof ApiFailure || error instanceof XaiFailure;
  console.error(
    known
      ? `${error.code}: ${error.message}`
      : error instanceof UsageError
        ? error.message
        : "The library command failed. Check command flags and local configuration. No automatic paid retry was started.",
  );
  process.exitCode = 1;
});
