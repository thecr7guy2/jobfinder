from __future__ import annotations

from collections.abc import Mapping
import json
from typing import Any

from bs4 import BeautifulSoup
import requests

from scrapers.base import BaseScraper, clean_text, curl_requests, html_to_text, iso_date


class AlbertHeijnScraper(BaseScraper):
    source = "albert_heijn_api"

    def fetch_raw_jobs(self) -> list[dict[str, Any]]:
        raw_jobs: list[dict[str, Any]] = []
        page = 1
        total_pages = 1

        while page <= total_pages:
            payload = self._search_page(page)
            total_pages = int(payload.get("meta", {}).get("totalPageCount") or 1)

            for job in payload.get("vacancies", []):
                if not isinstance(job, Mapping):
                    continue
                enriched = dict(job)
                enriched.update(self._fetch_job_detail(job))
                raw_jobs.append(enriched)

            page += 1

        return raw_jobs

    def normalize_job(self, raw_job: Mapping[str, Any], fetched_at: str) -> dict[str, Any]:
        raw_id = str(raw_job.get("id") or raw_job.get("external_id") or "").strip()
        description = html_to_text(str(raw_job.get("detail_description") or ""))
        location = str(raw_job.get("detail_location") or raw_job.get("city") or "").strip()

        return {
            "id": f"{self.company_id}::{raw_id}",
            "company_id": self.company_id,
            "company_name": self.company_name,
            "title": str(raw_job.get("title") or "").strip(),
            "url": str(raw_job.get("url") or self._detail_url(raw_job)).strip(),
            "location": location,
            "categories": self._categories_for(raw_job),
            "description": clean_text(description),
            "posted_date": iso_date(
                str(raw_job.get("detail_posted_date") or raw_job.get("updated") or raw_job.get("created") or "")
            ),
            "first_seen": fetched_at,
            "last_seen": fetched_at,
            "source": self.source,
        }

    def _search_page(self, page: int) -> dict[str, Any]:
        url = str(self.company["api_url"])
        params = self._query_params(page)
        headers = {
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Referer": str(self.company.get("careers_url") or "https://werk.ah.nl/en/vacancies"),
            "User-Agent": "Mozilla/5.0",
            "X-Requested-With": "XMLHttpRequest",
        }

        prepared = requests.PreparedRequest()
        prepared.prepare_url(url, params)

        try:
            response = requests.get(
                url,
                params=params,
                headers=headers,
                timeout=self.timeout,
            )
            response.raise_for_status()
            return response.json()
        except requests.HTTPError as exc:
            status_code = exc.response.status_code if exc.response is not None else None
            if status_code != 403 or curl_requests is None:
                raise

        response = curl_requests.get(
            prepared.url,
            impersonate="chrome",
            headers=headers,
            timeout=self.timeout,
        )
        response.raise_for_status()
        return json.loads(response.text)

    def _query_params(self, page: int) -> list[tuple[str, Any]]:
        params: list[tuple[str, Any]] = [("page", page)]
        filters = dict(self.company.get("filters", {}))
        for key, value in filters.items():
            if value is None or value == "":
                continue
            if isinstance(value, list):
                for item in value:
                    normalized = str(item).strip()
                    if normalized:
                        params.append((key, normalized))
                continue
            params.append((key, value))
        return params

    def _fetch_job_detail(self, raw_job: Mapping[str, Any]) -> dict[str, Any]:
        detail_url = self._detail_url(raw_job)
        response = requests.get(
            detail_url,
            headers={
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Referer": str(self.company.get("careers_url") or "https://werk.ah.nl/en/vacancies"),
                "User-Agent": "Mozilla/5.0",
            },
            timeout=self.timeout,
        )
        response.raise_for_status()
        detail_html = response.text
        job_posting = self._job_posting_from_html(detail_html)
        return {
            "url": detail_url,
            "detail_description": job_posting.get("description"),
            "detail_posted_date": job_posting.get("datePosted"),
            "detail_location": self._job_location(job_posting),
        }

    def _detail_url(self, raw_job: Mapping[str, Any]) -> str:
        raw_id = str(raw_job.get("id") or "").strip()
        slug = str(raw_job.get("slug") or "").strip()
        template = str(self.company.get("job_url_template") or "https://werk.ah.nl/en/vacancy/{id}/{slug}")
        return template.format(id=raw_id, slug=slug)

    def _job_posting_from_html(self, html: str) -> dict[str, Any]:
        soup = BeautifulSoup(html, "html.parser")
        for script in soup.select("script[type='application/ld+json']"):
            content = script.string or script.get_text()
            if not content or "JobPosting" not in content:
                continue
            try:
                payload = json.loads(content)
            except json.JSONDecodeError:
                continue
            if isinstance(payload, dict) and payload.get("@type") == "JobPosting":
                return payload
        return {}

    def _job_location(self, job_posting: Mapping[str, Any]) -> str:
        location = job_posting.get("jobLocation", {})
        if not isinstance(location, Mapping):
            return ""

        address = location.get("address", {})
        if not isinstance(address, Mapping):
            return ""

        locality = str(address.get("addressLocality") or "").strip()
        country = str(address.get("addressCountry") or "").strip()
        parts = [part for part in [locality, country] if part]
        return ", ".join(parts)

    def _categories_for(self, raw_job: Mapping[str, Any]) -> list[str]:
        categories: list[str] = []
        for option_value in raw_job.get("option_values", []):
            if not isinstance(option_value, Mapping):
                continue
            value = str(option_value.get("value") or "").strip()
            if value and value not in categories:
                categories.append(value)
        return categories
