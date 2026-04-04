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

type CoverLetterRow = {
  job_id: string;
  filename: string;
  tex: string;
  preview_text: string;
  updated_at: Date | string;
  pdf_filename: string | null;
  pdf_data: Uint8Array | null;
  pdf_updated_at: Date | string | null;
  compile_status: string | null;
  compile_error: string | null;
};

export type CoverLetterRecord = {
  job_id: string;
  filename: string;
  tex: string;
  preview_text: string;
  updated_at: string;
  pdf_filename: string | null;
  pdf_data: Uint8Array | null;
  pdf_updated_at: string | null;
  compile_status: "idle" | "running" | "ready" | "failed";
  compile_error: string | null;
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
      await sql`
        CREATE TABLE IF NOT EXISTS cover_letters (
          job_id TEXT PRIMARY KEY,
          filename TEXT NOT NULL,
          tex TEXT NOT NULL,
          preview_text TEXT NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL,
          pdf_filename TEXT,
          pdf_data BYTEA,
          pdf_updated_at TIMESTAMPTZ,
          compile_status TEXT NOT NULL DEFAULT 'idle',
          compile_error TEXT
        )
      `;
      await sql`
        ALTER TABLE cover_letters
        ADD COLUMN IF NOT EXISTS pdf_filename TEXT
      `;
      await sql`
        ALTER TABLE cover_letters
        ADD COLUMN IF NOT EXISTS pdf_data BYTEA
      `;
      await sql`
        ALTER TABLE cover_letters
        ADD COLUMN IF NOT EXISTS pdf_updated_at TIMESTAMPTZ
      `;
      await sql`
        ALTER TABLE cover_letters
        ADD COLUMN IF NOT EXISTS compile_status TEXT NOT NULL DEFAULT 'idle'
      `;
      await sql`
        ALTER TABLE cover_letters
        ADD COLUMN IF NOT EXISTS compile_error TEXT
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

function toCoverLetterRecord(row: CoverLetterRow): CoverLetterRecord {
  return {
    job_id: row.job_id,
    filename: row.filename,
    tex: row.tex,
    preview_text: row.preview_text,
    updated_at: normalizedIso(row.updated_at),
    pdf_filename: row.pdf_filename ?? null,
    pdf_data: row.pdf_data ?? null,
    pdf_updated_at: row.pdf_updated_at ? normalizedIso(row.pdf_updated_at) : null,
    compile_status:
      row.compile_status === "running" ||
      row.compile_status === "ready" ||
      row.compile_status === "failed"
        ? row.compile_status
        : "idle",
    compile_error: row.compile_error ?? null,
  };
}

export async function readCoverLetterRecord(jobId: string): Promise<CoverLetterRecord | null> {
  await ensureApplicationsTable();
  const sql = getClient();
  const rows = await sql<CoverLetterRow[]>`
    SELECT
      job_id,
      filename,
      tex,
      preview_text,
      updated_at,
      pdf_filename,
      pdf_data,
      pdf_updated_at,
      compile_status,
      compile_error
    FROM cover_letters
    WHERE job_id = ${jobId}
    LIMIT 1
  `;

  return rows[0] ? toCoverLetterRecord(rows[0]) : null;
}

export async function readAllCoverLetterRecords(): Promise<CoverLetterRecord[]> {
  await ensureApplicationsTable();
  const sql = getClient();
  const rows = await sql<CoverLetterRow[]>`
    SELECT
      job_id,
      filename,
      tex,
      preview_text,
      updated_at,
      pdf_filename,
      pdf_data,
      pdf_updated_at,
      compile_status,
      compile_error
    FROM cover_letters
    ORDER BY updated_at DESC
  `;

  return rows.map(toCoverLetterRecord);
}

export async function upsertCoverLetterRecord(
  jobId: string,
  filename: string,
  tex: string,
  previewText: string,
): Promise<CoverLetterRecord> {
  await ensureApplicationsTable();
  const sql = getClient();
  const rows = await sql<CoverLetterRow[]>`
    INSERT INTO cover_letters (
      job_id,
      filename,
      tex,
      preview_text,
      updated_at,
      pdf_filename,
      pdf_data,
      pdf_updated_at,
      compile_status,
      compile_error
    )
    VALUES (
      ${jobId},
      ${filename},
      ${tex},
      ${previewText},
      ${normalizedIso(new Date())},
      NULL,
      NULL,
      NULL,
      'idle',
      NULL
    )
    ON CONFLICT (job_id) DO UPDATE SET
      filename = EXCLUDED.filename,
      tex = EXCLUDED.tex,
      preview_text = EXCLUDED.preview_text,
      updated_at = EXCLUDED.updated_at,
      pdf_filename = NULL,
      pdf_data = NULL,
      pdf_updated_at = NULL,
      compile_status = 'idle',
      compile_error = NULL
    RETURNING
      job_id,
      filename,
      tex,
      preview_text,
      updated_at,
      pdf_filename,
      pdf_data,
      pdf_updated_at,
      compile_status,
      compile_error
  `;

  return toCoverLetterRecord(rows[0]);
}

export async function upsertCoverLetterPdfRecord(
  jobId: string,
  pdfFilename: string,
  pdfData: Uint8Array,
): Promise<CoverLetterRecord> {
  await ensureApplicationsTable();
  const sql = getClient();
  const rows = await sql<CoverLetterRow[]>`
    UPDATE cover_letters
    SET
      pdf_filename = ${pdfFilename},
      pdf_data = ${pdfData},
      pdf_updated_at = ${normalizedIso(new Date())},
      compile_status = 'ready',
      compile_error = NULL
    WHERE job_id = ${jobId}
    RETURNING
      job_id,
      filename,
      tex,
      preview_text,
      updated_at,
      pdf_filename,
      pdf_data,
      pdf_updated_at,
      compile_status,
      compile_error
  `;

  if (!rows[0]) {
    throw new Error(`No stored cover letter found for job id: ${jobId}`);
  }

  return toCoverLetterRecord(rows[0]);
}

export async function updateCoverLetterCompileState(
  jobId: string,
  status: "idle" | "running" | "ready" | "failed",
  error: string | null = null,
): Promise<CoverLetterRecord> {
  await ensureApplicationsTable();
  const sql = getClient();
  const rows = await sql<CoverLetterRow[]>`
    UPDATE cover_letters
    SET
      compile_status = ${status},
      compile_error = ${error}
    WHERE job_id = ${jobId}
    RETURNING
      job_id,
      filename,
      tex,
      preview_text,
      updated_at,
      pdf_filename,
      pdf_data,
      pdf_updated_at,
      compile_status,
      compile_error
  `;

  if (!rows[0]) {
    throw new Error(`No stored cover letter found for job id: ${jobId}`);
  }

  return toCoverLetterRecord(rows[0]);
}
