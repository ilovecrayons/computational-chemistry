import { X_POST_SEED_COUNT, seedXPosts } from "../db/x-post-seeds";
import { sqlite } from "../db";

try {
  seedXPosts({ cleanupLegacy: false });
  console.log(`Seeded ${X_POST_SEED_COUNT} official X posts without resetting demo users or dependents.`);
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : "Official X post seed failed.");
  process.exitCode = 1;
} finally {
  sqlite.close();
}
