"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { AccessRole, ApplicationStatus, DashboardJob } from "@/lib/dashboard/types";
import { APPLICATION_STATUSES } from "@/lib/dashboard/constants";

type JobDetailViewProps = {
  job: DashboardJob;
  role: AccessRole;
  backHref: string;
  backLabel: string;
};

export function JobDetailView({ job, role, backHref, backLabel }: JobDetailViewProps) {
  const [localJob, setLocalJob] = useState(job);
  const [pendingStatus, setPendingStatus] = useState(false);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const [coverLetterState, setCoverLetterState] = useState<{
    status: "idle" | "loading" | "ready";
    filename: string | null;
    savedPath: string | null;
    savedMode: "postgres" | "local" | "none" | null;
    previewText: string | null;
  }>({
    status: "idle",
    filename: null,
    savedPath: null,
    savedMode: null,
    previewText: null,
  });
  const [pendingPdf, setPendingPdf] = useState(false);

  useEffect(() => {
    setLocalJob(job);
  }, [job]);

  useEffect(() => {
    if (!feedback) {
      return;
    }

    const timeout = window.setTimeout(() => setFeedback(null), 2400);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  async function updateStatus(nextStatus: ApplicationStatus) {
    if (role !== "owner" || pendingStatus || localJob.applicationStatus === nextStatus) {
      return;
    }

    const previous = localJob;
    setPendingStatus(true);
    setFeedback(null);
    setLocalJob((current) => ({ ...current, applicationStatus: nextStatus }));

    try {
      const response = await fetch("/api/status/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: localJob.id, status: nextStatus }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; record?: { status: ApplicationStatus; updated_at: string; updated_by_role: AccessRole } }
        | null;

      if (!response.ok || !payload?.record) {
        throw new Error(payload?.error || "Failed to save status.");
      }

      setLocalJob((current) => ({
        ...current,
        applicationStatus: payload.record!.status,
        applicationUpdatedAt: payload.record!.updated_at,
        applicationUpdatedByRole: payload.record!.updated_by_role,
      }));
      setFeedback({
        tone: "success",
        message: `Saved ${nextStatus} for ${previous.title}.`,
      });
    } catch (error) {
      setLocalJob(previous);
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to save status.",
      });
    } finally {
      setPendingStatus(false);
    }
  }

  async function generateCoverLetter() {
    if (role !== "owner") {
      return;
    }

    setCoverLetterState({
      status: "loading",
      filename: null,
      savedPath: null,
      savedMode: null,
      previewText: null,
    });
    setFeedback(null);

    try {
      const response = await fetch("/api/cover-letter/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: localJob.id }),
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            filename?: string;
            previewText?: string;
            savedPath?: string | null;
            savedMode?: "postgres" | "local" | "none";
          }
        | null;

      if (!response.ok || !payload?.filename || !payload?.previewText) {
        throw new Error(payload?.error || "Failed to generate cover letter.");
      }

      setCoverLetterState({
        status: "ready",
        filename: payload.filename,
        savedPath: payload.savedPath ?? null,
        savedMode: payload.savedMode ?? null,
        previewText: payload.previewText,
      });
      setFeedback({
        tone: "success",
        message:
          payload.savedMode === "postgres"
            ? `Generated and stored cover letter for ${localJob.title}.`
            : payload.savedPath
              ? `Generated and saved cover letter for ${localJob.title}.`
              : `Generated cover letter for ${localJob.title}.`,
      });
    } catch (error) {
      setCoverLetterState({
        status: "idle",
        filename: null,
        savedPath: null,
        savedMode: null,
        previewText: null,
      });
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to generate cover letter.",
      });
    }
  }

  async function compileCoverLetterPdf() {
    if (role !== "owner" || pendingPdf) {
      return;
    }

    setPendingPdf(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/cover-letter/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: localJob.id }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; runUrl?: string }
        | null;

      if (!response.ok || !payload?.runUrl) {
        throw new Error(payload?.error || "Failed to trigger PDF compilation.");
      }

      setFeedback({
        tone: "success",
        message: "Triggered PDF compilation workflow in GitHub Actions.",
      });
      window.open(payload.runUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to trigger PDF compilation.",
      });
    } finally {
      setPendingPdf(false);
    }
  }

  return (
    <>
      <div className="hero">
        <Link className="back-link" href={backHref}>
          {backLabel}
        </Link>
        <h2>{localJob.title}</h2>
        <p>
          {localJob.companyName} · {localJob.location}
        </p>
      </div>

      {feedback ? <div className={`inline-feedback inline-feedback-${feedback.tone}`}>{feedback.message}</div> : null}

      <div className="job-detail-grid">
        <section className="panel">
          <div className="panel-header">
            <h3>Overview</h3>
          </div>
          <div className="detail-stack">
            <div className="button-row">
              <span className="score-pill">{localJob.score ?? "N/A"} / 100</span>
              <span className={`status-pill status-${localJob.applicationStatus}`}>{localJob.applicationStatus}</span>
              <span className="source-label">{localJob.source}</span>
            </div>
            <div className="detail-grid">
              <div className="stack">
                <span className="subtle">Company</span>
                <strong>{localJob.companyName}</strong>
              </div>
              <div className="stack">
                <span className="subtle">Location</span>
                <strong>{localJob.location}</strong>
              </div>
              <div className="stack">
                <span className="subtle">Alerted</span>
                <strong>{localJob.alerted ? "Yes" : "No"}</strong>
              </div>
              <div className="stack">
                <span className="subtle">Updated</span>
                <strong>
                  {pendingStatus
                    ? "Saving..."
                    : localJob.applicationUpdatedAt
                      ? new Date(localJob.applicationUpdatedAt).toLocaleDateString()
                      : "Not updated"}
                </strong>
              </div>
            </div>
            {role === "owner" ? (
              <div className="stack">
                <span className="subtle">Status</span>
                <select
                  className="status-select detail-status-select"
                  value={localJob.applicationStatus}
                  disabled={pendingStatus}
                  onChange={(event) => updateStatus(event.target.value as ApplicationStatus)}
                >
                  {APPLICATION_STATUSES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="button-row">
              <a className="primary-button" href={localJob.url} target="_blank" rel="noreferrer">
                View job
              </a>
              {role === "owner" ? (
                <button
                  className="secondary-button"
                  type="button"
                  disabled={coverLetterState.status === "loading"}
                  onClick={generateCoverLetter}
                >
                  {coverLetterState.status === "loading" ? "Generating..." : "Generate cover letter"}
                </button>
              ) : null}
              {role === "owner" && coverLetterState.status === "ready" ? (
                <button
                  className="secondary-button"
                  type="button"
                  disabled={pendingPdf}
                  onClick={compileCoverLetterPdf}
                >
                  {pendingPdf ? "Triggering PDF..." : "Compile PDF"}
                </button>
              ) : null}
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h3>Match details</h3>
          </div>
          <div className="detail-stack">
            <div className="stack">
              <span className="subtle">Rationale</span>
              <div>{localJob.rationale || "No rationale recorded."}</div>
            </div>
            <div className="stack">
              <span className="subtle">Keyword hits</span>
              <div className="badge-list">
                {localJob.keywordHits.length
                  ? localJob.keywordHits.map((hit) => (
                      <span key={hit} className="mini-badge">
                        {hit}
                      </span>
                    ))
                  : <span className="subtle">No keyword hits recorded</span>}
              </div>
            </div>
            <div className="stack">
              <span className="subtle">Categories</span>
              <div className="badge-list">
                {localJob.categories.length
                  ? localJob.categories.map((category) => (
                      <span key={category} className="mini-badge">
                        {category}
                      </span>
                    ))
                  : <span className="subtle">No categories</span>}
              </div>
            </div>
            {role === "owner" && coverLetterState.status === "ready" && coverLetterState.filename ? (
              <div className="stack">
                <span className="subtle">
                  {coverLetterState.savedMode === "postgres"
                    ? "Stored record"
                    : coverLetterState.savedPath
                      ? "Saved file"
                      : "Generated file"}
                </span>
                <strong>{coverLetterState.filename}</strong>
                {coverLetterState.savedMode === "postgres" ? (
                  <span className="subtle">Stored in Postgres</span>
                ) : coverLetterState.savedPath ? (
                  <span className="subtle">{coverLetterState.savedPath}</span>
                ) : null}
              </div>
            ) : null}
          </div>
        </section>
      </div>

      {role === "owner" && coverLetterState.status === "loading" ? (
        <section className="panel">
          <div className="panel-header">
            <h3>Cover letter</h3>
          </div>
          <div className="description">Generating draft from your resume, prompt instructions, and this job description.</div>
        </section>
      ) : null}

      {role === "owner" && coverLetterState.status === "ready" && coverLetterState.previewText ? (
        <section className="panel">
          <div className="panel-header">
            <h3>Cover letter preview</h3>
          </div>
          <div className="description">{coverLetterState.previewText}</div>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-header">
          <h3>Description</h3>
        </div>
        <div className="description">{localJob.description}</div>
      </section>
    </>
  );
}
