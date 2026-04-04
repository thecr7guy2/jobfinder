"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

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
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setLocalJobs(jobs);
  }, [jobs]);

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

  async function updateStatus(jobId: string, nextStatus: ApplicationStatus) {
    if (role !== "owner") {
      return;
    }

    startTransition(() => {
      void (async () => {
        const response = await fetch("/api/status/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId, status: nextStatus }),
        });
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { record: { status: ApplicationStatus; updated_at: string; updated_by_role: AccessRole } };
        setLocalJobs((currentJobs) =>
          currentJobs.map((job) =>
            job.id === jobId
              ? {
                  ...job,
                  applicationStatus: payload.record.status,
                  applicationUpdatedAt: payload.record.updated_at,
                  applicationUpdatedByRole: payload.record.updated_by_role,
                }
              : job,
          ),
        );
      })();
    });
  }

  return (
    <>
      <div className="hero">
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>

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

        <div className="table-shell">
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
                      <span className="subtle">{job.id}</span>
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
                        disabled={isPending}
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
                  <td>{job.applicationUpdatedAt ? new Date(job.applicationUpdatedAt).toLocaleDateString() : "Not updated"}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
              </div>
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
