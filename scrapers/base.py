from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Mapping
from datetime import datetime, timezone
import re
from typing import Any

import requests
from bs4 import BeautifulSoup

try:
    from curl_cffi import requests as curl_requests
except ImportError:  # pragma: no cover - dependency is declared in pyproject
    curl_requests = None

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/135.0.0.0 Safari/537.36"
)


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def clean_text(value: str | None) -> str:
    if not value:
        return ""

    text = re.sub(r"\s+\n", "\n", value)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip()


def html_to_text(value: str | None) -> str:
    if not value:
        return ""

    soup = BeautifulSoup(value, "html.parser")
    return clean_text(soup.get_text("\n", strip=True))


def split_categories(value: Any) -> list[str]:
    if not value:
        return []
    if isinstance(value, str):
        raw_values = value.split("|")
    else:
        raw_values = value
    return [str(item).strip() for item in raw_values if str(item).strip()]


def iso_date(value: str | None) -> str | None:
    if not value:
        return None
    return value[:10]


class BaseScraper(ABC):
    source = "unknown"

    def __init__(self, company: Mapping[str, Any], session: requests.Session | None = None) -> None:
        self.company = dict(company)
        self.session = session or requests.Session()
        self.session.headers.setdefault("User-Agent", USER_AGENT)
        self.session.headers.setdefault("Accept", "text/html,application/json;q=0.9,*/*;q=0.8")
        self.session.headers.setdefault("Accept-Language", "en-US,en;q=0.9")
        self.timeout = float(self.company.get("timeout_seconds", 30))

    @property
    def company_id(self) -> str:
        return str(self.company["id"])

    @property
    def company_name(self) -> str:
        return str(self.company["name"])

    def request_text(self, url: str, params: Mapping[str, Any] | None = None) -> str:
        prepared = requests.PreparedRequest()
        prepared.prepare_url(url, params)

        try:
            response = self.session.get(url, params=params, timeout=self.timeout)
            response.raise_for_status()
            return response.text
        except requests.TooManyRedirects:
            pass
        except requests.HTTPError as exc:
            status_code = exc.response.status_code if exc.response is not None else None
            if status_code != 403:
                raise

        if curl_requests is None:
            raise

        response = curl_requests.get(
            prepared.url,
            impersonate="chrome",
            timeout=self.timeout,
        )
        response.raise_for_status()
        return response.text

    def request_json(self, url: str, params: Mapping[str, Any] | None = None) -> dict[str, Any]:
        response = self.session.get(url, params=params, timeout=self.timeout)
        response.raise_for_status()
        return response.json()

    @abstractmethod
    def fetch_raw_jobs(self) -> list[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def normalize_job(self, raw_job: Mapping[str, Any], fetched_at: str) -> dict[str, Any]:
        raise NotImplementedError

    def normalize_jobs(self, raw_jobs: list[dict[str, Any]], fetched_at: str) -> list[dict[str, Any]]:
        return [self.normalize_job(raw_job, fetched_at) for raw_job in raw_jobs]
