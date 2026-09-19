import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { db } from "../db";
import { memes } from "../db/schema";
import { config } from "../lib/config";

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { apply: { type: "boolean", default: false } },
    strict: true,
  });
  const records = db
    .select({
      assetPath: memes.assetPath,
      posterPath: memes.posterPath,
      id: memes.id,
      status: memes.status,
    })
    .from(memes)
    .all();
  const referenced = new Set(
    records.flatMap((row) =>
      [row.assetPath, row.posterPath].filter(
        (value): value is string => value !== null,
      ),
    ),
  );
  const active = records
    .filter((row) => row.status === "queued" || row.status === "generating")
    .map((row) => row.id);
  const entries = await readdir(config.mediaDir, { withFileTypes: true }).catch(
    (error) => {
      if (error.code === "ENOENT") return [];
      throw error;
    },
  );
  let count = 0;
  for (const entry of entries) {
    if (
      entry.isSymbolicLink() ||
      referenced.has(entry.name) ||
      active.some((id) => entry.name.startsWith(id))
    )
      continue;
    if (
      !entry.isFile() &&
      !(entry.isDirectory() && entry.name.startsWith(".demo-video-"))
    )
      continue;
    const target = path.join(config.mediaDir, entry.name);
    const info = await stat(target);
    // A day-long grace period protects downloads and concurrent demo provisioning.
    if (info.mtimeMs > Date.now() - 24 * 60 * 60_000) continue;
    count++;
    console.log(`${values.apply ? "Removing" : "Would remove"} ${entry.name}`);
    if (values.apply)
      await rm(target, { recursive: entry.isDirectory(), force: true });
  }
  console.log(
    `${count} unreferenced assets ${values.apply ? "removed" : "eligible"}. Referenced assets, active jobs, and assets younger than 24 hours are preserved.${values.apply ? "" : " Run again with --apply to delete."}`,
  );
}

main().catch(() => {
  console.error(
    "Media cleanup failed. Check the local database and media directory permissions.",
  );
  process.exitCode = 1;
});
