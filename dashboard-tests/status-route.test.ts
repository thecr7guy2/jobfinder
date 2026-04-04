import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionRole: vi.fn(),
  assertValidStatus: vi.fn(),
  updateApplicationStatus: vi.fn(),
}));

vi.mock("@/lib/dashboard/auth", () => ({
  getSessionRole: mocks.getSessionRole,
}));

vi.mock("@/lib/dashboard/data", () => ({
  assertValidStatus: mocks.assertValidStatus,
  updateApplicationStatus: mocks.updateApplicationStatus,
}));

import { POST } from "@/app/api/status/update/route";

describe("status update route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("rejects non-owner users", async () => {
    mocks.getSessionRole.mockResolvedValue("viewer");

    const response = await POST(
      new Request("http://localhost/api/status/update", {
        method: "POST",
        body: JSON.stringify({ jobId: "job-1", status: "applied" }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Owner access required." });
  });

  it("rejects invalid payloads before data updates", async () => {
    mocks.getSessionRole.mockResolvedValue("owner");

    const response = await POST(
      new Request("http://localhost/api/status/update", {
        method: "POST",
        body: JSON.stringify({ jobId: "job-1" }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.assertValidStatus).not.toHaveBeenCalled();
    expect(mocks.updateApplicationStatus).not.toHaveBeenCalled();
  });

  it("returns validation errors for invalid statuses", async () => {
    mocks.getSessionRole.mockResolvedValue("owner");
    mocks.assertValidStatus.mockImplementation(() => {
      throw new Error("Invalid application status: bad-status");
    });

    const response = await POST(
      new Request("http://localhost/api/status/update", {
        method: "POST",
        body: JSON.stringify({ jobId: "job-1", status: "bad-status" }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Invalid application status: bad-status",
    });
    expect(mocks.updateApplicationStatus).not.toHaveBeenCalled();
  });

  it("returns unknown job errors from the status writer", async () => {
    mocks.getSessionRole.mockResolvedValue("owner");
    mocks.updateApplicationStatus.mockRejectedValue(new Error("Unknown job id: missing-job"));

    const response = await POST(
      new Request("http://localhost/api/status/update", {
        method: "POST",
        body: JSON.stringify({ jobId: "missing-job", status: "applied" }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(mocks.assertValidStatus).toHaveBeenCalledWith("applied");
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Unknown job id: missing-job",
    });
  });

  it("returns the saved record on success", async () => {
    mocks.getSessionRole.mockResolvedValue("owner");
    mocks.updateApplicationStatus.mockResolvedValue({
      job_id: "job-1",
      status: "saved",
      updated_at: "2026-04-04T12:00:00Z",
      updated_by_role: "owner",
    });

    const response = await POST(
      new Request("http://localhost/api/status/update", {
        method: "POST",
        body: JSON.stringify({ jobId: "job-1", status: "saved" }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(mocks.assertValidStatus).toHaveBeenCalledWith("saved");
    expect(mocks.updateApplicationStatus).toHaveBeenCalledWith({
      jobId: "job-1",
      status: "saved",
      role: "owner",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      record: {
        job_id: "job-1",
        status: "saved",
        updated_at: "2026-04-04T12:00:00Z",
        updated_by_role: "owner",
      },
    });
  });
});
