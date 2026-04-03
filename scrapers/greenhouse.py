from __future__ import annotations

from collections.abc import Mapping
import html
import re
from typing import Any

from scrapers.base import BaseScraper, html_to_text, iso_date, split_categories


class GreenhouseScraper(BaseScraper):
    source = "greenhouse_api"

    def fetch_raw_jobs(self) -> list[dict[str, Any]]:
        api_url = str(self.company["api_url"]).rstrip("/")
        params = {"content": "true"}
        response = self.request_json(f"{api_url}/jobs", params=params)
        jobs = list(response.get("jobs", []))
        return [job for job in jobs if self._matches_filters(job)]

    def normalize_job(self, raw_job: Mapping[str, Any], fetched_at: str) -> dict[str, Any]:
        raw_id = str(raw_job.get("id") or "")
        location = self._location_for(raw_job)
        departments = self._departments_for(raw_job)
        content = html.unescape(str(raw_job.get("content") or ""))

        return {
            "id": f"{self.company_id}::{raw_id}",
            "company_id": self.company_id,
            "company_name": self.company_name,
            "title": str(raw_job.get("title") or "").strip(),
            "url": str(raw_job.get("absolute_url") or "").strip(),
            "location": location,
            "categories": departments,
            "description": html_to_text(content),
            "posted_date": iso_date(str(raw_job.get("first_published") or raw_job.get("updated_at") or "")),
            "first_seen": fetched_at,
            "last_seen": fetched_at,
            "source": self.source,
        }

    def _matches_filters(self, raw_job: Mapping[str, Any]) -> bool:
        filters = dict(self.company.get("filters", {}))
        allowed_locations = self._normalized_values(filters.get("location") or filters.get("offices"))
        allowed_teams = self._normalized_values(filters.get("team") or filters.get("departments"))

        if allowed_locations:
            job_locations = {
                *self._normalized_values(self._location_for(raw_job)),
                *self._normalized_values(self._office_names(raw_job)),
            }
            if not job_locations.intersection(allowed_locations):
                return False

        if allowed_teams:
            job_departments = self._normalized_values(self._departments_for(raw_job))
            if not job_departments.intersection(allowed_teams):
                return False

        return True

    def _location_for(self, raw_job: Mapping[str, Any]) -> str:
        location = dict(raw_job.get("location", {}))
        if location.get("name"):
            return str(location["name"]).strip()

        offices = self._office_names(raw_job)
        return ", ".join(offices)

    def _departments_for(self, raw_job: Mapping[str, Any]) -> list[str]:
        departments = raw_job.get("departments", [])
        return [
            str(department.get("name") or "").strip()
            for department in departments
            if str(department.get("name") or "").strip()
        ]

    def _office_names(self, raw_job: Mapping[str, Any]) -> list[str]:
        offices = raw_job.get("offices", [])
        return [
            str(office.get("name") or "").strip()
            for office in offices
            if str(office.get("name") or "").strip()
        ]

    def _normalized_values(self, value: Any) -> set[str]:
        normalized: set[str] = set()
        for item in split_categories(value):
            collapsed = re.sub(r"\s+", " ", str(item)).strip()
            if collapsed:
                normalized.add(collapsed.casefold())
        return normalized
