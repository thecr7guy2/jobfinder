import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionRole: vi.fn(),
  readCoverLetterRecord: vi.fn(),
}));

vi.mock("@/lib/dashboard/auth", () => ({
  getSessionRole: mocks.getSessionRole,
}));

vi.mock("@/lib/dashboard/postgres", () => ({
  readCoverLetterRecord: mocks.readCoverLetterRecord,
}));

import { GET } from "@/app/api/cover-letter/pdf/route";

describe("cover letter pdf route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("requires owner access", async () => {
    mocks.getSessionRole.mockResolvedValue("viewer");

    const response = await GET(new Request("http://localhost/api/cover-letter/pdf?jobId=job-1"));

    expect(response.status).toBe(403);
  });

  it("requires a job id", async () => {
    mocks.getSessionRole.mockResolvedValue("owner");

    const response = await GET(new Request("http://localhost/api/cover-letter/pdf"));

    expect(response.status).toBe(400);
  });

  it("returns 404 when no compiled pdf exists", async () => {
    mocks.getSessionRole.mockResolvedValue("owner");
    mocks.readCoverLetterRecord.mockResolvedValue({
      job_id: "job-1",
      filename: "example-letter.tex",
      tex: "\\documentclass{article}",
      preview_text: "Preview",
      updated_at: "2026-04-04T12:00:00Z",
      pdf_filename: null,
      pdf_data: null,
      pdf_updated_at: null,
    });

    const response = await GET(new Request("http://localhost/api/cover-letter/pdf?jobId=job-1"));

    expect(response.status).toBe(404);
  });

  it("returns the compiled pdf", async () => {
    mocks.getSessionRole.mockResolvedValue("owner");
    mocks.readCoverLetterRecord.mockResolvedValue({
      job_id: "job-1",
      filename: "example-letter.tex",
      tex: "\\documentclass{article}",
      preview_text: "Preview",
      updated_at: "2026-04-04T12:00:00Z",
      pdf_filename: "example-letter.pdf",
      pdf_data: new Uint8Array([37, 80, 68, 70]),
      pdf_updated_at: "2026-04-04T13:00:00Z",
    });

    const response = await GET(new Request("http://localhost/api/cover-letter/pdf?jobId=job-1"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toContain("example-letter.pdf");
    await expect(response.arrayBuffer()).resolves.toBeInstanceOf(ArrayBuffer);
  });
});
