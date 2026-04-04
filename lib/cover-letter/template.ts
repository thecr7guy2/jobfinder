import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT_DIR = process.cwd();
const TEMPLATE_PATH = path.join(ROOT_DIR, "data", "cover_letter_template.tex");

export async function readCoverLetterTemplate(): Promise<string> {
  return fs.readFile(TEMPLATE_PATH, "utf-8");
}

export function injectTemplatePlaceholders(
  template: string,
  replacements: Record<string, string>,
): string {
  return Object.entries(replacements).reduce(
    (current, [key, value]) => current.replaceAll(`{{${key}}}`, value),
    template,
  );
}
