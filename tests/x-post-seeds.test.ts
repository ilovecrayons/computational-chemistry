import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import Database from "better-sqlite3";
import type * as DatabaseModule from "../db";
import type * as SchemaModule from "../db/schema";
import type { migrate as Migrate } from "../db/migrations";
import type { seedXPosts as SeedXPosts } from "../db/x-post-seeds";

process.env.DATABASE_URL = ":memory:";
process.env.BETTER_AUTH_SECRET =
  "x-post-seed-regression-secret-not-for-deployment";
process.env.APP_BASE_URL = "http://localhost:3000";
process.env.DEMO_MODE = "false";

let database: typeof DatabaseModule;
let schema: typeof SchemaModule;
let migrate: typeof Migrate;
let seedXPosts: typeof SeedXPosts;
let xPostSeedCount: number;

before(async () => {
  // Dynamic imports intentionally isolate the in-memory database from developer data.
  database = await import("../db");
  schema = await import("../db/schema");
  ({ migrate } = await import("../db/migrations"));
  ({ seedXPosts, X_POST_SEED_COUNT: xPostSeedCount } = await import(
    "../db/x-post-seeds"
  ));
});

after(() => database.sqlite.close());

function memeValues(id: string, type: "image" | "x" = "image") {
  return {
    id,
    type,
    prompt: "Fixture prompt",
    caption: "Fixture caption",
    tags: { political: 1 },
    chaos: 1,
    taxonomyVersion: 2,
    assetPath: type === "image" ? "fixture.svg" : null,
    posterPath: null,
    xPost: null,
    status: "ready" as const,
    model: "fixture",
    providerRequestId: null,
    failure: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    completedAt: new Date("2026-01-01T00:00:00Z"),
    idempotencyKey: null,
    requestedBy: null,
  };
}
function countRows(database: Database.Database, query: string): number {
  const row = database.prepare(query).get();
  if (
    !row ||
    typeof row !== "object" ||
    !("count" in row) ||
    typeof row.count !== "number"
  )
    throw new Error(`Expected numeric count from ${query}`);
  return row.count;
}
function stringField(
  database: Database.Database,
  query: string,
  field: string,
): string {
  const row = database.prepare(query).get();
  const value =
    row && typeof row === "object" && field in row
      ? (row as Record<string, unknown>)[field]
      : undefined;
  if (typeof value !== "string")
    throw new Error(`Expected string field ${field} from ${query}`);
  return value;
}

test("fresh sync replaces only legacy seeds and keeps local dependents plus official reactions", () => {
  const now = new Date("2026-01-01T00:00:00Z");
  database.db
    .insert(schema.users)
    .values({
      id: "seed-user",
      name: "Seed User",
      email: "seed-user@example.test",
      createdAt: now,
      updatedAt: now,
    })
    .run();
  database.db
    .insert(schema.memes)
    .values([
      memeValues("local-upload"),
      memeValues("meme-001"),
      memeValues("library-political-01"),
      memeValues("x-obsolete", "x"),
    ])
    .run();
  database.db
    .insert(schema.reactions)
    .values({
      userId: "seed-user",
      memeId: "local-upload",
      reaction: "like",
      createdAt: now,
      updatedAt: now,
    })
    .run();

  seedXPosts({ cleanupLegacy: false });
  const additiveRows = database.db.select().from(schema.memes).all();
  assert.equal(additiveRows.some((row) => row.id === "meme-001"), true);
  assert.equal(additiveRows.some((row) => row.id === "library-political-01"), true);
  assert.equal(additiveRows.some((row) => row.id === "x-obsolete"), true);
  seedXPosts({ cleanupLegacy: true });
  seedXPosts({ cleanupLegacy: true });

  const rows = database.db.select().from(schema.memes).all();
  const official = rows.filter((row) => row.type === "x");
  assert.equal(official.length, xPostSeedCount);
  assert.equal(rows.some((row) => row.id === "meme-001"), false);
  assert.equal(rows.some((row) => row.id === "library-political-01"), false);
  assert.equal(rows.some((row) => row.id === "x-obsolete"), false);
  assert.equal(
    database.db
      .select()
      .from(schema.reactions)
      .all()
      .some((reaction) => reaction.memeId === "local-upload"),
    true,
  );

  const officialPost = official[0];
  assert.ok(officialPost.xPost);
  database.db
    .insert(schema.reactions)
    .values({
      userId: "seed-user",
      memeId: officialPost.id,
      reaction: "strong-like",
      createdAt: now,
      updatedAt: now,
    })
    .run();
  assert.equal(
    database.db
      .select()
      .from(schema.reactions)
      .all()
      .some((reaction) => reaction.memeId === officialPost.id),
    true,
  );
});

test("version four upgrade preserves foreign-key meme dependents and restores foreign keys on failure", () => {
  const legacy = new Database(":memory:");
  legacy.pragma("foreign_keys = ON");
  legacy.exec(`
    CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);
    INSERT INTO schema_migrations VALUES (1, 1), (2, 2), (3, 3), (4, 4);
    CREATE TABLE users (id TEXT PRIMARY KEY NOT NULL);
    CREATE TABLE memes (
      id TEXT PRIMARY KEY NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('image','video')),
      prompt TEXT NOT NULL,
      caption TEXT NOT NULL,
      tags TEXT NOT NULL,
      chaos INTEGER NOT NULL CHECK(chaos BETWEEN 1 AND 5),
      taxonomy_version INTEGER NOT NULL,
      asset_path TEXT,
      poster_path TEXT,
      status TEXT NOT NULL CHECK(status IN ('queued','generating','ready','failed','expired')),
      model TEXT NOT NULL,
      provider_request_id TEXT,
      failure TEXT,
      created_at INTEGER NOT NULL,
      completed_at INTEGER,
      idempotency_key TEXT UNIQUE,
      requested_by TEXT
    );
    CREATE TABLE reactions (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      meme_id TEXT NOT NULL REFERENCES memes(id) ON DELETE CASCADE,
      reaction TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(user_id, meme_id)
    );
    CREATE TABLE post_comments (
      id TEXT PRIMARY KEY NOT NULL,
      meme_id TEXT NOT NULL REFERENCES memes(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE saved_memes (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      meme_id TEXT NOT NULL REFERENCES memes(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      PRIMARY KEY(user_id, meme_id)
    );
  `);
  legacy.exec(`
    INSERT INTO users VALUES ('legacy-user');
    INSERT INTO memes VALUES ('legacy-meme','image','prompt','caption','{}',1,1,'asset.svg',NULL,'ready','fixture',NULL,NULL,1,NULL,NULL,NULL);
    INSERT INTO reactions VALUES ('legacy-user','legacy-meme','like',1,1);
    INSERT INTO post_comments VALUES ('legacy-comment','legacy-meme','legacy-user','still here',1);
    INSERT INTO saved_memes VALUES ('legacy-user','legacy-meme',1);
  `);

  migrate(legacy);
  assert.equal(Number(legacy.pragma("foreign_keys", { simple: true })), 1);
  assert.equal(legacy.prepare("SELECT version FROM schema_migrations WHERE version = 5").get() !== undefined, true);
  assert.equal(
    countRows(
      legacy,
      "SELECT COUNT(*) AS count FROM memes WHERE id = 'legacy-meme'",
    ),
    1,
  );
  assert.equal(
    countRows(
      legacy,
      "SELECT COUNT(*) AS count FROM reactions WHERE meme_id = 'legacy-meme'",
    ),
    1,
  );
  assert.equal(
    countRows(
      legacy,
      "SELECT COUNT(*) AS count FROM post_comments WHERE meme_id = 'legacy-meme'",
    ),
    1,
  );
  assert.equal(
    countRows(
      legacy,
      "SELECT COUNT(*) AS count FROM saved_memes WHERE meme_id = 'legacy-meme'",
    ),
    1,
  );
  assert.deepEqual(legacy.pragma("foreign_key_check"), []);
  legacy.prepare("INSERT INTO memes (id,type,prompt,caption,tags,chaos,taxonomy_version,status,model,created_at,x_post) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(
    "x-upgraded",
    "x",
    "Official X post",
    "Original text",
    JSON.stringify({ political: 1 }),
    1,
    2,
    "ready",
    "official-x",
    1,
    JSON.stringify({ id: "42", url: "https://x.com/example/status/42", author: "Example", mediaType: "text" }),
  );
  assert.equal(
    stringField(
      legacy,
      "SELECT type FROM memes WHERE id = 'x-upgraded'",
      "type",
    ),
    "x",
  );
  legacy.close();

  const broken = new Database(":memory:");
  broken.pragma("foreign_keys = ON");
  broken.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL); INSERT INTO schema_migrations VALUES (1,1),(2,2),(3,3),(4,4);");
  assert.throws(() => migrate(broken));
  assert.equal(Number(broken.pragma("foreign_keys", { simple: true })), 1);
  broken.close();
});
