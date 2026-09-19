import { seedDemo, DEMO_PASSWORD } from "../db/seed";
import { sqlite } from "../db";

seedDemo()
  .then(() => {
    console.log(
      "Seeded 10 fictional adult personas. Alex is fresh; Jules has the reciprocal like.",
    );
    console.log(`Demo sign-in: alex@demo.local / ${DEMO_PASSWORD}`);
    sqlite.close();
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Demo seed failed.");
    sqlite.close();
    process.exitCode = 1;
  });
