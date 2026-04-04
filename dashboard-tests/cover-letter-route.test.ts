import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionRole: vi.fn(),
  findJobById: vi.fn(),
  generateCoverLetter: vi.fn(),
  saveGeneratedCoverLetter: vi.fn(),
}));

vi.mock("@/lib/dashboard/auth", () => ({
  getSessionRole: mocks.getSessionRole,
}));

vi.mock("@/lib/cover-letter/generate", () => ({
  findJobById: mocks.findJobById,
  generateCoverLetter: mocks.generateCoverLetter,
}));

vi.mock("@/lib/cover-letter/storage", () => ({
  saveGeneratedCoverLetter: mocks.saveGeneratedCoverLetter,
}));

import { POST } from "@/app/api/cover-letter/generate/route";

describe("cover letter generate route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.saveGeneratedCoverLetter.mockResolvedValue({
      savedPath: null,
      mode: "postgres",
    });
  });

  it("requires authenticated access", async () => {
    mocks.getSessionRole.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/cover-letter/generate", {
        method: "POST",
        body: JSON.stringify({ jobId: "job-1" }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Owner access required." });
  });

  it("rejects viewer access", async () => {
    mocks.getSessionRole.mockResolvedValue("viewer");

    const response = await POST(
      new Request("http://localhost/api/cover-letter/generate", {
        method: "POST",
        body: JSON.stringify({ jobId: "job-1" }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Owner access required." });
  });

  it("rejects missing job ids", async () => {
    mocks.getSessionRole.mockResolvedValue("owner");

    const response = await POST(
      new Request("http://localhost/api/cover-letter/generate", {
        method: "POST",
        body: JSON.stringify({}),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "jobId is required." });
  });

  it("returns 404 for unknown jobs", async () => {
    mocks.getSessionRole.mockResolvedValue("owner");
    mocks.findJobById.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/cover-letter/generate", {
        method: "POST",
        body: JSON.stringify({ jobId: "missing-job" }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Unknown job id: missing-job" });
  });

  it("returns generated tex payload on success", async () => {
    mocks.getSessionRole.mockResolvedValue("owner");
    mocks.findJobById.mockResolvedValue({ id: "job-1" });
    mocks.generateCoverLetter.mockResolvedValue({
      filename: "booking-com-senior-ml-engineer-2026-04-04.tex",
      tex: "\\documentclass{letter}",
      previewText: "Paragraph one.\n\nParagraph two.",
    });

    const response = await POST(
      new Request("http://localhost/api/cover-letter/generate", {
        method: "POST",
        body: JSON.stringify({ jobId: "job-1" }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      filename: "booking-com-senior-ml-engineer-2026-04-04.tex",
      tex: "\\documentclass{letter}",
      previewText: "Paragraph one.\n\nParagraph two.",
      savedPath: null,
      savedMode: "postgres",
    });
  });
});
