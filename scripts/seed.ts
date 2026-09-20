import { seedDemo, DEMO_PASSWORD } from "../db/seed";
import { X_POST_SEED_COUNT } from "../db/x-post-seeds";
import { sqlite } from "../db";
seedDemo()
  .then(() => {
    console.log(
      `Seeded ${X_POST_SEED_COUNT} approved official X posts and 30 fictional adult demo personas.`,
    );
    console.log(`Demo sign-in: alex@demo.local / ${DEMO_PASSWORD}`);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Demo seed failed.");
    sqlite.close();
    process.exitCode = 1;
  });
