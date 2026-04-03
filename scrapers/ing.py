from __future__ import annotations

from collections.abc import Mapping
from datetime import datetime
import json
import re
from typing import Any
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from scrapers.base import BaseScraper, clean_text, html_to_text


class INGScraper(BaseScraper):
    source = "ing_radancy"

    def fetch_raw_jobs(self) -> list[dict[str, Any]]:
        api_url = str(self.company["api_url"])
        raw_jobs: list[dict[str, Any]] = []
        seen_urls: set[str] = set()
        page = 1

        while True:
            response = self.session.post(
                api_url,
                json=self._search_payload(page),
                timeout=self.timeout,
            )
            response.raise_for_status()
            payload = response.json()
            results_html = str(payload.get("results") or "")
            if not results_html:
                break

            page_jobs, total_pages = self._parse_results(results_html)
            if not page_jobs:
                break

            for page_job in page_jobs:
                job_url = str(page_job.get("url") or "")
                if not job_url or job_url in seen_urls:
                    continue
                seen_urls.add(job_url)

                enriched = dict(page_job)
                enriched.update(self._fetch_detail(job_url))
                raw_jobs.append(enriched)

            if page >= total_pages:
                break

            page += 1

        return raw_jobs

    def normalize_job(self, raw_job: Mapping[str, Any], fetched_at: str) -> dict[str, Any]:
        raw_id = str(raw_job.get("job_id") or self._job_id_from_url(str(raw_job.get("url") or ""))).strip()
        description = html_to_text(str(raw_job.get("detail_description") or raw_job.get("description") or ""))
        location = str(raw_job.get("detail_location") or raw_job.get("location") or "").strip()

        return {
            "id": f"{self.company_id}::{raw_id}",
            "company_id": self.company_id,
            "company_name": self.company_name,
            "title": str(raw_job.get("title") or "").strip(),
            "url": str(raw_job.get("url") or "").strip(),
            "location": location,
            "categories": list(raw_job.get("categories") or []),
            "description": clean_text(description),
            "posted_date": self._normalize_date(str(raw_job.get("detail_posted_date") or "")),
            "first_seen": fetched_at,
            "last_seen": fetched_at,
            "source": self.source,
        }

    def _search_payload(self, page: int) -> dict[str, Any]:
        records_per_page = int(self.company.get("records_per_page", 20))
        filters = list(self.company.get("filters", {}).get("facet_filters", []))

        return {
            "ActiveFacetID": 0,
            "CurrentPage": page,
            "RecordsPerPage": records_per_page,
            "Distance": int(self.company.get("distance", 50)),
            "RadiusUnitType": int(self.company.get("radius_unit_type", 0)),
            "Keywords": "",
            "Location": "",
            "Latitude": None,
            "Longitude": None,
            "ShowRadius": False,
            "IsPagination": "True" if page > 1 else "False",
            "CustomFacetName": "",
            "FacetTerm": "",
            "FacetType": 0,
            "FacetFilters": [self._facet_payload(item) for item in filters],
            "SearchResultsModuleName": "Search Results",
            "SearchFiltersModuleName": "Search Filters",
            "SortCriteria": int(self.company.get("sort_criteria", 0)),
            "SortDirection": int(self.company.get("sort_direction", 0)),
            "SearchType": int(self.company.get("search_type", 5)),
            "CategoryFacetTerm": "",
            "CategoryFacetType": 0,
            "LocationFacetTerm": "",
            "LocationFacetType": 0,
            "KeywordType": "",
            "LocationType": "",
            "LocationPath": "",
            "OrganizationIds": "",
            "RefinedKeywords": [],
            "PostalCode": "",
            "ResultsType": 0,
            "fc": "",
            "fl": "",
            "fcf": "",
            "afc": "",
            "afl": "",
            "afcf": "",
        }

    def _facet_payload(self, item: Mapping[str, Any]) -> dict[str, Any]:
        return {
            "ID": str(item.get("id") or ""),
            "FacetType": int(item.get("facet_type") or 0),
            "Display": str(item.get("display") or ""),
            "IsApplied": True,
            "FieldName": str(item.get("field_name") or ""),
        }

    def _parse_results(self, html: str) -> tuple[list[dict[str, Any]], int]:
        soup = BeautifulSoup(html, "html.parser")
        results_section = soup.select_one("#search-results")
        total_pages = int(results_section.get("data-total-pages") or 1) if results_section else 1

        jobs: list[dict[str, Any]] = []
        for card in soup.select("li.search-results-item.vacancy-item"):
            link = card.select_one(".vacancy-item__content a[href^='/en/job/']")
            if link is None:
                continue

            href = str(link.get("href") or "").strip()
            if not href:
                continue

            title = clean_text(link.get_text(" ", strip=True))
            meta_items = [
                clean_text(node.get_text(" ", strip=True))
                for node in card.select(".vacancy-item__meta span")
                if clean_text(node.get_text(" ", strip=True))
            ]
            location = meta_items[0] if meta_items else ""
            categories = [
                item
                for item in meta_items[1:]
                if item and not item.casefold().startswith(self.company_name.casefold())
            ]

            jobs.append(
                {
                    "job_id": str(link.get("data-job-id") or self._job_id_from_url(href)),
                    "title": title,
                    "url": urljoin("https://careers.ing.com", href),
                    "location": location,
                    "categories": categories,
                }
            )

        return jobs, total_pages

    def _fetch_detail(self, url: str) -> dict[str, Any]:
        html = self.request_text(url)
        job_posting = self._job_posting_from_html(html)
        description_html = str(job_posting.get("description") or "")
        detail_location = self._job_location(job_posting)

        if not description_html:
            soup = BeautifulSoup(html, "html.parser")
            description_node = soup.select_one(".job-description")
            if description_node is not None:
                description_html = str(description_node)

        return {
            "detail_description": description_html,
            "detail_posted_date": str(job_posting.get("datePosted") or ""),
            "detail_location": detail_location,
        }

    def _job_posting_from_html(self, html: str) -> dict[str, Any]:
        soup = BeautifulSoup(html, "html.parser")
        for script in soup.select("script[type='application/ld+json']"):
            content = script.get_text(strip=True)
            if not content or "JobPosting" not in content:
                continue
            try:
                payload = json.loads(content)
            except json.JSONDecodeError:
                continue
            if isinstance(payload, Mapping) and payload.get("@type") == "JobPosting":
                return dict(payload)
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

    def _normalize_date(self, value: str) -> str | None:
        if not value:
            return None

        match = re.match(r"^\s*(\d{4})-(\d{1,2})-(\d{1,2})\s*$", value)
        if match:
            year, month, day = (int(part) for part in match.groups())
            return f"{year:04d}-{month:02d}-{day:02d}"

        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return value[:10]
        return parsed.date().isoformat()

    def _job_id_from_url(self, url: str) -> str:
        match = re.search(r"/(\d+)\s*$", url)
        if match:
            return match.group(1)
        return url.rstrip("/").rsplit("/", 1)[-1]
