import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  AccessRole,
  ApplicationRecord,
  ApplicationsFile,
  ApplicationStatus,
  DashboardJob,
  DashboardMetrics,
  StoredCoverLetter,
  DashboardViewModel,
  JobRecord,
} from "@/lib/dashboard/types";
import { APPLICATION_STATUSES } from "@/lib/dashboard/constants";
import {
  hasPostgresConfigured,
  readAllCoverLetterRecords,
  readApplicationsFromPostgres,
  upsertApplicationRecord,
} from "@/lib/dashboard/postgres";

const ROOT_DIR = process.cwd();
const JOBS_PATH = path.join(ROOT_DIR, "data", "jobs.json");
const APPLICATIONS_PATH = path.join(ROOT_DIR, "data", "applications.json");

function utcnowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

export async function readJobs(): Promise<JobRecord[]> {
  return readJsonFile<JobRecord[]>(JOBS_PATH, []);
}

export async function readApplications(): Promise<ApplicationsFile> {
  if (hasPostgresConfigured()) {
    return readApplicationsFromPostgres();
  }
  return readJsonFile<ApplicationsFile>(APPLICATIONS_PATH, {});
}

function effectiveStatus(jobId: string, applications: ApplicationsFile): ApplicationRecord | null {
  return applications[jobId] ?? null;
}

function defaultApplicationStatus(job: JobRecord): ApplicationStatus {
  const matchStatus = job.match?.status ?? null;
  const score = job.match?.llm_score ?? null;
  const threshold = job.match?.llm_score_threshold ?? 70;

  if (matchStatus === "scored" && score !== null && score >= threshold) {
    return "new";
  }

  return "skipped";
}

function mapDashboardJob(job: JobRecord, applications: ApplicationsFile): DashboardJob {
  const application = effectiveStatus(job.id, applications);
  return {
    id: job.id,
    companyId: job.company_id,
    companyName: job.company_name,
    title: job.title,
    location: job.location || "Unknown",
    url: job.url,
    categories: Array.isArray(job.categories) ? job.categories : [],
    description: job.description || "",
    postedDate: job.posted_date || null,
    firstSeen: job.first_seen || null,
    lastSeen: job.last_seen || null,
    source: job.source,
    alerted: Boolean(job.alerted),
    alertedAt: job.alerted_at ?? null,
    alertScore: job.alert_score ?? null,
    matchStatus: job.match?.status ?? null,
    score: job.match?.llm_score ?? null,
    rationale: job.match?.llm_rationale ?? null,
    keywordHits: job.match?.keyword_hits ?? [],
    titleHits: job.match?.title_hits ?? [],
    locationMatch: job.match?.location_match ?? null,
    applicationStatus: application?.status ?? defaultApplicationStatus(job),
    applicationUpdatedAt: application?.updated_at ?? null,
    applicationUpdatedByRole: application?.updated_by_role ?? null,
  };
}

function sortByScoreAndRecency(jobs: DashboardJob[]): DashboardJob[] {
  return [...jobs].sort((left, right) => {
    const scoreDelta = (right.score ?? -1) - (left.score ?? -1);
    if (scoreDelta !== 0) {
      return scoreDelta;
    }
    return String(right.lastSeen ?? "").localeCompare(String(left.lastSeen ?? ""));
  });
}

function sortByRecencyAndScore(jobs: DashboardJob[]): DashboardJob[] {
  return [...jobs].sort((left, right) => {
    const recencyDelta = String(right.firstSeen ?? "").localeCompare(String(left.firstSeen ?? ""));
    if (recencyDelta !== 0) {
      return recencyDelta;
    }
    return (right.score ?? -1) - (left.score ?? -1);
  });
}

function buildMetrics(jobs: DashboardJob[], inboxJobs: DashboardJob[]): DashboardMetrics {
  const statusCounts = APPLICATION_STATUSES.map((status) => ({
    status,
    count: jobs.filter((job) => job.applicationStatus === status).length,
  }));

  const companyMap = new Map<string, number>();
  for (const job of jobs) {
    companyMap.set(job.companyName, (companyMap.get(job.companyName) ?? 0) + 1);
  }

  const companyCounts = [...companyMap.entries()]
    .map(([companyName, count]) => ({ companyName, count }))
    .sort((left, right) => right.count - left.count);

  const scoreBuckets = [
    { label: "80+", count: jobs.filter((job) => (job.score ?? 0) >= 80).length },
    { label: "70-79", count: jobs.filter((job) => (job.score ?? 0) >= 70 && (job.score ?? 0) < 80).length },
    { label: "60-69", count: jobs.filter((job) => (job.score ?? 0) >= 60 && (job.score ?? 0) < 70).length },
    { label: "<60", count: jobs.filter((job) => job.score !== null && (job.score ?? 0) < 60).length },
  ];

  return {
    totalJobs: jobs.length,
    scoredJobs: jobs.filter((job) => job.matchStatus === "scored").length,
    inboxJobs: inboxJobs.length,
    alertedJobs: jobs.filter((job) => job.alerted).length,
    statusCounts,
    companyCounts,
    scoreBuckets,
  };
}

export function deriveDashboardViewModel(
  jobs: JobRecord[],
  applications: ApplicationsFile,
): DashboardViewModel {
  const dashboardJobs = jobs.map((job) => mapDashboardJob(job, applications));
  const inboxJobs = sortByScoreAndRecency(
    dashboardJobs.filter(
      (job) =>
        job.matchStatus === "scored" &&
        (job.score ?? 0) >= 70 &&
        !(job.id in applications),
    ),
  );
  const newJobs = sortByRecencyAndScore(
    dashboardJobs.filter(
      (job) =>
        !(job.id in applications) &&
        Boolean(job.firstSeen) &&
        job.firstSeen === job.lastSeen,
    ),
  );
  const trackerJobs = sortByScoreAndRecency(dashboardJobs);

  return {
    inboxJobs,
    newJobs,
    trackerJobs,
    metrics: buildMetrics(dashboardJobs, inboxJobs),
  };
}

export async function getDashboardViewModel(): Promise<DashboardViewModel> {
  const [jobs, applications] = await Promise.all([readJobs(), readApplications()]);
  return deriveDashboardViewModel(jobs, applications);
}

export async function getDashboardJobById(jobId: string): Promise<DashboardJob | null> {
  const viewModel = await getDashboardViewModel();
  return viewModel.trackerJobs.find((job) => job.id === jobId) ?? null;
}

export async function getStoredCoverLetters(): Promise<StoredCoverLetter[]> {
  if (!hasPostgresConfigured()) {
    return [];
  }

  const [jobs, letters] = await Promise.all([readJobs(), readAllCoverLetterRecords()]);
  const jobMap = new Map(jobs.map((job) => [job.id, job]));

  return letters
    .map((letter) => {
      const job = jobMap.get(letter.job_id);
      if (!job) {
        return null;
      }

      return {
        jobId: letter.job_id,
        title: job.title,
        companyName: job.company_name,
        filename: letter.filename,
        previewText: letter.preview_text,
        updatedAt: letter.updated_at,
        pdfReady: Boolean(letter.pdf_filename && letter.pdf_data),
        pdfUpdatedAt: letter.pdf_updated_at,
        compileStatus: letter.compile_status,
        compileError: letter.compile_error,
      } satisfies StoredCoverLetter;
    })
    .filter((letter): letter is StoredCoverLetter => Boolean(letter));
}

export function assertValidStatus(status: string): asserts status is ApplicationStatus {
  if (!APPLICATION_STATUSES.includes(status as ApplicationStatus)) {
    throw new Error(`Invalid application status: ${status}`);
  }
}

async function persistApplications(applications: ApplicationsFile): Promise<void> {
  const serialized = JSON.stringify(applications, null, 2) + "\n";

  await fs.writeFile(APPLICATIONS_PATH, serialized, "utf-8");
}

export async function updateApplicationStatus(params: {
  jobId: string;
  status: ApplicationStatus;
  role: AccessRole;
}): Promise<ApplicationRecord> {
  const jobs = await readJobs();
  const jobExists = jobs.some((job) => job.id === params.jobId);
  if (!jobExists) {
    throw new Error(`Unknown job id: ${params.jobId}`);
  }

  const record: ApplicationRecord = {
    job_id: params.jobId,
    status: params.status,
    updated_at: utcnowIso(),
    updated_by_role: params.role,
  };

  if (hasPostgresConfigured()) {
    return upsertApplicationRecord(record);
  }

  const applications = await readApplications();
  applications[params.jobId] = record;
  await persistApplications(applications);
  return record;
}
