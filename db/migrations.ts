import type Database from "better-sqlite3";

const initial = `
CREATE TABLE users (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, email_verified INTEGER NOT NULL DEFAULT 0, image TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE sessions (id TEXT PRIMARY KEY NOT NULL, expires_at INTEGER NOT NULL, token TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, ip_address TEXT, user_agent TEXT, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE TABLE accounts (id TEXT PRIMARY KEY NOT NULL, account_id TEXT NOT NULL, provider_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, access_token TEXT, refresh_token TEXT, id_token TEXT, access_token_expires_at INTEGER, refresh_token_expires_at INTEGER, scope TEXT, password TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX accounts_user_idx ON accounts(user_id);
CREATE UNIQUE INDEX accounts_provider_identity ON accounts(provider_id,account_id);
CREATE TABLE verifications (id TEXT PRIMARY KEY NOT NULL, identifier TEXT NOT NULL, value TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX verification_identifier_idx ON verifications(identifier);
CREATE TABLE profiles (user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, dob TEXT NOT NULL, bio TEXT NOT NULL, location TEXT NOT NULL, gender TEXT NOT NULL CHECK(gender IN ('woman','man','nonbinary')), photo TEXT NOT NULL, intent TEXT NOT NULL CHECK(intent IN ('relationship','casual','figuring-it-out')), preferences TEXT NOT NULL, initial_tags TEXT NOT NULL, complete INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL);
CREATE TABLE memes (id TEXT PRIMARY KEY NOT NULL, type TEXT NOT NULL CHECK(type IN ('image','video')), prompt TEXT NOT NULL, caption TEXT NOT NULL, tags TEXT NOT NULL, chaos INTEGER NOT NULL CHECK(chaos BETWEEN 1 AND 5), taxonomy_version INTEGER NOT NULL, asset_path TEXT, poster_path TEXT, status TEXT NOT NULL CHECK(status IN ('queued','generating','ready','failed','expired')), model TEXT NOT NULL, provider_request_id TEXT, failure TEXT, created_at INTEGER NOT NULL, completed_at INTEGER, idempotency_key TEXT UNIQUE, requested_by TEXT);
CREATE INDEX memes_status_created_idx ON memes(status,created_at,id);
CREATE TABLE reactions (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, meme_id TEXT NOT NULL REFERENCES memes(id) ON DELETE CASCADE, reaction TEXT NOT NULL CHECK(reaction IN ('like','pass','strong-like')), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(user_id,meme_id));
CREATE INDEX reactions_meme_idx ON reactions(meme_id);
CREATE TABLE profile_decisions (actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, target_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, decision TEXT NOT NULL CHECK(decision IN ('like','pass')), created_at INTEGER NOT NULL, PRIMARY KEY(actor_id,target_id), CHECK(actor_id <> target_id));
CREATE TABLE matches (id TEXT PRIMARY KEY NOT NULL, user_a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, user_b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, compatibility TEXT NOT NULL, created_at INTEGER NOT NULL, unmatched_at INTEGER, CHECK(user_a < user_b));
CREATE UNIQUE INDEX matches_pair_unique ON matches(user_a,user_b);
CREATE TABLE messages (id TEXT PRIMARY KEY NOT NULL, match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE, sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, body TEXT NOT NULL, meme_id TEXT REFERENCES memes(id) ON DELETE SET NULL, created_at INTEGER NOT NULL);
CREATE INDEX messages_match_cursor_idx ON messages(match_id,created_at,id);
CREATE TABLE blocks (actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, target_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at INTEGER NOT NULL, PRIMARY KEY(actor_id,target_id), CHECK(actor_id <> target_id));
CREATE TABLE reports (id TEXT PRIMARY KEY NOT NULL, actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, target_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, reason TEXT NOT NULL, created_at INTEGER NOT NULL);
`;

const profileV2 = `
ALTER TABLE profiles ADD COLUMN town TEXT NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN match_location TEXT NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN photos TEXT NOT NULL DEFAULT '[]';
ALTER TABLE profiles ADD COLUMN favorite_memes TEXT NOT NULL DEFAULT '[]';
ALTER TABLE profiles ADD COLUMN interests TEXT NOT NULL DEFAULT '[]';
UPDATE profiles SET town = location, match_location = location WHERE town = '' AND location <> '';
UPDATE profiles SET photos = json_array(photo) WHERE photos = '[]' AND photo <> '';
`;
const socialV3 = `
CREATE TABLE post_comments (id TEXT PRIMARY KEY NOT NULL, meme_id TEXT NOT NULL REFERENCES memes(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, body TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX post_comments_meme_idx ON post_comments(meme_id);
CREATE TABLE saved_memes (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, meme_id TEXT NOT NULL REFERENCES memes(id) ON DELETE CASCADE, created_at INTEGER NOT NULL, PRIMARY KEY(user_id,meme_id));
CREATE TABLE notifications (id TEXT PRIMARY KEY NOT NULL, recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, actor_id TEXT REFERENCES users(id) ON DELETE SET NULL, type TEXT NOT NULL CHECK(type IN ('match','message','like','comment')), message TEXT NOT NULL, meme_id TEXT REFERENCES memes(id) ON DELETE CASCADE, match_id TEXT REFERENCES matches(id) ON DELETE CASCADE, created_at INTEGER NOT NULL, read_at INTEGER);
CREATE INDEX notifications_recipient_idx ON notifications(recipient_id,created_at);
`;
const profileV4 = `
ALTER TABLE profiles ADD COLUMN state TEXT NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN country TEXT NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN state_code TEXT NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN country_code TEXT NOT NULL DEFAULT 'US';
UPDATE profiles SET state = CASE WHEN instr(location, ',') > 0 THEN trim(substr(location, instr(location, ',') + 1)) ELSE '' END WHERE state = '';
UPDATE profiles SET country = 'United States' WHERE country = '';
`;
const memesV5 = `
CREATE TABLE memes_v5 (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('image','video','x')),
  prompt TEXT NOT NULL,
  caption TEXT NOT NULL,
  tags TEXT NOT NULL,
  chaos INTEGER NOT NULL CHECK(chaos BETWEEN 1 AND 5),
  taxonomy_version INTEGER NOT NULL,
  asset_path TEXT,
  poster_path TEXT,
  x_post TEXT,
  status TEXT NOT NULL CHECK(status IN ('queued','generating','ready','failed','expired')),
  model TEXT NOT NULL,
  provider_request_id TEXT,
  failure TEXT,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  idempotency_key TEXT UNIQUE,
  requested_by TEXT
);
INSERT INTO memes_v5 (
  id,type,prompt,caption,tags,chaos,taxonomy_version,asset_path,poster_path,x_post,
  status,model,provider_request_id,failure,created_at,completed_at,idempotency_key,requested_by
)
SELECT
  id,type,prompt,caption,tags,chaos,taxonomy_version,asset_path,poster_path,NULL,
  status,model,provider_request_id,failure,created_at,completed_at,idempotency_key,requested_by
FROM memes;
DROP TABLE memes;
ALTER TABLE memes_v5 RENAME TO memes;
CREATE INDEX memes_status_created_idx ON memes(status,created_at,id);
`;
const openerV6 = `
ALTER TABLE matches ADD COLUMN opener_meme_id TEXT REFERENCES memes(id) ON DELETE SET NULL;
ALTER TABLE matches ADD COLUMN opener_sender_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE matches ADD COLUMN opener_consumed_at INTEGER;
`;

function isApplied(database: Database.Database, version: number): boolean {
  return Boolean(
    database
      .prepare("SELECT version FROM schema_migrations WHERE version = ?")
      .get(version),
  );
}

export function migrate(database: Database.Database) {
  database.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)",
  );
  database.transaction(() => {
    if (!isApplied(database, 1)) {
      database.exec(initial);
      database
        .prepare(
          "INSERT INTO schema_migrations(version,applied_at) VALUES(1,?)",
        )
        .run(Date.now());
    }
    if (!isApplied(database, 2)) {
      for (const statement of profileV2.trim().split(";\n")) {
        if (statement.trim()) {
          try {
            database.exec(`${statement.trim()};`);
          } catch {
            /* column may already exist on partially migrated databases */
          }
        }
      }
      database
        .prepare(
          "INSERT INTO schema_migrations(version,applied_at) VALUES(2,?)",
        )
        .run(Date.now());
    }
    if (!isApplied(database, 3)) {
      database.exec(socialV3);
      database
        .prepare(
          "INSERT INTO schema_migrations(version,applied_at) VALUES(3,?)",
        )
        .run(Date.now());
    }
    if (!isApplied(database, 4)) {
      for (const statement of profileV4.trim().split(";\n")) {
        if (statement.trim()) database.exec(`${statement.trim()};`);
      }
      database
        .prepare(
          "INSERT INTO schema_migrations(version,applied_at) VALUES(4,?)",
        )
        .run(Date.now());
    }
  })();

  if (!isApplied(database, 5)) {
    const foreignKeysEnabled =
      Number(database.pragma("foreign_keys", { simple: true })) === 1;
    database.pragma("foreign_keys = OFF");
    try {
      const migrateV5 = database.transaction(() => {
        if (isApplied(database, 5)) return;
        database.exec(memesV5);
        database
          .prepare(
            "INSERT INTO schema_migrations(version,applied_at) VALUES(5,?)",
          )
          .run(Date.now());
      });
      migrateV5();
    } finally {
      database.pragma(`foreign_keys = ${foreignKeysEnabled ? "ON" : "OFF"}`);
    }
  }

  if (!isApplied(database, 6)) {
    database.transaction(() => {
      if (isApplied(database, 6)) return;
      for (const statement of openerV6.trim().split(";\n")) {
        if (statement.trim()) database.exec(`${statement.trim()};`);
      }
      database
        .prepare(
          "INSERT INTO schema_migrations(version,applied_at) VALUES(6,?)",
        )
        .run(Date.now());
    })();
  }
}

