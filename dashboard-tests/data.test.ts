import { describe, expect, it } from "vitest";

import { deriveDashboardViewModel } from "@/lib/dashboard/data";
import type { ApplicationsFile, JobRecord } from "@/lib/dashboard/types";

describe("dashboard data derivation", () => {
  const jobs: JobRecord[] = [
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
      alerted: true,
      alerted_at: "2026-04-04T11:00:00Z",
      alert_score: 85,
      alert_message_id: 1,
      match: {
        status: "scored",
        llm_score: 85,
        llm_rationale: "Excellent fit",
        llm_score_threshold: 70,
        keyword_hits: ["python", "mlops"],
        title_hits: ["Machine Learning Engineer"],
        location_match: "any",
        scored_at: "2026-04-04T10:01:00Z",
      },
    },
    {
      id: "job-2",
      company_id: "ing",
      company_name: "ING",
      title: "Data Analyst",
      url: "https://example.com/2",
      location: "Amsterdam, Netherlands",
      categories: ["Data"],
      description: "Analyst role",
      posted_date: "2026-04-04",
      first_seen: "2026-04-04T10:00:00Z",
      last_seen: "2026-04-04T10:00:00Z",
      source: "ing",
      match: {
        status: "filtered_keyword",
        llm_score: null,
        llm_rationale: null,
        llm_score_threshold: 70,
        keyword_hits: ["sql"],
        title_hits: ["Data Analyst"],
        location_match: "any",
        scored_at: "2026-04-04T10:01:00Z",
      },
    },
    {
      id: "job-3",
      company_id: "abn_amro",
      company_name: "ABN AMRO",
      title: "Junior Data Scientist",
      url: "https://example.com/3",
      location: "Amsterdam, Netherlands",
      categories: ["Data"],
      description: "Lower-score role",
      posted_date: "2026-04-04",
      first_seen: "2026-04-04T10:00:00Z",
      last_seen: "2026-04-04T10:00:00Z",
      source: "abn_amro",
      match: {
        status: "scored",
        llm_score: 62,
        llm_rationale: "Partial fit",
        llm_score_threshold: 70,
        keyword_hits: ["python"],
        title_hits: ["Data Scientist"],
        location_match: "any",
        scored_at: "2026-04-04T10:01:00Z",
      },
    },
  ];

  it("builds inbox from unreviewed scored jobs over threshold", () => {
    const viewModel = deriveDashboardViewModel(jobs, {});
    expect(viewModel.inboxJobs).toHaveLength(1);
    expect(viewModel.inboxJobs[0].id).toBe("job-1");
    expect(viewModel.newJobs).toHaveLength(3);
  });

  it("respects application state and removes reviewed items from inbox", () => {
    const applications: ApplicationsFile = {
      "job-1": {
        job_id: "job-1",
        status: "applied",
        updated_at: "2026-04-04T12:00:00Z",
        updated_by_role: "owner",
      },
    };
    const viewModel = deriveDashboardViewModel(jobs, applications);
    expect(viewModel.inboxJobs).toHaveLength(0);
    expect(viewModel.newJobs).toHaveLength(2);
    expect(viewModel.trackerJobs.find((job) => job.id === "job-1")?.applicationStatus).toBe("applied");
  });

  it("defaults irrelevant jobs to skipped instead of new", () => {
    const viewModel = deriveDashboardViewModel(jobs, {});

    expect(viewModel.trackerJobs.find((job) => job.id === "job-2")?.applicationStatus).toBe("skipped");
    expect(viewModel.trackerJobs.find((job) => job.id === "job-3")?.applicationStatus).toBe("skipped");
    expect(viewModel.trackerJobs.find((job) => job.id === "job-1")?.applicationStatus).toBe("new");
  });

  it("builds dashboard metrics from merged job state", () => {
    const applications: ApplicationsFile = {
      "job-1": {
        job_id: "job-1",
        status: "interview",
        updated_at: "2026-04-04T12:00:00Z",
        updated_by_role: "owner",
      },
    };

    const viewModel = deriveDashboardViewModel(jobs, applications);

    expect(viewModel.metrics.totalJobs).toBe(3);
    expect(viewModel.metrics.scoredJobs).toBe(2);
    expect(viewModel.metrics.inboxJobs).toBe(0);
    expect(viewModel.metrics.alertedJobs).toBe(1);
    expect(viewModel.metrics.statusCounts.find((entry) => entry.status === "interview")?.count).toBe(1);
    expect(viewModel.metrics.statusCounts.find((entry) => entry.status === "new")?.count).toBe(0);
    expect(viewModel.metrics.statusCounts.find((entry) => entry.status === "skipped")?.count).toBe(2);
    expect(viewModel.metrics.companyCounts).toEqual([
      { companyName: "Booking.com", count: 1 },
      { companyName: "ING", count: 1 },
      { companyName: "ABN AMRO", count: 1 },
    ]);
    expect(viewModel.metrics.scoreBuckets).toEqual([
      { label: "80+", count: 1 },
      { label: "70-79", count: 0 },
      { label: "60-69", count: 1 },
      { label: "<60", count: 0 },
    ]);
  });
});
