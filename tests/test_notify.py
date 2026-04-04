from __future__ import annotations

import unittest

from notify import (
    apply_job_alert_metadata,
    compute_current_job_counts,
    format_failure_alert,
    format_job_alert,
    select_alertable_jobs,
    telegram_send_message,
    truncate_rationale,
    update_source_health,
)


class DummyResponse:
    def __init__(
        self,
        payload: dict,
        status_error: Exception | None = None,
        ok: bool = True,
        status_code: int = 200,
        text: str = "",
    ) -> None:
        self.payload = payload
        self.status_error = status_error
        self.ok = ok
        self.status_code = status_code
        self.text = text

    def raise_for_status(self) -> None:
        if self.status_error is not None:
            raise self.status_error

    def json(self) -> dict:
        return self.payload


class DummySession:
    def __init__(self, response: DummyResponse) -> None:
        self.response = response
        self.calls: list[dict] = []

    def post(self, url: str, data: dict, timeout: int) -> DummyResponse:
        self.calls.append({"url": url, "data": data, "timeout": timeout})
        return self.response


class NotifyTests(unittest.TestCase):
    def make_job(self, **overrides) -> dict:
        job = {
            "id": "booking_com::1",
            "company_id": "booking_com",
            "company_name": "Booking.com",
            "title": "Senior Machine Learning Engineer",
            "location": "Amsterdam, Netherlands",
            "url": "https://example.com/job",
            "match": {
                "status": "scored",
                "llm_score": 85,
                "llm_score_threshold": 70,
                "llm_rationale": "Strong overlap with production ML systems.",
            },
        }
        job.update(overrides)
        return job

    def test_select_alertable_jobs_filters_correctly(self) -> None:
        selected, skipped = select_alertable_jobs(
            [
                self.make_job(id="1"),
                self.make_job(id="2", alerted=True),
                self.make_job(id="3", match={"status": "scored", "llm_score": 65, "llm_score_threshold": 70}),
                self.make_job(id="4", match={"status": "filtered_title", "llm_score": 90, "llm_score_threshold": 70}),
            ],
            default_threshold=70,
        )
        self.assertEqual(["1"], [job["id"] for job in selected])
        self.assertEqual(1, skipped)

    def test_select_alertable_jobs_resend_includes_alerted(self) -> None:
        selected, skipped = select_alertable_jobs(
            [self.make_job(id="1", alerted=True)],
            default_threshold=70,
            resend=True,
        )
        self.assertEqual(["1"], [job["id"] for job in selected])
        self.assertEqual(0, skipped)

    def test_job_alert_sorted_descending(self) -> None:
        selected, _ = select_alertable_jobs(
            [
                self.make_job(id="1", match={"status": "scored", "llm_score": 70, "llm_score_threshold": 70}),
                self.make_job(id="2", match={"status": "scored", "llm_score": 90, "llm_score_threshold": 70}),
            ],
            default_threshold=70,
        )
        self.assertEqual(["2", "1"], [job["id"] for job in selected])

    def test_truncate_rationale(self) -> None:
        self.assertEqual("a" * 150, truncate_rationale("a" * 150))
        self.assertEqual(("a" * 149) + "…", truncate_rationale("a" * 151))

    def test_format_job_alert_contains_expected_sections(self) -> None:
        message = format_job_alert(self.make_job())
        self.assertIn("<b>[85/100] Senior Machine Learning Engineer — Booking.com</b>", message)
        self.assertIn("📍 Amsterdam, Netherlands", message)
        self.assertIn('<a href="https://example.com/job">View job</a>', message)

    def test_telegram_send_message_returns_message_id(self) -> None:
        session = DummySession(DummyResponse({"ok": True, "result": {"message_id": 123}}))
        message_id = telegram_send_message(session, "token", "chat", "hello")
        self.assertEqual(123, message_id)
        self.assertEqual("https://api.telegram.org/bottoken/sendMessage", session.calls[0]["url"])

    def test_telegram_send_message_raises_on_missing_message_id(self) -> None:
        session = DummySession(DummyResponse({"ok": True, "result": {}}))
        with self.assertRaises(RuntimeError):
            telegram_send_message(session, "token", "chat", "hello")

    def test_apply_job_alert_metadata(self) -> None:
        job = self.make_job()
        apply_job_alert_metadata(job, 77)
        self.assertTrue(job["alerted"])
        self.assertEqual(85, job["alert_score"])
        self.assertEqual(77, job["alert_message_id"])
        self.assertIsInstance(job["alerted_at"], str)

    def test_compute_current_job_counts(self) -> None:
        counts = compute_current_job_counts(
            [
                self.make_job(company_id="booking_com"),
                self.make_job(company_id="booking_com"),
                self.make_job(company_id="ing"),
            ],
            ["booking_com", "ing", "tno"],
        )
        self.assertEqual({"booking_com": 2, "ing": 1, "tno": 0}, counts)

    def test_update_source_health_failure_flow(self) -> None:
        first, warnings = update_source_health({}, {"abn_amro": 0}, "2026-04-04T10:00:00Z")
        self.assertEqual([], warnings)
        self.assertEqual(1, first["abn_amro"]["consecutive_zero_job_runs"])

        second, warnings = update_source_health(first, {"abn_amro": 0}, "2026-04-04T11:00:00Z")
        self.assertEqual(["abn_amro"], warnings)
        self.assertTrue(second["abn_amro"]["failure_alerted"])

        third, warnings = update_source_health(second, {"abn_amro": 0}, "2026-04-04T12:00:00Z")
        self.assertEqual([], warnings)
        self.assertEqual(3, third["abn_amro"]["consecutive_zero_job_runs"])

        recovered, warnings = update_source_health(third, {"abn_amro": 3}, "2026-04-04T13:00:00Z")
        self.assertEqual([], warnings)
        self.assertEqual(0, recovered["abn_amro"]["consecutive_zero_job_runs"])
        self.assertFalse(recovered["abn_amro"]["failure_alerted"])

    def test_format_failure_alert(self) -> None:
        message = format_failure_alert("ABN AMRO", 0, "2026-04-04T18:00:00Z")
        self.assertIn("Source warning: ABN AMRO", message)
        self.assertIn("Observed count: 0", message)


if __name__ == "__main__":
    unittest.main()
