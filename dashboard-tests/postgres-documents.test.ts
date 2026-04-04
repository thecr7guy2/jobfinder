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
    sqlTag.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    const { upsertProfileDocument } = await import("@/lib/dashboard/postgres");

    await expect(upsertProfileDocument("resume_markdown", "# Resume")).resolves.toBeUndefined();
    expect(sqlTag).toHaveBeenCalledTimes(3);
  });
});
