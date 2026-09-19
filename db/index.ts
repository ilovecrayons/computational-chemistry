import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { config } from "../lib/config";
import { migrate } from "./migrations";
import * as schema from "./schema";

function connect() {
  const filename = config.databaseUrl.replace(/^file:/, "");
  if (filename !== ":memory:")
    mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  const connection = new Database(filename);
  connection.pragma("journal_mode = WAL");
  connection.pragma("foreign_keys = ON");
  connection.pragma("busy_timeout = 5000");
  migrate(connection);
  return connection;
}
const globalDatabase = globalThis as typeof globalThis & {
  memeantSqlite?: Database.Database;
};
export const sqlite = globalDatabase.memeantSqlite ?? connect();
globalDatabase.memeantSqlite = sqlite;
export const db = drizzle(sqlite, { schema });
