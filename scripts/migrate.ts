import { sqlite } from "../db";
console.log(
  "SQLite schema is up to date. WAL mode and foreign keys are enabled.",
);
sqlite.close();
