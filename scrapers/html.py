from __future__ import annotations

from collections.abc import Mapping
from pathlib import PurePosixPath
import re
from typing import Any
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

from scrapers.base import BaseScraper, clean_text, split_categories


class HTMLScraper(BaseScraper):
    source = "html_scrape"

    def fetch_raw_jobs(self) -> list[dict[str, Any]]:
        base_url = str(self.company["url"])
        selectors = dict(self.company.get("selectors", {}))
        filters = dict(self.company.get("filters", {}))

        raw_jobs: list[dict[str, Any]] = []
        seen_urls: set[str] = set()
        page_index = 0

        while True:
            params = dict(filters)
            if page_index > 0:
                params["pager_page"] = page_index

            html = self.request_text(base_url, params=params or None)
            soup = BeautifulSoup(html, "html.parser")
            cards = soup.select(selectors.get("job_card", "div.ipx-pt-vacancy"))
            if not cards:
                break

            new_cards = 0
            for card in cards:
                link_tag = card.select_one(selectors.get("link", "a[href]"))
                if link_tag is None:
                    continue

                href = urljoin(base_url, str(link_tag.get("href", "")).strip())
                if not href or href in seen_urls:
                    continue

                seen_urls.add(href)
                new_cards += 1
                raw_jobs.append(self._fetch_detail_job(card, href, selectors))

            if new_cards == 0 or soup.select_one("li.pager-next a") is None:
                break

            page_index += 1

        return raw_jobs

    def normalize_job(self, raw_job: Mapping[str, Any], fetched_at: str) -> dict[str, Any]:
        slug = str(raw_job.get("slug") or "")

        return {
            "id": f"{self.company_id}::{slug}",
            "company_id": self.company_id,
            "company_name": self.company_name,
            "title": str(raw_job.get("title") or "").strip(),
            "url": str(raw_job.get("url") or "").strip(),
            "location": str(raw_job.get("location") or "").strip(),
            "categories": split_categories(raw_job.get("categories")),
            "description": clean_text(str(raw_job.get("description") or "")),
            "posted_date": raw_job.get("posted_date"),
            "first_seen": fetched_at,
            "last_seen": fetched_at,
            "source": self.source,
        }

    def _fetch_detail_job(
        self,
        listing_card: Any,
        detail_url: str,
        selectors: Mapping[str, Any],
    ) -> dict[str, Any]:
        detail_html = self.request_text(detail_url)
        detail_soup = BeautifulSoup(detail_html, "html.parser")

        title = self._text(detail_soup.select_one("h1.grid-title")) or self._text(
            listing_card.select_one(selectors.get("title", "h3"))
        )
        location = self._text(detail_soup.select_one("dd.meta-locatie")) or self._text(
            listing_card.select_one(selectors.get("location", "dd.extra-werklocatie"))
        )

        description_parts: list[str] = []
        for block in detail_soup.select(".z-content .iprox-rich-content"):
            text = self._text(block, separator="\n")
            if text:
                description_parts.append(text)

        unique_parts = list(dict.fromkeys(description_parts))
        categories = self._extract_categories(detail_html)
        posted_date = self._extract_regex(detail_html, r'"datePosted"\s*:\s*"([^"]+)"')

        return {
            "slug": self._slug_from_url(detail_url),
            "title": title,
            "url": detail_url,
            "location": location,
            "categories": categories,
            "description": "\n\n".join(unique_parts),
            "posted_date": posted_date,
        }

    def _extract_categories(self, html: str) -> list[str]:
        raw_categories = self._extract_regex(html, r'vacancyFunctionGroup:"([^"]+)"')
        return split_categories(raw_categories)

    def _extract_regex(self, value: str, pattern: str) -> str | None:
        match = re.search(pattern, value)
        if not match:
            return None
        return match.group(1)

    def _slug_from_url(self, url: str) -> str:
        path = PurePosixPath(urlparse(url).path)
        parts = [part for part in path.parts if part and part != "/"]

        if "vacancies" in parts:
            vacancy_index = parts.index("vacancies")
            trailing_parts = parts[vacancy_index + 1 :]
            if trailing_parts:
                return "--".join(trailing_parts)

        return path.name

    def _text(self, node: Any, separator: str = " ") -> str:
        if node is None:
            return ""
        return clean_text(node.get_text(separator=separator, strip=True))
