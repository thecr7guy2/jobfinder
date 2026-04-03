from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from scrapers.base import BaseScraper, html_to_text, iso_date, split_categories


class ICIMSScraper(BaseScraper):
    source = "icims_api"

    def fetch_raw_jobs(self) -> list[dict[str, Any]]:
        api_url = str(self.company["api_url"])
        filters = dict(self.company.get("filters", {}))

        params: dict[str, Any] = {"internal": "false", "limit": 100, "page": 1}
        for key, value in filters.items():
            if value is None or value == "":
                continue
            if isinstance(value, list):
                params[key] = "|".join(str(item).strip() for item in value if str(item).strip())
            else:
                params[key] = value

        jobs: list[dict[str, Any]] = []
        total_count: int | None = None

        while True:
            response = self.request_json(api_url, params=params)
            page_jobs = response.get("jobs", [])
            if total_count is None:
                total_count = int(response.get("count") or len(page_jobs))
            if not page_jobs:
                break

            jobs.extend(page_jobs)
            if len(jobs) >= total_count:
                break

            params["page"] += 1

        allowed_categories = set(split_categories(filters.get("categories")))
        if not allowed_categories:
            return jobs

        return [job for job in jobs if allowed_categories.intersection(self._categories_for(job))]

    def normalize_job(self, raw_job: Mapping[str, Any], fetched_at: str) -> dict[str, Any]:
        data = dict(raw_job.get("data", {}))
        slug = str(data.get("slug") or data.get("req_id") or "")
        req_id = str(data.get("req_id") or slug)
        url_template = self.company.get("job_url_template", "")
        job_url = data.get("canonical_url") or str(url_template).format(slug=slug)

        return {
            "id": f"{self.company_id}::{req_id}",
            "company_id": self.company_id,
            "company_name": self.company_name,
            "title": str(data.get("title") or "").strip(),
            "url": job_url,
            "location": str(data.get("short_location") or data.get("full_location") or "").strip(),
            "categories": self._categories_for(raw_job),
            "description": html_to_text(data.get("description")),
            "posted_date": iso_date(data.get("posted_date")),
            "first_seen": fetched_at,
            "last_seen": fetched_at,
            "source": self.source,
        }

    def _categories_for(self, raw_job: Mapping[str, Any]) -> list[str]:
        data = dict(raw_job.get("data", {}))
        return split_categories(data.get("category"))
