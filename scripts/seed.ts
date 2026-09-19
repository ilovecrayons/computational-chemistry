import { seedDemo, DEMO_PASSWORD } from "../db/seed";
import { sqlite } from "../db";

seedDemo()
  .then(() => {
    console.log(
      "Seeded 30 fictional adult personas with real names and ten free placeholder photos each.",
    );
    console.log(`Demo sign-in: alex@demo.local / ${DEMO_PASSWORD}`);
    sqlite.close();
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Demo seed failed.");
    sqlite.close();
    process.exitCode = 1;
  });
