import type { DashboardMetrics } from "@/lib/dashboard/types";

type DashboardOverviewProps = {
  metrics: DashboardMetrics;
};

export function DashboardOverview({ metrics }: DashboardOverviewProps) {
  const maxCompanyCount = Math.max(...metrics.companyCounts.map((item) => item.count), 1);
  const maxStatusCount = Math.max(...metrics.statusCounts.map((item) => item.count), 1);
  const maxScoreBucket = Math.max(...metrics.scoreBuckets.map((item) => item.count), 1);

  return (
    <>
      <div className="hero">
        <h2>Decision cockpit</h2>
        <p>
          Keep a live view of your strongest matches, application momentum, and source activity. This layer stays
          grounded in the repo data you already trust.
        </p>
      </div>

      <div className="stats-grid">
        <article className="stat-card">
          <span>Total jobs</span>
          <strong>{metrics.totalJobs}</strong>
        </article>
        <article className="stat-card">
          <span>Scored jobs</span>
          <strong>{metrics.scoredJobs}</strong>
        </article>
        <article className="stat-card">
          <span>Inbox jobs</span>
          <strong>{metrics.inboxJobs}</strong>
        </article>
        <article className="stat-card">
          <span>Alerted jobs</span>
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
