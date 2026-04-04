import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionRole: vi.fn(),
  findJobById: vi.fn(),
}));

vi.mock("@/lib/dashboard/auth", () => ({
  getSessionRole: mocks.getSessionRole,
}));

vi.mock("@/lib/cover-letter/generate", () => ({
  findJobById: mocks.findJobById,
}));

import { POST } from "@/app/api/cover-letter/compile/route";

describe("cover letter compile route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("GH_REPO", "thecr7guy2/jobfinder");
    vi.stubEnv("GH_PAT", "token");
    vi.stubEnv("GH_BRANCH", "main");
  });

  it("requires owner access", async () => {
    mocks.getSessionRole.mockResolvedValue("viewer");

    const response = await POST(
      new Request("http://localhost/api/cover-letter/compile", {
        method: "POST",
        body: JSON.stringify({ jobId: "job-1" }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(403);
  });

  it("rejects missing job ids", async () => {
    mocks.getSessionRole.mockResolvedValue("owner");

    const response = await POST(
      new Request("http://localhost/api/cover-letter/compile", {
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
      new Request("http://localhost/api/cover-letter/compile", {
        method: "POST",
        body: JSON.stringify({ jobId: "missing-job" }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(404);
  });

  it("dispatches the GitHub workflow", async () => {
    mocks.getSessionRole.mockResolvedValue("owner");
    mocks.findJobById.mockResolvedValue({ id: "job-1" });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      new Request("http://localhost/api/cover-letter/compile", {
        method: "POST",
        body: JSON.stringify({ jobId: "job-1" }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      workflowId: "cover_letter_pdf.yml",
      runUrl: "https://github.com/thecr7guy2/jobfinder/actions/workflows/cover_letter_pdf.yml",
    });
  });
});
