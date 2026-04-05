import type { DashboardMetrics } from "@/lib/dashboard/types";

type DashboardOverviewProps = {
  metrics: DashboardMetrics;
};

export function DashboardOverview({ metrics }: DashboardOverviewProps) {
  const maxCompanyCount = Math.max(...metrics.companyCounts.map((item) => item.count), 1);
  const maxStatusCount = Math.max(...metrics.statusCounts.map((item) => item.count), 1);
  const maxScoreBucket = Math.max(...metrics.scoreBuckets.map((item) => item.count), 1);
  const reviewedJobs = metrics.statusCounts
    .filter((item) => item.status !== "new")
    .reduce((total, item) => total + item.count, 0);
  const activePipeline =
    metrics.statusCounts.find((item) =>
      item.status === "reviewing" || item.status === "applied" || item.status === "interview",
    )?.count ?? 0;

  return (
    <>
      <div className="hero">
        <span className="hero-kicker">Operations view</span>
        <h2>Decision cockpit</h2>
        <p>
          Keep a live view of your strongest matches, application momentum, and source activity. This layer stays
          grounded in the repo data you already trust.
        </p>
        <div className="hero-callouts">
          <span className="hero-callout">Reviewed: {reviewedJobs}</span>
          <span className="hero-callout">Active pipeline: {activePipeline}</span>
        </div>
      </div>

      <div className="stats-grid">
        <article className="stat-card">
          <span>Opportunity base</span>
          <strong>{metrics.totalJobs}</strong>
        </article>
        <article className="stat-card">
          <span>Scored roles</span>
          <strong>{metrics.scoredJobs}</strong>
        </article>
        <article className="stat-card">
          <span>Inbox pressure</span>
          <strong>{metrics.inboxJobs}</strong>
        </article>
        <article className="stat-card">
          <span>Telegram alerts</span>
          <strong>{metrics.alertedJobs}</strong>
        </article>
      </div>

      <div className="stats-grid">
        <section className="panel">
          <div className="panel-header">
            <h3>Status distribution</h3>
          </div>
          <div className="chart-list">
            {metrics.statusCounts.map((item) => (
              <div className="bar-row" key={item.status}>
                <div className="bar-label">
                  <span>{item.status}</span>
                  <strong>{item.count}</strong>
                </div>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${(item.count / maxStatusCount) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h3>Company coverage</h3>
          </div>
          <div className="chart-list">
            {metrics.companyCounts.map((item) => (
              <div className="bar-row" key={item.companyName}>
                <div className="bar-label">
                  <span>{item.companyName}</span>
                  <strong>{item.count}</strong>
                </div>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${(item.count / maxCompanyCount) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="panel-header">
          <h3>Score spread</h3>
        </div>
        <div className="chart-list">
          {metrics.scoreBuckets.map((item) => (
            <div className="bar-row" key={item.label}>
              <div className="bar-label">
                <span>{item.label}</span>
                <strong>{item.count}</strong>
              </div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${(item.count / maxScoreBucket) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
