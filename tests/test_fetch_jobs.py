from __future__ import annotations

import io
import unittest
from unittest import mock

import requests

import fetch_jobs
from scrapers.base import BaseScraper


class DummyScraper(BaseScraper):
    def fetch_raw_jobs(self) -> list[dict[str, str]]:
        return []

    def normalize_job(self, raw_job, fetched_at):  # pragma: no cover - unused in these tests
        return {}


class FetchJobsTests(unittest.TestCase):
    def test_request_text_falls_back_on_too_many_redirects(self) -> None:
        session = mock.Mock()
        session.headers = {}
        session.get.side_effect = requests.TooManyRedirects("redirect loop")
        company = {"id": "dummy", "name": "Dummy", "timeout_seconds": 10}

        with mock.patch("scrapers.base.curl_requests") as curl_requests:
            curl_requests.get.return_value = mock.Mock(
                text="<html>ok</html>",
                raise_for_status=mock.Mock(),
            )

            scraper = DummyScraper(company, session=session)
            result = scraper.request_text("https://example.com/jobs", params={"page": 1})

        self.assertEqual("<html>ok</html>", result)
        curl_requests.get.assert_called_once()

    def test_main_continues_when_one_company_fails(self) -> None:
        companies = [
            {"id": "broken", "type": "html"},
            {"id": "working", "type": "html"},
        ]
        args = mock.Mock(force=False, company=None)

        def fake_fetch_company_jobs(company, force, session):
            if company["id"] == "broken":
                raise requests.TooManyRedirects("redirect loop")
            return [{"id": "working::1"}]

        scraper_instance = mock.Mock()
        scraper_instance.normalize_jobs.return_value = [
            {
                "id": "working::1",
                "company_id": "working",
                "company_name": "Working",
                "title": "Data Scientist",
                "url": "https://example.com/job",
                "location": "Amsterdam",
                "categories": [],
                "description": "Test",
                "posted_date": None,
                "first_seen": "2026-04-05T00:00:00Z",
                "last_seen": "2026-04-05T00:00:00Z",
                "source": "html_scrape",
            }
        ]

        stderr = io.StringIO()

        with mock.patch("fetch_jobs.parse_args", return_value=args), \
             mock.patch("fetch_jobs.load_companies", return_value=companies), \
             mock.patch("fetch_jobs.load_jobs_store", return_value=[]), \
             mock.patch("fetch_jobs.fetch_company_jobs", side_effect=fake_fetch_company_jobs), \
             mock.patch("fetch_jobs.write_jobs_store") as write_jobs_store, \
             mock.patch.dict("fetch_jobs.SCRAPER_TYPES", {"html": mock.Mock(return_value=scraper_instance)}), \
             mock.patch("sys.stderr", stderr):
            fetch_jobs.main()

        write_jobs_store.assert_called_once()
        written_jobs = write_jobs_store.call_args.args[0]
        self.assertEqual(1, len(written_jobs))
        self.assertIn("warning: failed to refresh broken", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
