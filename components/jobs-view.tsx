"use client";

import { useEffect, useMemo, useState } from "react";

import type { AccessRole, ApplicationStatus, DashboardJob } from "@/lib/dashboard/types";
import { APPLICATION_STATUSES } from "@/lib/dashboard/constants";

type JobsViewProps = {
  title: string;
  subtitle: string;
  jobs: DashboardJob[];
  role: AccessRole;
  mode: "inbox" | "tracker";
};

export function JobsView({ title, subtitle, jobs, role, mode }: JobsViewProps) {
  const [query, setQuery] = useState("");
  const [company, setCompany] = useState("all");
  const [status, setStatus] = useState("all");
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [localJobs, setLocalJobs] = useState(jobs);
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [coverLetterState, setCoverLetterState] = useState<{
    status: "idle" | "loading" | "ready";
    filename: string | null;
    previewText: string | null;
    tex: string | null;
  }>({
    status: "idle",
    filename: null,
    previewText: null,
    tex: null,
  });

  useEffect(() => {
    setLocalJobs(jobs);
  }, [jobs]);

  useEffect(() => {
    setCoverLetterState({
      status: "idle",
      filename: null,
      previewText: null,
      tex: null,
    });
  }, [selectedJobId]);

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
    () => ["all", ...new Set(localJobs.map((job) => job.companyName))],
    [localJobs],
  );

  const visibleJobs = useMemo(() => {
    return localJobs.filter((job) => {
      const matchesQuery =
        !query ||
        `${job.title} ${job.companyName} ${job.location}`.toLowerCase().includes(query.toLowerCase());
      const matchesCompany = company === "all" || job.companyName === company;
      const matchesStatus = status === "all" || job.applicationStatus === status;
      return matchesQuery && matchesCompany && matchesStatus;
    });
  }, [company, localJobs, query, status]);

  const selectedJob = visibleJobs.find((job) => job.id === selectedJobId) ?? null;

  function downloadCoverLetter(filename: string, tex: string) {
    const blob = new Blob([tex], { type: "application/x-tex" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

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

  async function generateCoverLetter(jobId: string) {
    setCoverLetterState({
      status: "loading",
      filename: null,
      previewText: null,
      tex: null,
    });
    setFeedback(null);

    try {
      const response = await fetch("/api/cover-letter/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            filename?: string;
            previewText?: string;
            tex?: string;
          }
        | null;

      if (!response.ok || !payload?.filename || !payload?.tex || !payload?.previewText) {
        throw new Error(payload?.error || "Failed to generate cover letter.");
      }

      setCoverLetterState({
        status: "ready",
        filename: payload.filename,
        previewText: payload.previewText,
        tex: payload.tex,
      });
      setFeedback({
        tone: "success",
        message: `Generated cover letter for ${selectedJob?.title || "selected job"}.`,
      });
      downloadCoverLetter(payload.filename, payload.tex);
    } catch (error) {
      setCoverLetterState({
        status: "idle",
        filename: null,
        previewText: null,
        tex: null,
      });
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to generate cover letter.",
      });
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
                    <button className="title-button" type="button" onClick={() => setSelectedJobId(job.id)}>
                      <strong>{job.title}</strong>
                      <span className="source-label">{job.source}</span>
                    </button>
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
                  <button className="title-button" type="button" onClick={() => setSelectedJobId(job.id)}>
                    <strong>{job.title}</strong>
                    <span className="source-label">{job.source}</span>
                  </button>
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

                <button className="secondary-button mobile-detail-button" type="button" onClick={() => setSelectedJobId(job.id)}>
                  {pendingJobId === job.id ? "Saving..." : "View details"}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {selectedJob ? (
        <div className="drawer-backdrop" onClick={() => setSelectedJobId(null)}>
          <aside className="drawer" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div className="stack">
                <span className="subtle">{selectedJob.companyName}</span>
                <h3>{selectedJob.title}</h3>
                <div className="button-row">
                  <span className="score-pill">{selectedJob.score ?? "N/A"} / 100</span>
                  <span className={`status-pill status-${selectedJob.applicationStatus}`}>{selectedJob.applicationStatus}</span>
                </div>
              </div>
              <button className="drawer-close" type="button" onClick={() => setSelectedJobId(null)}>
                ×
              </button>
            </div>

            <div className="drawer-body">
              <div className="stack">
                <span className="subtle">Location</span>
                <strong>{selectedJob.location}</strong>
              </div>
              <div className="stack">
                <span className="subtle">Rationale</span>
                <div>{selectedJob.rationale || "No rationale recorded."}</div>
              </div>
              <div className="stack">
                <span className="subtle">Keyword hits</span>
                <div className="badge-list">
                  {selectedJob.keywordHits.length ? selectedJob.keywordHits.map((hit) => <span key={hit} className="mini-badge">{hit}</span>) : <span className="subtle">No keyword hits recorded</span>}
                </div>
              </div>
              <div className="stack">
                <span className="subtle">Categories</span>
                <div className="badge-list">
                  {selectedJob.categories.length ? selectedJob.categories.map((category) => <span key={category} className="mini-badge">{category}</span>) : <span className="subtle">No categories</span>}
                </div>
              </div>
              <div className="stack">
                <span className="subtle">Description</span>
                <div className="description">{selectedJob.description}</div>
              </div>
              <div className="button-row">
                <a className="primary-button" href={selectedJob.url} target="_blank" rel="noreferrer">
                  Open source job
                </a>
                {role === "owner" ? (
                  <>
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={coverLetterState.status === "loading"}
                      onClick={() => generateCoverLetter(selectedJob.id)}
                    >
                      {coverLetterState.status === "loading" ? "Generating..." : "Generate cover letter"}
                    </button>
                    {coverLetterState.status === "ready" && coverLetterState.filename && coverLetterState.tex ? (
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => downloadCoverLetter(coverLetterState.filename!, coverLetterState.tex!)}
                      >
                        Download .tex
                      </button>
                    ) : null}
                  </>
                ) : null}
              </div>
              {role === "owner" && coverLetterState.status === "ready" && coverLetterState.previewText ? (
                <div className="stack">
                  <span className="subtle">Cover letter preview</span>
                  <div className="description">{coverLetterState.previewText}</div>
                </div>
              ) : null}
              {role === "owner" && coverLetterState.status === "loading" ? (
                <div className="stack">
                  <span className="subtle">Cover letter</span>
                  <div className="description">Generating draft from your resume, prompt instructions, and this job description.</div>
                </div>
              ) : null}
              {role === "owner" && coverLetterState.status === "ready" && coverLetterState.filename ? (
                <div className="stack">
                  <span className="subtle">Generated file</span>
                  <strong>{coverLetterState.filename}</strong>
                </div>
              ) : null}
              {role === "owner" ? (
                <div className="stack">
                  <span className="subtle">Cover letter workflow</span>
                  <div className="description">This v1 generates a LaTeX file for immediate download. PDF compilation with Tectonic can be added next.</div>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
