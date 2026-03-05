import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export function openDb(dbPath: string) {
  const dir = path.dirname(dbPath);
  if (dir && dir !== "." && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return new Database(dbPath);
}
