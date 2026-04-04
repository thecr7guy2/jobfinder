from __future__ import annotations

import unittest
from unittest import mock

from match_jobs import (
    build_input_hash,
    extract_json_object,
    keyword_hits,
    load_resume_text,
    location_match,
    parse_llm_result,
    should_score_job,
    title_matches,
)


class MatchJobsTests(unittest.TestCase):
    def test_title_filter_requires_meaningful_overlap(self) -> None:
        targets = ["Data Scientist", "Machine Learning Engineer", "Data Analyst"]

        self.assertIn("Data Scientist", title_matches("Senior Data Scientist", targets))
        self.assertEqual([], title_matches("Senior Business Analyst", targets))

    def test_location_filter_supports_preferred_locations_and_remote(self) -> None:
        preferred = ["Amsterdam", "Netherlands"]
        remote_markers = ["remote", "hybrid"]

        self.assertEqual(
            "Amsterdam",
            location_match("Amsterdam, Nederland", preferred, remote_markers, allow_remote=True),
        )
        self.assertEqual(
            "remote",
            location_match("Remote / Hybrid", preferred, remote_markers, allow_remote=True),
        )
        self.assertIsNone(
            location_match("London, UK", preferred, remote_markers, allow_remote=False),
        )

    def test_location_filter_can_be_disabled(self) -> None:
        self.assertEqual(
            "any",
            location_match("The Hague", [], ["remote", "hybrid"], allow_remote=True),
        )

    def test_keyword_hits_match_normalized_text(self) -> None:
        text = "Python, SQL, Docker, and Kubernetes experience for machine learning platforms."
        self.assertEqual(
            ["python", "machine learning", "sql", "docker", "kubernetes"],
            keyword_hits(text, ["python", "machine learning", "sql", "docker", "kubernetes"]),
        )

    def test_keyword_hits_do_not_match_substrings(self) -> None:
        text = "Built storage systems and migrated infrastructure."
        self.assertEqual([], keyword_hits(text, ["rag"]))
        self.assertEqual(["rag"], keyword_hits("Built a RAG pipeline for retrieval.", ["rag"]))

    def test_input_hash_changes_when_resume_changes(self) -> None:
        job = {
            "title": "Data Scientist",
            "location": "Amsterdam, Nederland",
            "description": "Python and machine learning role",
            "posted_date": "2026-04-03",
        }
        config = {"target_titles": ["Data Scientist"], "keyword_terms": ["python"]}

        first_hash = build_input_hash(job, config, "resume one")
        second_hash = build_input_hash(job, config, "resume two")

        self.assertNotEqual(first_hash, second_hash)

    def test_llm_errors_are_rescored_even_without_hash_change(self) -> None:
        job = {"match": {"status": "llm_error", "input_hash": "same"}}
        self.assertTrue(should_score_job(job, "same", rescore_all=False))

    def test_unchanged_successful_match_is_skipped(self) -> None:
        job = {"match": {"status": "scored", "input_hash": "same"}}
        self.assertFalse(should_score_job(job, "same", rescore_all=False))

    def test_extract_json_object_strips_thinking_tags(self) -> None:
        payload = "<think>hidden reasoning</think>{\"score\": 82, \"rationale\": \"Good fit.\"}"
        self.assertEqual({"score": 82, "rationale": "Good fit."}, extract_json_object(payload))

    def test_parse_llm_result_clamps_score(self) -> None:
        score, rationale = parse_llm_result("{\"score\": 140, \"rationale\": \"Very strong fit.\"}")
        self.assertEqual(100, score)
        self.assertEqual("Very strong fit.", rationale)

    def test_load_resume_text_reads_from_postgres_when_configured(self) -> None:
        fake_cursor = mock.MagicMock()
        fake_cursor.fetchone.return_value = ("# Resume\nPython and ML",)
        fake_connection = mock.MagicMock()
        fake_connection.__enter__.return_value = fake_connection
        fake_connection.cursor.return_value.__enter__.return_value = fake_cursor

        with mock.patch("match_jobs.psycopg", new=mock.Mock(connect=mock.Mock(return_value=fake_connection))):
            with mock.patch.dict("os.environ", {"DATABASE_URL": "postgres://example"}, clear=False):
                self.assertEqual("# Resume\nPython and ML", load_resume_text())
                fake_cursor.execute.assert_called_once()

    def test_load_resume_text_falls_back_to_file_when_database_has_no_resume(self) -> None:
        fake_cursor = mock.MagicMock()
        fake_cursor.fetchone.return_value = None
        fake_connection = mock.MagicMock()
        fake_connection.__enter__.return_value = fake_connection
        fake_connection.cursor.return_value.__enter__.return_value = fake_cursor
        fake_resume_path = mock.Mock()
        fake_resume_path.exists.return_value = True
        fake_resume_path.read_text.return_value = "# Resume\nPython and ML"

        with mock.patch("match_jobs.psycopg", new=mock.Mock(connect=mock.Mock(return_value=fake_connection))):
            with mock.patch.dict("os.environ", {"DATABASE_URL": "postgres://example"}, clear=False):
                with mock.patch("match_jobs.RESUME_MARKDOWN_PATH", fake_resume_path):
                    self.assertEqual("# Resume\nPython and ML", load_resume_text())
                    fake_resume_path.read_text.assert_called_once_with(encoding="utf-8")


if __name__ == "__main__":
    unittest.main()
