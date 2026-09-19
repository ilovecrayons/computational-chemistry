import { seedDemo, DEMO_PASSWORD } from "../db/seed";
import { sqlite } from "../db";

seedDemo()
  .then(() => {
    console.log(
      "Seeded the 39 approved official X posts and 30 fictional adult demo personas.",
    );
    console.log(`Demo sign-in: alex@demo.local / ${DEMO_PASSWORD}`);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Demo seed failed.");
    sqlite.close();
    process.exitCode = 1;
  });
