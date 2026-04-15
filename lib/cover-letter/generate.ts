import { promises as fs } from "node:fs";
import path from "node:path";

import type { JobRecord } from "@/lib/dashboard/types";
import { buildCoverLetterUserPrompt, readCoverLetterPromptInstructions, readResumeMarkdown } from "@/lib/cover-letter/prompt";
import { escapeLatex, paragraphsToLatex } from "@/lib/cover-letter/latex";
import { injectTemplatePlaceholders, readCoverLetterTemplate } from "@/lib/cover-letter/template";
import type { CoverLetterSections, GeneratedCoverLetter } from "@/lib/cover-letter/types";

const ROOT_DIR = process.cwd();
const JOBS_PATH = path.join(ROOT_DIR, "data", "jobs.json");
const MAX_TOTAL_WORDS = 330;
const OPENING_MAX_WORDS = 115;
const EXPERIENCE_MAX_WORDS = 150;
const CLOSING_MAX_WORDS = 65;
const MAX_PARAGRAPH_SENTENCES = 3;

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

function countWords(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function splitSentences(value: string): string[] {
  return value
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function trimWords(value: string, maxWords: number): string {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return value.trim();
  }

  return `${words.slice(0, maxWords).join(" ").replace(/[,:;\-]+$/g, "")}.`;
}

function sentenceWithEnding(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    return "";
  }
  if (/[.!?]["')\]]?$/.test(trimmed)) {
    return trimmed;
  }
  return `${trimmed.replace(/[,:;\-]+$/g, "")}.`;
}

function trimToWordBudgetBySentence(value: string, maxWords: number): string {
  const sentences = splitSentences(value).map(sentenceWithEnding).filter(Boolean);
  if (sentences.length === 0) {
    return sentenceWithEnding(trimWords(value, maxWords));
  }

  const selected: string[] = [];
  for (const sentence of sentences) {
    const candidate = [...selected, sentence].join(" ").trim();
    if (countWords(candidate) > maxWords) {
      break;
    }
    selected.push(sentence);
  }

  if (selected.length > 0) {
    return selected.join(" ").trim();
  }

  return sentenceWithEnding(trimWords(sentences[0], maxWords));
}

function tightenParagraph(value: string, maxWords: number): string {
  const rawSentences = splitSentences(value);
  if (rawSentences.length === 0) {
    return sentenceWithEnding(trimWords(value, maxWords));
  }

  const limited = rawSentences
    .slice(0, MAX_PARAGRAPH_SENTENCES)
    .map(sentenceWithEnding)
    .filter(Boolean)
    .join(" ")
    .trim();

  return trimToWordBudgetBySentence(limited || value, maxWords);
}

export function normalizeCoverLetterSections(sections: CoverLetterSections): CoverLetterSections {
  const normalized = {
    opening_paragraph: tightenParagraph(sections.opening_paragraph, OPENING_MAX_WORDS),
    experience_paragraph: tightenParagraph(sections.experience_paragraph, EXPERIENCE_MAX_WORDS),
    closing_paragraph: tightenParagraph(sections.closing_paragraph, CLOSING_MAX_WORDS),
  };

  const totalWords = () =>
    countWords(normalized.opening_paragraph) +
    countWords(normalized.experience_paragraph) +
    countWords(normalized.closing_paragraph);

  while (totalWords() > MAX_TOTAL_WORDS) {
    const dropOrder: Array<keyof CoverLetterSections> = [
      "experience_paragraph",
      "opening_paragraph",
      "closing_paragraph",
    ];
    let dropped = false;

    for (const key of dropOrder) {
      const sentences = splitSentences(normalized[key]);
      if (sentences.length <= 1) {
        continue;
      }

      normalized[key] = sentences.slice(0, -1).join(" ").trim();
      dropped = true;
      break;
    }

    if (!dropped) {
      break;
    }
  }

  if (totalWords() > MAX_TOTAL_WORDS) {
    const overflow = totalWords() - MAX_TOTAL_WORDS;
    const experienceBudget = Math.max(55, countWords(normalized.experience_paragraph) - overflow);
    normalized.experience_paragraph = trimToWordBudgetBySentence(normalized.experience_paragraph, experienceBudget);
  }

  if (totalWords() > MAX_TOTAL_WORDS) {
    const overflow = totalWords() - MAX_TOTAL_WORDS;
    const openingBudget = Math.max(40, countWords(normalized.opening_paragraph) - overflow);
    normalized.opening_paragraph = trimToWordBudgetBySentence(normalized.opening_paragraph, openingBudget);
  }

  return normalized;
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

  return normalizeCoverLetterSections({
    opening_paragraph: opening,
    experience_paragraph: experience,
    closing_paragraph: closing,
  });
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
      temperature: 0.35,
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
