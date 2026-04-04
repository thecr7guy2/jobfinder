import { promises as fs } from "node:fs";
import path from "node:path";

import type { JobRecord } from "@/lib/dashboard/types";
import { buildCoverLetterUserPrompt, readCoverLetterPromptInstructions, readResumeMarkdown } from "@/lib/cover-letter/prompt";
import { escapeLatex, paragraphsToLatex } from "@/lib/cover-letter/latex";
import { injectTemplatePlaceholders, readCoverLetterTemplate } from "@/lib/cover-letter/template";
import type { CoverLetterSections, GeneratedCoverLetter } from "@/lib/cover-letter/types";

const ROOT_DIR = process.cwd();
const JOBS_PATH = path.join(ROOT_DIR, "data", "jobs.json");

function isoDateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function displayDate(): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());
}

export function cleanRoleTitle(rawTitle: string): string {
  return rawTitle
    .replace(/\s+[A-Za-z][A-Za-z0-9/+&-]*\s*\(\(+.*$/g, "")
    .replace(/\(\(+.*$/g, "")
    .replace(/\s+\(([^)]*(python|mlops|docker|kubernetes|spark|tensorflow|pytorch|sql)[^)]*)\)\s*$/i, "")
    .replace(/\s*[-|:]\s*(python|mlops|docker|kubernetes|spark|tensorflow|pytorch|sql).*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:]+$/g, "");
}

export function coverLetterSubject(roleTitle: string): string {
  return `Application for ${roleTitle}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function validateSections(payload: unknown): CoverLetterSections {
  if (!payload || typeof payload !== "object") {
    throw new Error("Cover letter model returned an invalid payload.");
  }

  const data = payload as Record<string, unknown>;
  const opening = String(data.opening_paragraph ?? "").trim();
  const experience = String(data.experience_paragraph ?? "").trim();
  const closing = String(data.closing_paragraph ?? "").trim();

  if (!opening || !experience || !closing) {
    throw new Error("Cover letter model response is missing one or more paragraphs.");
  }

  return {
    opening_paragraph: opening,
    experience_paragraph: experience,
    closing_paragraph: closing,
  };
}

export async function readJobsForCoverLetters(): Promise<JobRecord[]> {
  const content = await fs.readFile(JOBS_PATH, "utf-8");
  return JSON.parse(content) as JobRecord[];
}

export async function findJobById(jobId: string): Promise<JobRecord | null> {
  const jobs = await readJobsForCoverLetters();
  return jobs.find((job) => job.id === jobId) ?? null;
}

export async function generateCoverLetterSections(job: JobRecord): Promise<CoverLetterSections> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("Missing required environment variable: DEEPSEEK_API_KEY");
  }

  const [instructions, resume] = await Promise.all([
    readCoverLetterPromptInstructions(),
    readResumeMarkdown(),
  ]);

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 900,
      messages: [
        {
          role: "system",
          content: instructions,
        },
        {
          role: "user",
          content: buildCoverLetterUserPrompt(job, resume),
        },
      ],
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        choices?: Array<{
          message?: {
            content?: string;
          };
        }>;
        error?: {
          message?: string;
        };
      }
    | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message || "Failed to generate cover letter.");
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Cover letter model returned an empty response.");
  }

  return validateSections(JSON.parse(content));
}

export async function generateCoverLetter(job: JobRecord): Promise<GeneratedCoverLetter> {
  const [template, sections] = await Promise.all([
    readCoverLetterTemplate(),
    generateCoverLetterSections(job),
  ]);
  const roleTitle = cleanRoleTitle(job.title) || job.title;

  const letterBody = paragraphsToLatex([
    sections.opening_paragraph,
    sections.experience_paragraph,
    sections.closing_paragraph,
  ]);

  const tex = injectTemplatePlaceholders(template, {
    DATE: escapeLatex(displayDate()),
    FULL_NAME: escapeLatex("Maniraj Sai"),
    EMAIL: escapeLatex("mairajadapa@gmail.com"),
    LINKEDIN: escapeLatex("manirajsai"),
    PHONE: escapeLatex("+31 684011721"),
    LOCATION: escapeLatex("Arnhem, NL"),
    TITLE: escapeLatex("Applicant"),
    CLOSER: escapeLatex("Kind Regards"),
    COMPANY_NAME: escapeLatex(job.company_name),
    ROLE_TITLE: escapeLatex(roleTitle),
    SUBJECT: escapeLatex(coverLetterSubject(roleTitle)),
    LETTER_BODY: letterBody,
  });

  const previewText = [
    sections.opening_paragraph,
    sections.experience_paragraph,
    sections.closing_paragraph,
  ].join("\n\n");

  return {
    filename: `${slugify(job.company_name)}-${slugify(roleTitle)}-${isoDateStamp()}.tex`,
    tex,
    previewText,
  };
}
