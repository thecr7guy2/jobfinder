import postgres, { type Sql } from "postgres";

import type { ApplicationRecord, ApplicationsFile, ApplicationStatus, AccessRole } from "@/lib/dashboard/types";

const STATUS_VALUES: ApplicationStatus[] = [
  "new",
  "reviewing",
  "saved",
  "applied",
  "interview",
  "offer",
  "rejected",
  "skipped",
];

const ROLE_VALUES: AccessRole[] = ["viewer", "owner"];

type ApplicationRow = {
  job_id: string;
  status: ApplicationStatus;
  updated_at: Date | string;
  updated_by_role: AccessRole;
};

type ProfileDocumentRow = {
  document_key: string;
  content: string;
  updated_at: Date | string;
};

let client: Sql | null = null;
let ensureTablePromise: Promise<void> | null = null;

function normalizedIso(value: Date | string): string {
  const dateValue = value instanceof Date ? value : new Date(value);
  return dateValue.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function resolveDatabaseUrl(): string | null {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.NEON_DATABASE_URL ||
    null
  );
}

export function hasPostgresConfigured(): boolean {
  return Boolean(resolveDatabaseUrl());
}

function getClient(): Sql {
  if (client) {
    return client;
  }

  const connectionString = resolveDatabaseUrl();
  if (!connectionString) {
    throw new Error("Postgres is not configured.");
  }

  client = postgres(connectionString, {
    max: 1,
    prepare: false,
    idle_timeout: 5,
  });
  return client;
}

async function ensureApplicationsTable(): Promise<void> {
  if (!ensureTablePromise) {
    const sql = getClient();
    ensureTablePromise = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS applications (
          job_id TEXT PRIMARY KEY,
          status TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL,
          updated_by_role TEXT NOT NULL
        )
      `;
      await sql`
        CREATE TABLE IF NOT EXISTS profile_documents (
          document_key TEXT PRIMARY KEY,
          content TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL
        )
      `;
    })();
  }

  await ensureTablePromise;
}

function toRecord(row: ApplicationRow): ApplicationRecord {
  const status = STATUS_VALUES.includes(row.status) ? row.status : "new";
  const role = ROLE_VALUES.includes(row.updated_by_role) ? row.updated_by_role : "owner";

  return {
    job_id: row.job_id,
    status,
    updated_at: normalizedIso(row.updated_at),
    updated_by_role: role,
  };
}

export async function readApplicationsFromPostgres(): Promise<ApplicationsFile> {
  await ensureApplicationsTable();
  const sql = getClient();
  const rows = await sql<ApplicationRow[]>`
    SELECT job_id, status, updated_at, updated_by_role
    FROM applications
  `;

  return rows.reduce<ApplicationsFile>((accumulator, row) => {
    const record = toRecord(row);
    accumulator[record.job_id] = record;
    return accumulator;
  }, {});
}

export async function upsertApplicationRecord(record: ApplicationRecord): Promise<ApplicationRecord> {
  await ensureApplicationsTable();
  const sql = getClient();
  const rows = await sql<ApplicationRow[]>`
    INSERT INTO applications (job_id, status, updated_at, updated_by_role)
    VALUES (${record.job_id}, ${record.status}, ${record.updated_at}, ${record.updated_by_role})
    ON CONFLICT (job_id) DO UPDATE SET
      status = EXCLUDED.status,
      updated_at = EXCLUDED.updated_at,
      updated_by_role = EXCLUDED.updated_by_role
    RETURNING job_id, status, updated_at, updated_by_role
  `;

  return toRecord(rows[0]);
}

export async function readProfileDocument(documentKey: string): Promise<string | null> {
  await ensureApplicationsTable();
  const sql = getClient();
  const rows = await sql<ProfileDocumentRow[]>`
    SELECT document_key, content, updated_at
    FROM profile_documents
    WHERE document_key = ${documentKey}
    LIMIT 1
  `;

  return rows[0]?.content ?? null;
}

export async function upsertProfileDocument(documentKey: string, content: string): Promise<void> {
  await ensureApplicationsTable();
  const sql = getClient();
  await sql`
    INSERT INTO profile_documents (document_key, content, updated_at)
    VALUES (${documentKey}, ${content}, ${normalizedIso(new Date())})
    ON CONFLICT (document_key) DO UPDATE SET
      content = EXCLUDED.content,
      updated_at = EXCLUDED.updated_at
  `;
}
