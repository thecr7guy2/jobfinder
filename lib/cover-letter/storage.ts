import type { GeneratedCoverLetter } from "@/lib/cover-letter/types";
import {
  hasPostgresConfigured,
  upsertCoverLetterRecord,
} from "@/lib/dashboard/postgres";

export type SavedCoverLetter = {
  mode: "postgres" | "none";
  savedPath: string | null;
};

export async function saveGeneratedCoverLetter(
  jobId: string,
  letter: GeneratedCoverLetter,
): Promise<SavedCoverLetter> {
  if (hasPostgresConfigured()) {
    await upsertCoverLetterRecord(jobId, letter.filename, letter.tex, letter.previewText);
    return {
      mode: "postgres",
      savedPath: null,
    };
  }

  return {
    mode: "none",
    savedPath: null,
  };
}
