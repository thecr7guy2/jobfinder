export type AccessRole = "viewer" | "owner";

export type ApplicationStatus =
  | "new"
  | "reviewing"
  | "saved"
  | "applied"
  | "interview"
  | "offer"
  | "rejected"
  | "skipped";

export type MatchRecord = {
  status: string;
  llm_score: number | null;
  llm_rationale: string | null;
  llm_score_threshold: number | null;
  keyword_hits: string[];
  title_hits: string[];
  location_match: string | null;
  scored_at: string | null;
};

export type JobRecord = {
  id: string;
  company_id: string;
  company_name: string;
  title: string;
  url: string;
  location: string | null;
  categories: string[];
  description: string;
  posted_date: string | null;
  first_seen: string | null;
  last_seen: string | null;
  source: string;
  alerted?: boolean;
  alerted_at?: string | null;
  alert_score?: number | null;
  alert_message_id?: number | null;
  match?: MatchRecord;
};

export type ApplicationRecord = {
  job_id: string;
  status: ApplicationStatus;
  updated_at: string;
  updated_by_role: AccessRole;
};

export type ApplicationsFile = Record<string, ApplicationRecord>;

export type DashboardJob = {
  id: string;
  companyId: string;
  companyName: string;
  title: string;
  location: string;
  url: string;
  categories: string[];
  description: string;
  postedDate: string | null;
  firstSeen: string | null;
  lastSeen: string | null;
  source: string;
  alerted: boolean;
  alertedAt: string | null;
  alertScore: number | null;
  matchStatus: string | null;
  score: number | null;
  rationale: string | null;
  keywordHits: string[];
  titleHits: string[];
  locationMatch: string | null;
  applicationStatus: ApplicationStatus;
  applicationUpdatedAt: string | null;
  applicationUpdatedByRole: AccessRole | null;
};

export type DashboardMetrics = {
  totalJobs: number;
  scoredJobs: number;
  inboxJobs: number;
  alertedJobs: number;
  statusCounts: Array<{ status: ApplicationStatus; count: number }>;
  companyCounts: Array<{ companyName: string; count: number }>;
  scoreBuckets: Array<{ label: string; count: number }>;
};

export type DashboardViewModel = {
  inboxJobs: DashboardJob[];
  newJobs: DashboardJob[];
  trackerJobs: DashboardJob[];
  metrics: DashboardMetrics;
};

export type StoredCoverLetter = {
  jobId: string;
  title: string;
  companyName: string;
  filename: string;
  previewText: string;
  updatedAt: string;
  pdfReady: boolean;
  pdfUpdatedAt: string | null;
};
