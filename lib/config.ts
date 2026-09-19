import path from "node:path";

const secret = process.env.BETTER_AUTH_SECRET;
if (!secret || secret.length < 32) {
  throw new Error(
    "BETTER_AUTH_SECRET must be set to a random secret of at least 32 characters. Copy .env.example to .env and configure it before starting.",
  );
}
const base = new URL(process.env.APP_BASE_URL ?? "http://localhost:3000");
if (!["http:", "https:"].includes(base.protocol))
  throw new Error("APP_BASE_URL must be an HTTP(S) URL.");
export const config = {
  databaseUrl: process.env.DATABASE_URL ?? "file:./data/memeant.db",
  baseUrl: base.origin,
  secret,
  demoMode: process.env.DEMO_MODE === "true",
  mediaDir: process.env.MEDIA_DIR || path.join(process.cwd(), "data", "media"),
};
