from __future__ import annotations

import argparse
import json
from pathlib import Path
import time
from typing import Any

import requests
import yaml

from match_jobs import ROOT, load_dotenv
from scrapers.base import clean_text, utcnow_iso

CONFIG_PATH = ROOT / "config" / "matching.yaml"
COMPANIES_PATH = ROOT / "config" / "companies.yaml"
ENV_PATH = ROOT / ".env"
DATA_DIR = ROOT / "data"
JOBS_PATH = DATA_DIR / "jobs.json"
SOURCE_HEALTH_PATH = DATA_DIR / "source_health.json"
SEND_DELAY_SECONDS = 0.05


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Send Telegram alerts for newly qualified jobs.")
    parser.add_argument("--dry-run", action="store_true", help="Print what would be sent without writes.")
    parser.add_argument("--company", help="Only send job alerts for one company id.")
    parser.add_argument("--failures-only", action="store_true", help="Only evaluate source failure warnings.")
    parser.add_argument("--resend", action="store_true", help="Re-send jobs even if they are already alerted.")
    return parser.parse_args()


def load_jobs_store() -> list[dict[str, Any]]:
    if not JOBS_PATH.exists():
        return []

    with JOBS_PATH.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, list):
        raise SystemExit(f"{JOBS_PATH} must contain a top-level JSON array.")
    return payload


def write_jobs_store(jobs: list[dict[str, Any]]) -> None:
    with JOBS_PATH.open("w", encoding="utf-8") as handle:
        json.dump(jobs, handle, indent=2, ensure_ascii=True)
        handle.write("\n")


def load_matching_config() -> dict[str, Any]:
    with CONFIG_PATH.open("r", encoding="utf-8") as handle:
        payload = yaml.safe_load(handle) or {}

    matching = payload.get("matching")
    if not isinstance(matching, dict):
        raise SystemExit(f"{CONFIG_PATH} must contain a top-level 'matching' mapping.")
    return matching


def load_company_ids() -> list[str]:
    with COMPANIES_PATH.open("r", encoding="utf-8") as handle:
        payload = yaml.safe_load(handle) or {}
    companies = payload.get("companies", [])
    return [str(company.get("id")) for company in companies if company.get("id")]


def load_source_health() -> dict[str, dict[str, Any]] | None:
    if not SOURCE_HEALTH_PATH.exists():
        return None

    with SOURCE_HEALTH_PATH.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict):
        raise SystemExit(f"{SOURCE_HEALTH_PATH} must contain a top-level JSON object.")
    return {str(key): dict(value) for key, value in payload.items()}


def write_source_health(source_health: dict[str, dict[str, Any]]) -> None:
    with SOURCE_HEALTH_PATH.open("w", encoding="utf-8") as handle:
        json.dump(source_health, handle, indent=2, ensure_ascii=True)
        handle.write("\n")


def threshold_for_job(job: dict[str, Any], default_threshold: int) -> int:
    match = job.get("match")
    if isinstance(match, dict) and match.get("llm_score_threshold") is not None:
        return int(match["llm_score_threshold"])
    return default_threshold


def select_alertable_jobs(
    jobs: list[dict[str, Any]],
    default_threshold: int,
    company_id: str | None = None,
    resend: bool = False,
) -> tuple[list[dict[str, Any]], int]:
    selected: list[dict[str, Any]] = []
    skipped_alerted = 0

    for job in jobs:
        if company_id and str(job.get("company_id")) != company_id:
            continue

        match = job.get("match")
        if not isinstance(match, dict):
            continue
        if match.get("status") != "scored":
            continue

        llm_score = match.get("llm_score")
        if not isinstance(llm_score, int):
            continue
        if llm_score < threshold_for_job(job, default_threshold):
            continue

        if not resend and bool(job.get("alerted")):
            skipped_alerted += 1
            continue

        selected.append(job)

    selected.sort(key=lambda job: int(job["match"]["llm_score"]), reverse=True)
    return selected, skipped_alerted


def escape_markdown(value: str | None) -> str:
    if not value:
        return ""

    escaped = str(value)
    for token in ("\\", "_", "*", "[", "]", "`"):
        escaped = escaped.replace(token, f"\\{token}")
    return escaped


def truncate_rationale(value: str, limit: int = 150) -> str:
    text = clean_text(value)
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def format_job_alert(job: dict[str, Any]) -> str:
    match = dict(job["match"])
    score = int(match["llm_score"])
    title = escape_markdown(str(job.get("title") or "Unknown title"))
    company = escape_markdown(str(job.get("company_name") or str(job.get("company_id") or "Unknown company")))
    location = escape_markdown(str(job.get("location") or "Unknown location"))
    rationale = escape_markdown(truncate_rationale(str(match.get("llm_rationale") or "")))
    url = str(job.get("url") or "")

    return (
        f"*[{score}/100] {title} - {company}*\n"
        f"📍 {location}\n"
        f"💬 _{rationale}_\n\n"
        f"🔗 [View job]({url})"
    )


def format_failure_alert(company_name: str, observed_count: int, timestamp: str) -> str:
    return (
        f"⚠️ *Source warning: {escape_markdown(company_name)}*\n"
        f"No jobs returned for 2 consecutive runs.\n"
        f"Observed count: {observed_count}\n"
        f"Timestamp: {escape_markdown(timestamp)}"
    )


def telegram_send_message(
    session: requests.Session,
    bot_token: str,
    chat_id: str,
    text: str,
) -> int:
    response = session.post(
        f"https://api.telegram.org/bot{bot_token}/sendMessage",
        data={
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "Markdown",
            "disable_web_page_preview": "true",
        },
        timeout=30,
    )
    response.raise_for_status()
    payload = response.json()
    if not payload.get("ok"):
        raise RuntimeError(f"Telegram API returned ok={payload.get('ok')}: {payload}")

    result = payload.get("result")
    if not isinstance(result, dict) or result.get("message_id") is None:
        raise RuntimeError("Telegram API response did not include message_id.")
    return int(result["message_id"])


def apply_job_alert_metadata(job: dict[str, Any], message_id: int) -> None:
    job["alerted"] = True
    job["alerted_at"] = utcnow_iso()
    job["alert_score"] = int(job["match"]["llm_score"])
    job["alert_message_id"] = message_id


def compute_current_job_counts(jobs: list[dict[str, Any]], company_ids: list[str]) -> dict[str, int]:
    counts = {company_id: 0 for company_id in company_ids}
    for job in jobs:
        company_id = str(job.get("company_id") or "")
        if company_id in counts:
            counts[company_id] += 1
    return counts


def update_source_health(
    existing_state: dict[str, dict[str, Any]],
    current_counts: dict[str, int],
    timestamp: str,
) -> tuple[dict[str, dict[str, Any]], list[str]]:
    updated: dict[str, dict[str, Any]] = {}
    warnings: list[str] = []

    for company_id, count in current_counts.items():
        previous = dict(existing_state.get(company_id, {}))
        consecutive_zero = int(previous.get("consecutive_zero_job_runs", 0))
        failure_alerted = bool(previous.get("failure_alerted", False))
        failure_alerted_at = previous.get("failure_alerted_at")

        if count > 0:
            updated[company_id] = {
                "last_seen_job_count": count,
                "consecutive_zero_job_runs": 0,
                "failure_alerted": False,
                "failure_alerted_at": None,
                "updated_at": timestamp,
            }
            continue

        consecutive_zero += 1
        if consecutive_zero >= 2 and not failure_alerted:
            warnings.append(company_id)
            failure_alerted = True
            failure_alerted_at = timestamp

        updated[company_id] = {
            "last_seen_job_count": count,
            "consecutive_zero_job_runs": consecutive_zero,
            "failure_alerted": failure_alerted,
            "failure_alerted_at": failure_alerted_at,
            "updated_at": timestamp,
        }

    return updated, warnings


def summarize(
    sent_jobs: int,
    skipped_alerted: int,
    failed_jobs: int,
    source_warnings: int,
) -> str:
    return (
        f"{sent_jobs} sent | {skipped_alerted} skipped_alerted | "
        f"{failed_jobs} failed_to_send | {source_warnings} source_warnings"
    )


def main() -> None:
    args = parse_args()
    load_dotenv(ENV_PATH)

    bot_token = None if args.dry_run else _required_env("TELEGRAM_BOT_TOKEN")
    chat_id = None if args.dry_run else _required_env("TELEGRAM_CHAT_ID")
    default_threshold = int(load_matching_config().get("llm_score_threshold", 70))
    jobs = load_jobs_store()

    sent_jobs = 0
    failed_jobs = 0
    source_warnings_sent = 0
    session = requests.Session()

    if not args.failures_only:
        alertable_jobs, skipped_alerted = select_alertable_jobs(
            jobs,
            default_threshold=default_threshold,
            company_id=args.company,
            resend=args.resend,
        )
        for job in alertable_jobs:
            text = format_job_alert(job)
            if args.dry_run:
                print(f"DRY RUN job alert: {job['id']}\n{text}\n")
                sent_jobs += 1
                continue

            try:
                message_id = telegram_send_message(session, str(bot_token), str(chat_id), text)
            except Exception as exc:
                failed_jobs += 1
                print(f"FAILED job alert {job['id']}: {exc}")
                continue

            apply_job_alert_metadata(job, message_id)
            sent_jobs += 1
            time.sleep(SEND_DELAY_SECONDS)

        if not args.dry_run:
            write_jobs_store(jobs)
    else:
        skipped_alerted = 0

    timestamp = utcnow_iso()
    source_health = load_source_health()
    if source_health is None:
        if args.dry_run:
            print("DRY RUN source health: would initialize data/source_health.json and skip failure warnings on first run")
        else:
            initial_state = {
                company_id: {
                    "last_seen_job_count": count,
                    "consecutive_zero_job_runs": 0,
                    "failure_alerted": False,
                    "failure_alerted_at": None,
                    "updated_at": timestamp,
                }
                for company_id, count in compute_current_job_counts(jobs, load_company_ids()).items()
            }
            write_source_health(initial_state)
        print(summarize(sent_jobs, skipped_alerted, failed_jobs, source_warnings_sent))
        return

    current_counts = compute_current_job_counts(jobs, load_company_ids())
    next_source_health, warning_company_ids = update_source_health(source_health, current_counts, timestamp)

    if args.dry_run:
        for company_id in warning_company_ids:
            print(f"DRY RUN failure alert: {company_id}\n{format_failure_alert(company_id, current_counts[company_id], timestamp)}\n")
        print(summarize(sent_jobs, skipped_alerted, failed_jobs, len(warning_company_ids)))
        return

    company_names = {
        str(job.get("company_id")): str(job.get("company_name"))
        for job in jobs
        if job.get("company_id") and job.get("company_name")
    }
    for company_id in load_company_ids():
        company_names.setdefault(company_id, company_id)

    for company_id in warning_company_ids:
        try:
            telegram_send_message(
                session,
                str(bot_token),
                str(chat_id),
                format_failure_alert(company_names.get(company_id, company_id), current_counts[company_id], timestamp),
            )
        except Exception as exc:
            failed_jobs += 1
            print(f"FAILED source warning {company_id}: {exc}")
            next_source_health[company_id]["failure_alerted"] = False
            next_source_health[company_id]["failure_alerted_at"] = None
            continue
        source_warnings_sent += 1
        time.sleep(SEND_DELAY_SECONDS)

    write_source_health(next_source_health)
    print(summarize(sent_jobs, skipped_alerted, failed_jobs, source_warnings_sent))


def _required_env(name: str) -> str:
    import os

    value = os.getenv(name)
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


if __name__ == "__main__":
    main()
