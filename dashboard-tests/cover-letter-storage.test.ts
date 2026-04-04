import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { saveGeneratedCoverLetter } from "@/lib/cover-letter/storage";

const mocks = vi.hoisted(() => ({
  hasPostgresConfigured: vi.fn(),
  upsertCoverLetterRecord: vi.fn(),
}));

vi.mock("@/lib/dashboard/postgres", () => ({
  hasPostgresConfigured: mocks.hasPostgresConfigured,
  upsertCoverLetterRecord: mocks.upsertCoverLetterRecord,
}));

describe("cover letter storage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    delete process.env.VERCEL;
  });

  it("stores generated letters in postgres when configured", async () => {
    mocks.hasPostgresConfigured.mockReturnValue(true);
    mocks.upsertCoverLetterRecord.mockResolvedValue(undefined);

    const result = await saveGeneratedCoverLetter("job-1", {
      filename: "example-letter.tex",
      tex: "\\documentclass{article}",
      previewText: "Preview",
    });

    expect(mocks.upsertCoverLetterRecord).toHaveBeenCalledWith(
      "job-1",
      "example-letter.tex",
      "\\documentclass{article}",
      "Preview",
    );
    expect(result).toEqual({
      mode: "postgres",
      savedPath: null,
    });
  });

  it("returns none when postgres is not configured", async () => {
    mocks.hasPostgresConfigured.mockReturnValue(false);

    const result = await saveGeneratedCoverLetter("job-1", {
      filename: "example-letter.tex",
      tex: "\\documentclass{article}",
      previewText: "Preview",
    });

    expect(mocks.upsertCoverLetterRecord).not.toHaveBeenCalled();
    expect(result).toEqual({
      mode: "none",
      savedPath: null,
    });
  });
});
