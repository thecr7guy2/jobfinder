export const APPLICATION_STATUSES = [
  "new",
  "reviewing",
  "saved",
  "applied",
  "interview",
  "offer",
  "rejected",
  "skipped",
] as const;

export const SESSION_COOKIE_NAME = "jobfinder_access";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export const PROTECTED_PATHS = ["/inbox", "/tracker", "/dashboard"];
