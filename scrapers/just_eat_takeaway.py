from __future__ import annotations

from collections.abc import Mapping
import html
import json
from typing import Any

from bs4 import BeautifulSoup

from scrapers.base import BaseScraper, clean_text, html_to_text, iso_date


class JustEatTakeawayScraper(BaseScraper):
    source = "just_eat_takeaway_phenom"

    def fetch_raw_jobs(self) -> list[dict[str, Any]]:
        base_url = str(self.company["url"])
        raw_jobs: list[dict[str, Any]] = []
        seen_ids: set[str] = set()
        offset = int(self.company.get("start_from", 0))

        while True:
            html = self.request_text(
                base_url,
                params={
                    "from": offset,
                    "s": int(self.company.get("search_page", 1)),
                },
            )
            payload = self._extract_embedded_payload(html)
            search_data = self._search_data(payload)
            page_jobs = list(search_data.get("jobs") or [])
            total_hits = int(payload.get("eagerLoadRefineSearch", {}).get("totalHits") or len(page_jobs))

            if not page_jobs:
                break

            for job in page_jobs:
                if not isinstance(job, Mapping):
                    continue
                if not self._matches_filters(job):
                    continue

                job_id = str(job.get("jobId") or job.get("reqId") or job.get("jobSeqNo") or "").strip()
                if not job_id or job_id in seen_ids:
                    continue

                seen_ids.add(job_id)
                enriched = dict(job)
                enriched.update(self._fetch_job_detail(job))
                raw_jobs.append(enriched)

            offset += len(page_jobs)
            if offset >= total_hits:
                break

        return raw_jobs

    def normalize_job(self, raw_job: Mapping[str, Any], fetched_at: str) -> dict[str, Any]:
        raw_id = str(raw_job.get("jobId") or raw_job.get("reqId") or raw_job.get("jobSeqNo") or "").strip()
        categories = self._categories_for(raw_job)
        description_source = (
            str(raw_job.get("detail_description") or "").strip()
            or str(raw_job.get("descriptionTeaser") or "").strip()
            or str(dict(raw_job.get("ml_job_parser") or {}).get("descriptionTeaser_ats") or "").strip()
        )
        description = clean_text(html_to_text(description_source))
        title = clean_text(html.unescape(str(raw_job.get("detail_title") or raw_job.get("title") or "").strip()))
        location = clean_text(
            html.unescape(
                str(raw_job.get("detail_location") or raw_job.get("cityStateCountry") or raw_job.get("location") or "").strip()
            )
        )

        return {
            "id": f"{self.company_id}::{raw_id}",
            "company_id": self.company_id,
            "company_name": self.company_name,
            "title": title,
            "url": str(raw_job.get("detail_url") or raw_job.get("applyUrl") or "").strip(),
            "location": location,
            "categories": categories,
            "description": description,
            "posted_date": iso_date(str(raw_job.get("detail_posted_date") or raw_job.get("postedDate") or "")),
            "first_seen": fetched_at,
            "last_seen": fetched_at,
            "source": self.source,
        }

    def _extract_embedded_payload(self, html: str) -> dict[str, Any]:
        marker_start = "phApp.ddo = "
        marker_end = "; phApp.experimentData"
        start = html.find(marker_start)
        if start == -1:
            raise RuntimeError("Could not locate embedded Phenom payload start marker.")

        end = html.find(marker_end, start)
        if end == -1:
            raise RuntimeError("Could not locate embedded Phenom payload end marker.")

        payload_text = html[start + len(marker_start) : end]
        payload = json.loads(payload_text)
        if not isinstance(payload, Mapping):
            raise RuntimeError("Embedded Phenom payload has unexpected structure.")
        return dict(payload)

    def _search_data(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        eager = payload.get("eagerLoadRefineSearch", {})
        if not isinstance(eager, Mapping):
            return {}
        data = eager.get("data", {})
        if not isinstance(data, Mapping):
            return {}
        return dict(data)

    def _matches_filters(self, job: Mapping[str, Any]) -> bool:
        filters = dict(self.company.get("filters", {}))

        allowed_countries = {str(value).strip().casefold() for value in filters.get("countries", []) if str(value).strip()}
        country = str(job.get("country") or "").strip().casefold()
        if allowed_countries and country not in allowed_countries:
            return False

        allowed_categories = {str(value).strip().casefold() for value in filters.get("categories", []) if str(value).strip()}
        if allowed_categories:
            job_categories = {value.casefold() for value in self._categories_for(job)}
            if not (job_categories & allowed_categories):
                return False

        return True

    def _categories_for(self, job: Mapping[str, Any]) -> list[str]:
        categories: list[str] = []

        primary = str(job.get("category") or "").strip()
        if primary:
            categories.append(clean_text(html.unescape(primary)))

        multi = job.get("multi_category", [])
        if isinstance(multi, list):
            for item in multi:
                value = clean_text(html.unescape(str(item).strip()))
                if value and value not in categories:
                    categories.append(value)

        sub_category = clean_text(html.unescape(str(job.get("subCategory") or "").strip()))
        if sub_category and sub_category not in categories:
            categories.append(sub_category)

        return categories

    def _fetch_job_detail(self, job: Mapping[str, Any]) -> dict[str, Any]:
        detail_url = str(job.get("applyUrl") or "").strip()
        if not detail_url:
            return {}

        try:
            html = self.request_text(detail_url)
        except Exception:
            return {}

        soup = BeautifulSoup(html, "html.parser")

        canonical = soup.select_one("link[rel='canonical']")
        canonical_url = str(canonical.get("href") or "").strip() if canonical is not None else ""

        posting = self._job_posting_from_html(soup)
        if not posting:
            return {"detail_url": canonical_url or detail_url}

        return {
            "detail_url": canonical_url or detail_url,
            "detail_title": str(posting.get("title") or "").strip(),
            "detail_description": str(posting.get("description") or "").strip(),
            "detail_posted_date": str(posting.get("datePosted") or "").strip(),
            "detail_location": self._job_location(posting),
        }

    def _job_posting_from_html(self, soup: BeautifulSoup) -> dict[str, Any]:
        for script in soup.select("script[type='application/ld+json']"):
            content = script.string or script.get_text()
            if not content or "JobPosting" not in content:
                continue
            try:
                payload = json.loads(content)
            except json.JSONDecodeError:
                continue
            if isinstance(payload, Mapping) and payload.get("@type") == "JobPosting":
                return dict(payload)
        return {}

    def _job_location(self, posting: Mapping[str, Any]) -> str:
        job_location = posting.get("jobLocation", {})
        if not isinstance(job_location, Mapping):
            return ""

        address = job_location.get("address", {})
        if not isinstance(address, Mapping):
            return ""

        locality = str(address.get("addressLocality") or "").strip()
        country = str(address.get("addressCountry") or "").strip()
        parts = [value for value in [locality, country] if value]
        return ", ".join(parts)
