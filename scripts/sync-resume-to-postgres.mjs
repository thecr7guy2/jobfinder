import fs from "node:fs/promises";
import path from "node:path";

import postgres from "postgres";

const ROOT_DIR = process.cwd();
const ENV_PATH = path.join(ROOT_DIR, ".env");
const RESUME_PATH = path.join(ROOT_DIR, "data", "resume.md");

function loadEnvFile(content) {
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

async function main() {
  try {
    const envContent = await fs.readFile(ENV_PATH, "utf-8");
    loadEnvFile(envContent);
  } catch {}

  const databaseUrl =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.NEON_DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("Missing DATABASE_URL or POSTGRES_URL.");
  }

  const resume = await fs.readFile(RESUME_PATH, "utf-8");
  if (!resume.trim()) {
    throw new Error("data/resume.md is empty.");
  }

  const sql = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    idle_timeout: 5,
  });

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS profile_documents (
        document_key TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      )
    `;
    await sql`
      INSERT INTO profile_documents (document_key, content, updated_at)
      VALUES ('resume_markdown', ${resume}, ${new Date().toISOString()})
      ON CONFLICT (document_key) DO UPDATE SET
        content = EXCLUDED.content,
        updated_at = EXCLUDED.updated_at
    `;
  } finally {
    await sql.end();
  }

  console.log("Synced data/resume.md to profile_documents.resume_markdown");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
