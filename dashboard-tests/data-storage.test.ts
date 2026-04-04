import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  hasPostgresConfigured: vi.fn(),
  readApplicationsFromPostgres: vi.fn(),
  upsertApplicationRecord: vi.fn(),
}));

vi.mock("node:fs", () => ({
  promises: {
    readFile: mocks.readFile,
    writeFile: mocks.writeFile,
  },
}));

vi.mock("@/lib/dashboard/postgres", () => ({
  hasPostgresConfigured: mocks.hasPostgresConfigured,
  readApplicationsFromPostgres: mocks.readApplicationsFromPostgres,
  upsertApplicationRecord: mocks.upsertApplicationRecord,
}));

describe("dashboard storage selection", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("reads application state from Postgres when configured", async () => {
    mocks.hasPostgresConfigured.mockReturnValue(true);
    mocks.readApplicationsFromPostgres.mockResolvedValue({
      "job-1": {
        job_id: "job-1",
        status: "applied",
        updated_at: "2026-04-04T12:00:00Z",
        updated_by_role: "owner",
      },
    });

    const { readApplications } = await import("@/lib/dashboard/data");

    await expect(readApplications()).resolves.toEqual({
      "job-1": {
        job_id: "job-1",
        status: "applied",
        updated_at: "2026-04-04T12:00:00Z",
        updated_by_role: "owner",
      },
    });
    expect(mocks.readFile).not.toHaveBeenCalled();
  });

  it("upserts to Postgres instead of writing applications.json when configured", async () => {
    mocks.hasPostgresConfigured.mockReturnValue(true);
    mocks.readFile.mockResolvedValueOnce(
      JSON.stringify([
        {
          id: "job-1",
          company_id: "booking_com",
          company_name: "Booking.com",
          title: "Senior Machine Learning Engineer",
          url: "https://example.com/1",
          location: "Amsterdam, Netherlands",
          categories: ["ML"],
          description: "Strong ML role",
          posted_date: "2026-04-04",
          first_seen: "2026-04-04T10:00:00Z",
          last_seen: "2026-04-04T10:00:00Z",
          source: "icims",
        },
      ]),
    );
    mocks.upsertApplicationRecord.mockResolvedValue({
      job_id: "job-1",
      status: "saved",
      updated_at: "2026-04-04T12:00:00Z",
      updated_by_role: "owner",
    });

    const { updateApplicationStatus } = await import("@/lib/dashboard/data");

    await expect(
      updateApplicationStatus({
        jobId: "job-1",
        status: "saved",
        role: "owner",
      }),
    ).resolves.toEqual({
      job_id: "job-1",
      status: "saved",
      updated_at: "2026-04-04T12:00:00Z",
      updated_by_role: "owner",
    });

    expect(mocks.upsertApplicationRecord).toHaveBeenCalledWith({
      job_id: "job-1",
      status: "saved",
      updated_at: expect.any(String),
      updated_by_role: "owner",
    });
    expect(mocks.writeFile).not.toHaveBeenCalled();
  });
});
