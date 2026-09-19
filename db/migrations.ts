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

export function migrate(database: Database.Database) {
  database.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)",
  );
  database.transaction(() => {
    if (
      !database
        .prepare("SELECT version FROM schema_migrations WHERE version = 1")
        .get()
    ) {
      database.exec(initial);
      database
        .prepare(
          "INSERT INTO schema_migrations(version,applied_at) VALUES(1,?)",
        )
        .run(Date.now());
    }
    if (
      !database
        .prepare("SELECT version FROM schema_migrations WHERE version = 2")
        .get()
    ) {
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
  })();
}
