"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import type { AccessRole, ApplicationStatus, DashboardJob } from "@/lib/dashboard/types";
import { APPLICATION_STATUSES } from "@/lib/dashboard/constants";

type JobsViewProps = {
  title: string;
  subtitle: string;
  jobs: DashboardJob[];
  alternateJobs?: DashboardJob[];
  role: AccessRole;
  mode: "inbox" | "tracker";
};

export function JobsView({ title, subtitle, jobs, alternateJobs = [], role, mode }: JobsViewProps) {
  const [query, setQuery] = useState("");
  const [company, setCompany] = useState("all");
  const [status, setStatus] = useState("all");
  const [queue, setQueue] = useState<"high_score" | "newly_added">("high_score");
  const [localJobs, setLocalJobs] = useState(jobs);
  const [alternateLocalJobs, setAlternateLocalJobs] = useState(alternateJobs);
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    setLocalJobs(jobs);
  }, [jobs]);

  useEffect(() => {
    setAlternateLocalJobs(alternateJobs);
  }, [alternateJobs]);

  useEffect(() => {
    if (!feedback) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setFeedback(null);
    }, 2400);

    return () => window.clearTimeout(timeout);
  }, [feedback]);

  const companies = useMemo(
    () => ["all", ...new Set((mode === "inbox" && queue === "newly_added" ? alternateLocalJobs : localJobs).map((job) => job.companyName))],
    [alternateLocalJobs, localJobs, mode, queue],
  );

  const jobsPool = mode === "inbox" && queue === "newly_added" ? alternateLocalJobs : localJobs;

  const visibleJobs = useMemo(() => {
    return jobsPool.filter((job) => {
      const matchesQuery =
        !query ||
        `${job.title} ${job.companyName} ${job.location}`.toLowerCase().includes(query.toLowerCase());
      const matchesCompany = company === "all" || job.companyName === company;
      const matchesStatus = status === "all" || job.applicationStatus === status;
      return matchesQuery && matchesCompany && matchesStatus;
    });
  }, [company, jobsPool, query, status]);

  async function updateStatus(jobId: string, nextStatus: ApplicationStatus) {
    if (role !== "owner" || pendingJobId === jobId) {
      return;
    }

    const previousJob = localJobs.find((job) => job.id === jobId);
    if (!previousJob || previousJob.applicationStatus === nextStatus) {
      return;
    }

    setPendingJobId(jobId);
    setFeedback(null);

    setLocalJobs((currentJobs) =>
      currentJobs.map((job) =>
        job.id === jobId
          ? {
              ...job,
              applicationStatus: nextStatus,
            }
          : job,
      ),
    );

    try {
      const response = await fetch("/api/status/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, status: nextStatus }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; record?: { status: ApplicationStatus; updated_at: string; updated_by_role: AccessRole } }
        | null;

      if (!response.ok || !payload?.record) {
        throw new Error(payload?.error || "Failed to save status.");
      }

      setLocalJobs((currentJobs) =>
        currentJobs.map((job) =>
          job.id === jobId
            ? {
                ...job,
                applicationStatus: payload.record!.status,
                applicationUpdatedAt: payload.record!.updated_at,
                applicationUpdatedByRole: payload.record!.updated_by_role,
              }
            : job,
        ),
      );
      setFeedback({
        tone: "success",
        message: `Saved ${nextStatus} for ${previousJob.title}.`,
      });
    } catch (error) {
      setLocalJobs((currentJobs) =>
        currentJobs.map((job) =>
          job.id === jobId
            ? {
                ...job,
                applicationStatus: previousJob.applicationStatus,
                applicationUpdatedAt: previousJob.applicationUpdatedAt,
                applicationUpdatedByRole: previousJob.applicationUpdatedByRole,
              }
            : job,
        ),
      );
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to save status.",
      });
    } finally {
      setPendingJobId(null);
    }
  }

  return (
    <>
      <div className="hero">
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>

      {feedback ? <div className={`inline-feedback inline-feedback-${feedback.tone}`}>{feedback.message}</div> : null}

      <section className="panel">
        <div className="panel-header">
          <h3>{mode === "inbox" ? "Priority queue" : "All tracked jobs"}</h3>
          <span className="subtle">{visibleJobs.length} visible</span>
        </div>

        <div className="filters">
          {mode === "inbox" ? (
            <select value={queue} onChange={(event) => setQueue(event.target.value as "high_score" | "newly_added")}>
              <option value="high_score">High-score queue</option>
              <option value="newly_added">Newly added jobs</option>
            </select>
          ) : null}
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search title, company, location"
          />
          <select value={company} onChange={(event) => setCompany(event.target.value)}>
            {companies.map((option) => (
              <option key={option} value={option}>
                {option === "all" ? "All companies" : option}
              </option>
            ))}
          </select>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All statuses</option>
            {APPLICATION_STATUSES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        <div className="table-shell desktop-table">
          <table>
            <thead>
              <tr>
                <th>Role</th>
                <th>Score</th>
                <th>Status</th>
                <th>Company</th>
                <th>Location</th>
                <th>Alerted</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {visibleJobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    <Link className="title-button" href={`/jobs/${encodeURIComponent(job.id)}?from=${mode}`}>
                      <strong>{job.title}</strong>
                      <span className="source-label">{job.source}</span>
                    </Link>
                  </td>
                  <td>
                    <span className="score-pill">{job.score ?? "N/A"}</span>
                  </td>
                  <td>
                    {role === "owner" ? (
                      <select
                        className="status-select"
                        value={job.applicationStatus}
                        disabled={pendingJobId === job.id}
                        onChange={(event) => updateStatus(job.id, event.target.value as ApplicationStatus)}
                      >
                        {APPLICATION_STATUSES.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={`status-pill status-${job.applicationStatus}`}>{job.applicationStatus}</span>
                    )}
                  </td>
                  <td>{job.companyName}</td>
                  <td>{job.location}</td>
                  <td>{job.alerted ? "Yes" : "No"}</td>
                  <td>
                    {pendingJobId === job.id
                      ? "Saving..."
                      : job.applicationUpdatedAt
                        ? new Date(job.applicationUpdatedAt).toLocaleDateString()
                        : "Not updated"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mobile-jobs" aria-label="Mobile jobs list">
          {visibleJobs.map((job) => (
            <article className="mobile-job-card" key={job.id}>
              <div className="mobile-job-top">
                <div className="mobile-job-heading">
                  <Link className="title-button" href={`/jobs/${encodeURIComponent(job.id)}?from=${mode}`}>
                    <strong>{job.title}</strong>
                    <span className="source-label">{job.source}</span>
                  </Link>
                  <div className="mobile-job-company">{job.companyName}</div>
                </div>
                <span className="score-pill">{job.score ?? "N/A"}</span>
              </div>

              <div className="mobile-meta-grid">
                <div className="mobile-meta-item">
                  <span className="subtle">Location</span>
                  <strong>{job.location}</strong>
                </div>
                <div className="mobile-meta-item">
                  <span className="subtle">Alerted</span>
                  <strong>{job.alerted ? "Yes" : "No"}</strong>
                </div>
                <div className="mobile-meta-item">
                  <span className="subtle">Updated</span>
                  <strong>{job.applicationUpdatedAt ? new Date(job.applicationUpdatedAt).toLocaleDateString() : "Not updated"}</strong>
                </div>
              </div>

              <div className="mobile-job-actions">
                {role === "owner" ? (
                  <select
                    className="status-select"
                    value={job.applicationStatus}
                    disabled={pendingJobId === job.id}
                    onChange={(event) => updateStatus(job.id, event.target.value as ApplicationStatus)}
                  >
                    {APPLICATION_STATUSES.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className={`status-pill status-${job.applicationStatus}`}>{job.applicationStatus}</span>
                )}

                <Link className="secondary-button mobile-detail-button" href={`/jobs/${encodeURIComponent(job.id)}?from=${mode}`}>
                  {pendingJobId === job.id ? "Saving..." : "View details"}
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
