import { beforeEach, describe, expect, it, vi } from "vitest";

const sqlTag = vi.fn();
const postgresFactory = vi.fn(() => sqlTag);

vi.mock("postgres", () => ({
  default: postgresFactory,
}));

describe("postgres document storage", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("DATABASE_URL", "postgres://example");
  });

  it("reads a profile document from postgres", async () => {
    sqlTag
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          document_key: "resume_markdown",
          content: "# Resume",
          updated_at: "2026-04-04T12:00:00Z",
        },
      ]);

    const { readProfileDocument } = await import("@/lib/dashboard/postgres");

    await expect(readProfileDocument("resume_markdown")).resolves.toBe("# Resume");
  });

  it("upserts a profile document into postgres", async () => {
    sqlTag
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const { upsertProfileDocument } = await import("@/lib/dashboard/postgres");

    await expect(upsertProfileDocument("resume_markdown", "# Resume")).resolves.toBeUndefined();
    expect(sqlTag).toHaveBeenCalledTimes(4);
  });

  it("reads a generated cover letter from postgres", async () => {
    sqlTag
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          job_id: "job-1",
          filename: "example-letter.tex",
          tex: "\\documentclass{article}",
          preview_text: "Preview",
          updated_at: "2026-04-04T12:00:00Z",
        },
      ]);

    const { readCoverLetterRecord } = await import("@/lib/dashboard/postgres");

    await expect(readCoverLetterRecord("job-1")).resolves.toEqual({
      job_id: "job-1",
      filename: "example-letter.tex",
      tex: "\\documentclass{article}",
      preview_text: "Preview",
      updated_at: "2026-04-04T12:00:00Z",
    });
  });

  it("upserts a generated cover letter into postgres", async () => {
    sqlTag
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          job_id: "job-1",
          filename: "example-letter.tex",
          tex: "\\documentclass{article}",
          preview_text: "Preview",
          updated_at: "2026-04-04T12:00:00Z",
        },
      ]);

    const { upsertCoverLetterRecord } = await import("@/lib/dashboard/postgres");

    await expect(
      upsertCoverLetterRecord("job-1", "example-letter.tex", "\\documentclass{article}", "Preview"),
    ).resolves.toEqual({
      job_id: "job-1",
      filename: "example-letter.tex",
      tex: "\\documentclass{article}",
      preview_text: "Preview",
      updated_at: "2026-04-04T12:00:00Z",
    });
    expect(sqlTag).toHaveBeenCalledTimes(4);
  });
});
