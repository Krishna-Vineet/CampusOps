import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import postgres from "postgres";
import { migrationDatabaseUrl, readEnv } from "../config/env";

const MIGRATIONS_DIR = join(import.meta.dir, "migrations");

async function main() {
  const url = migrationDatabaseUrl(readEnv());
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await sql`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`;
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      const existing = await sql`SELECT name FROM schema_migrations WHERE name = ${file}`;
      if (existing.length > 0) {
        console.log(`skip ${file}`);
        continue;
      }
      const content = await readFile(join(MIGRATIONS_DIR, file), "utf8");
      await sql.begin(async (tx) => {
        await tx.unsafe(content);
        await tx`INSERT INTO schema_migrations (name) VALUES (${file})`;
      });
      console.log(`applied ${file}`);
    }
    console.log("migrations complete");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
