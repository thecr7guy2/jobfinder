from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from typing import Any

import requests
import yaml

from scrapers import SCRAPER_TYPES
from scrapers.base import utcnow_iso

ROOT = Path(__file__).resolve().parent
CONFIG_PATH = ROOT / "config" / "companies.yaml"
DATA_DIR = ROOT / "data"
CACHE_DIR = DATA_DIR / "cache"
JOBS_PATH = DATA_DIR / "jobs.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fetch jobs for configured companies.")
    parser.add_argument("--force", action="store_true", help="Ignore cache TTLs and refetch everything.")
    parser.add_argument("--company", help="Fetch only one configured company by id.")
    return parser.parse_args()


def load_companies(company_id: str | None = None) -> list[dict[str, Any]]:
    with CONFIG_PATH.open("r", encoding="utf-8") as handle:
        config = yaml.safe_load(handle) or {}

    companies = config.get("companies", [])
    if company_id is None:
        return companies

    filtered = [company for company in companies if company.get("id") == company_id]
    if not filtered:
        available = ", ".join(sorted(company.get("id", "") for company in companies))
        raise SystemExit(f"Unknown company '{company_id}'. Available companies: {available}")
    return filtered


def load_jobs_store() -> list[dict[str, Any]]:
    if not JOBS_PATH.exists():
        return []

    with JOBS_PATH.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, list):
        raise SystemExit(f"{JOBS_PATH} must contain a top-level JSON array.")
    return data


def write_jobs_store(jobs: list[dict[str, Any]]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with JOBS_PATH.open("w", encoding="utf-8") as handle:
        json.dump(jobs, handle, indent=2, ensure_ascii=True)
        handle.write("\n")


def cache_path_for(company_id: str) -> Path:
    return CACHE_DIR / f"{company_id}.json"


def cache_is_fresh(cache_path: Path, ttl_hours: int) -> bool:
    if not cache_path.exists():
        return False

    with cache_path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)

    fetched_at = payload.get("fetched_at")
    if not fetched_at:
        return False

    fetched_ts = parse_zulu_timestamp(fetched_at)
    age_seconds = (parse_zulu_timestamp(utcnow_iso()) - fetched_ts).total_seconds()
    return age_seconds < ttl_hours * 3600


def load_cached_jobs(cache_path: Path) -> list[dict[str, Any]]:
    with cache_path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    return list(payload.get("raw_jobs", []))


def write_cache(company: dict[str, Any], fetched_at: str, raw_jobs: list[dict[str, Any]]) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path = cache_path_for(str(company["id"]))
    payload = {
        "company_id": company["id"],
        "fetched_at": fetched_at,
        "ttl_hours": int(company.get("ttl_hours", 6)),
        "raw_jobs": raw_jobs,
    }
    with cache_path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=True)
        handle.write("\n")


def parse_zulu_timestamp(value: str):
    from datetime import datetime

    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def fetch_company_jobs(company: dict[str, Any], force: bool, session: requests.Session) -> list[dict[str, Any]]:
    scraper_type = company.get("type")
    scraper_cls = SCRAPER_TYPES.get(scraper_type)
    if scraper_cls is None:
        raise SystemExit(f"Unsupported scraper type '{scraper_type}' for company '{company.get('id')}'.")

    ttl_hours = int(company.get("ttl_hours", 6))
    cache_path = cache_path_for(str(company["id"]))
    scraper = scraper_cls(company, session=session)

    if not force and cache_is_fresh(cache_path, ttl_hours):
        return load_cached_jobs(cache_path)

    fetched_at = utcnow_iso()
    raw_jobs = scraper.fetch_raw_jobs()
    write_cache(company, fetched_at, raw_jobs)
    return raw_jobs


def merge_jobs(
    existing_jobs: list[dict[str, Any]],
    incoming_jobs: list[dict[str, Any]],
    company_id: str,
) -> tuple[list[dict[str, Any]], int, int]:
    existing_same_company = {
        job["id"]: dict(job) for job in existing_jobs if str(job.get("company_id")) == company_id
    }
    other_companies = [job for job in existing_jobs if str(job.get("company_id")) != company_id]
    new_count = 0
    updated_count = 0
    refreshed_company_jobs: list[dict[str, Any]] = []

    for job in incoming_jobs:
        job_id = job["id"]
        if job_id not in existing_same_company:
            refreshed_company_jobs.append(dict(job))
            new_count += 1
            continue

        merged = dict(existing_same_company[job_id])
        merged.update(job)
        merged["first_seen"] = existing_same_company[job_id].get("first_seen", job["first_seen"])
        refreshed_company_jobs.append(merged)
        updated_count += 1

    merged_jobs = sorted(
        [*other_companies, *refreshed_company_jobs],
        key=lambda job: (
            str(job.get("company_id", "")),
            str(job.get("posted_date") or ""),
            str(job.get("title", "")),
            str(job.get("id", "")),
        ),
    )
    return merged_jobs, new_count, updated_count


def main() -> None:
    args = parse_args()
    companies = load_companies(args.company)
    existing_jobs = load_jobs_store()
    session = requests.Session()

    total_new = 0
    total_updated = 0
    merged_jobs = existing_jobs
    failures: list[str] = []

    for company in companies:
        observed_at = utcnow_iso()
        company_id = str(company["id"])

        try:
            raw_jobs = fetch_company_jobs(company, args.force, session)
            scraper_cls = SCRAPER_TYPES[str(company["type"])]
            scraper = scraper_cls(company, session=session)
            normalized_jobs = scraper.normalize_jobs(raw_jobs, observed_at)
            merged_jobs, new_count, updated_count = merge_jobs(
                merged_jobs,
                normalized_jobs,
                company_id,
            )
            total_new += new_count
            total_updated += updated_count
        except Exception as exc:  # pragma: no cover - defensive path exercised via tests
            failures.append(f"{company_id}: {exc}")
            print(f"warning: failed to refresh {company_id}: {exc}", file=sys.stderr)

    write_jobs_store(merged_jobs)
    print(f"{total_new} new | {total_updated} updated | {len(merged_jobs)} total")
    if failures:
        print(f"{len(failures)} source failures", file=sys.stderr)
        for failure in failures:
            print(f" - {failure}", file=sys.stderr)


if __name__ == "__main__":
    main()
