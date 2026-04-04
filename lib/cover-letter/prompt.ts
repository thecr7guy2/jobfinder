import { promises as fs } from "node:fs";
import path from "node:path";

import type { JobRecord } from "@/lib/dashboard/types";
import { hasPostgresConfigured, readProfileDocument } from "@/lib/dashboard/postgres";

const ROOT_DIR = process.cwd();
const PROMPT_PATH = path.join(ROOT_DIR, "config", "cover_letter_prompt.md");
const RESUME_PATH = path.join(ROOT_DIR, "data", "resume.md");

export async function readCoverLetterPromptInstructions(): Promise<string> {
  return fs.readFile(PROMPT_PATH, "utf-8");
}

export async function readResumeMarkdown(): Promise<string> {
  if (hasPostgresConfigured()) {
    const storedResume = await readProfileDocument("resume_markdown");
    if (storedResume?.trim()) {
      return storedResume;
    }
    throw new Error("Resume is not stored in Postgres. Run pnpm sync:resume first.");
  }

  return fs.readFile(RESUME_PATH, "utf-8");
}

export function buildCoverLetterUserPrompt(job: JobRecord, resume: string): string {
  return [
    "Generate a cover letter body for the following job.",
    "",
    "Job:",
    JSON.stringify(
      {
        id: job.id,
        company_name: job.company_name,
        title: job.title,
        location: job.location,
        categories: job.categories,
        description: job.description,
        url: job.url,
      },
      null,
      2,
    ),
    "",
    "Resume:",
    resume,
  ].join("\n");
}
