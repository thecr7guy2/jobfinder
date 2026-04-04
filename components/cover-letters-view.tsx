"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import type { StoredCoverLetter } from "@/lib/dashboard/types";

type CoverLettersViewProps = {
  letters: StoredCoverLetter[];
  selectedJobId?: string | null;
};

function safeId(jobId: string): string {
  return `cover-letter-${jobId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

export function CoverLettersView({ letters, selectedJobId = null }: CoverLettersViewProps) {
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    message: string;
  } | null>(null);
  const selectedLetter = useMemo(
    () => letters.find((letter) => letter.jobId === selectedJobId) ?? null,
    [letters, selectedJobId],
  );

  useEffect(() => {
    if (!selectedJobId) {
      return;
    }

    const target = document.getElementById(safeId(selectedJobId));
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [selectedJobId]);

  async function compilePdf(jobId: string) {
    if (pendingJobId) {
      return;
    }

    setPendingJobId(jobId);
    setFeedback(null);

    try {
      const response = await fetch("/api/cover-letter/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; runUrl?: string }
        | null;

      if (!response.ok || !payload?.runUrl) {
        throw new Error(payload?.error || "Failed to trigger PDF compilation.");
      }

      setFeedback({
        tone: "success",
        message: "Triggered PDF compilation. Refresh this page after the workflow finishes.",
      });
      window.open(payload.runUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Failed to trigger PDF compilation.",
      });
    } finally {
      setPendingJobId(null);
    }
  }

  return (
    <>
      <div className="hero">
        <h2>Cover Letters</h2>
        <p>All generated cover letters live here. Compile PDFs and download them from one place instead of from each job page.</p>
      </div>

      {feedback ? <div className={`inline-feedback inline-feedback-${feedback.tone}`}>{feedback.message}</div> : null}

      {selectedLetter ? (
        <section className="panel cover-letter-spotlight">
          <div className="panel-header">
            <h3>Selected letter</h3>
            <span className="role-chip">From job page</span>
          </div>
          <div className="detail-stack">
            <div className="stack">
              <strong>{selectedLetter.title}</strong>
              <span className="subtle">
                {selectedLetter.companyName} · {selectedLetter.filename}
              </span>
            </div>
            <div className="button-row">
              <Link className="secondary-button" href={`/jobs/${encodeURIComponent(selectedLetter.jobId)}?from=tracker`}>
                View job
              </Link>
              {selectedLetter.pdfReady ? (
                <a className="secondary-button" href={`/api/cover-letter/pdf?jobId=${encodeURIComponent(selectedLetter.jobId)}`}>
                  Download PDF
                </a>
              ) : (
                <button
                  className="secondary-button"
                  type="button"
                  disabled={pendingJobId === selectedLetter.jobId}
                  onClick={() => compilePdf(selectedLetter.jobId)}
                >
                  {pendingJobId === selectedLetter.jobId ? "Triggering..." : "Compile PDF"}
                </button>
              )}
            </div>
            <div className="description">{selectedLetter.previewText}</div>
          </div>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-header">
          <h3>Generated letters</h3>
          <span className="subtle">{letters.length} stored</span>
        </div>

        <div className="table-shell desktop-table">
          <table>
            <thead>
              <tr>
                <th>Role</th>
                <th>Company</th>
                <th>Updated</th>
                <th>PDF</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {letters.map((letter) => (
                <tr
                  key={letter.jobId}
                  id={safeId(letter.jobId)}
                  className={letter.jobId === selectedJobId ? "selected-row" : undefined}
                >
                  <td>
                    <div className="stack">
                      <strong>{letter.title}</strong>
                      <span className="subtle">{letter.filename}</span>
                    </div>
                  </td>
                  <td>{letter.companyName}</td>
                  <td>{new Date(letter.updatedAt).toLocaleDateString()}</td>
                  <td>{letter.pdfReady ? "Ready" : "Not compiled"}</td>
                  <td>
                    <div className="button-row">
                      <Link className="secondary-button" href={`/jobs/${encodeURIComponent(letter.jobId)}?from=tracker`}>
                        View job
                      </Link>
                      {letter.pdfReady ? (
                        <a className="secondary-button" href={`/api/cover-letter/pdf?jobId=${encodeURIComponent(letter.jobId)}`}>
                          Download PDF
                        </a>
                      ) : (
                        <button
                          className="secondary-button"
                          type="button"
                          disabled={pendingJobId === letter.jobId}
                          onClick={() => compilePdf(letter.jobId)}
                        >
                          {pendingJobId === letter.jobId ? "Triggering..." : "Compile PDF"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mobile-jobs" aria-label="Mobile cover letters list">
          {letters.map((letter) => (
            <article
              className={`mobile-job-card${letter.jobId === selectedJobId ? " selected-card" : ""}`}
              key={letter.jobId}
              id={safeId(letter.jobId)}
            >
              <div className="mobile-job-top">
                <div className="mobile-job-heading">
                  <strong>{letter.title}</strong>
                  <div className="mobile-job-company">{letter.companyName}</div>
                </div>
                <span className="status-pill status-new">{letter.pdfReady ? "pdf ready" : "stored"}</span>
              </div>

              <div className="mobile-meta-grid">
                <div className="mobile-meta-item">
                  <span className="subtle">Updated</span>
                  <strong>{new Date(letter.updatedAt).toLocaleDateString()}</strong>
                </div>
                <div className="mobile-meta-item">
                  <span className="subtle">File</span>
                  <strong>{letter.filename}</strong>
                </div>
              </div>

              <div className="mobile-job-actions">
                <Link className="secondary-button mobile-detail-button" href={`/jobs/${encodeURIComponent(letter.jobId)}?from=tracker`}>
                  View job
                </Link>
                {letter.pdfReady ? (
                  <a className="secondary-button mobile-detail-button" href={`/api/cover-letter/pdf?jobId=${encodeURIComponent(letter.jobId)}`}>
                    Download PDF
                  </a>
                ) : (
                  <button
                    className="secondary-button mobile-detail-button"
                    type="button"
                    disabled={pendingJobId === letter.jobId}
                    onClick={() => compilePdf(letter.jobId)}
                  >
                    {pendingJobId === letter.jobId ? "Triggering..." : "Compile PDF"}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
