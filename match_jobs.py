from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
from typing import Any

import requests
import yaml

try:
    import psycopg
except ImportError:  # pragma: no cover - dependency is installed in normal runtime
    psycopg = None

from scrapers.base import clean_text, utcnow_iso

ROOT = Path(__file__).resolve().parent
CONFIG_PATH = ROOT / "config" / "matching.yaml"
DATA_DIR = ROOT / "data"
JOBS_PATH = DATA_DIR / "jobs.json"
RESUME_MARKDOWN_PATH = DATA_DIR / "resume.md"
RESUME_TEXT_PATH = DATA_DIR / "resume.txt"
ENV_PATH = ROOT / ".env"
MATCH_VERSION = "phase2_v1"
TITLE_STOPWORDS = {
    "a",
    "an",
    "and",
    "engineering",
    "for",
    "g",
    "i",
    "ii",
    "iii",
    "ic",
    "in",
    "lead",
    "manager",
    "of",
    "senior",
    "staff",
    "the",
    "track",
}


def resolve_database_url() -> str | None:
    return (
        os.getenv("DATABASE_URL")
        or os.getenv("POSTGRES_URL")
        or os.getenv("POSTGRES_URL_NON_POOLING")
        or os.getenv("NEON_DATABASE_URL")
        or None
    )


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("'").strip('"')
        if key and key not in os.environ:
            os.environ[key] = value


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Score jobs against a resume using staged matching.")
    parser.add_argument("--company", help="Score only one company by id.")
    parser.add_argument("--job-id", help="Score only one job by exact id.")
    parser.add_argument("--rescore-all", action="store_true", help="Ignore cached match hashes and rescore.")
    parser.add_argument("--dry-run", action="store_true", help="Run matching without writing data/jobs.json.")
    return parser.parse_args()


def load_matching_config() -> dict[str, Any]:
    with CONFIG_PATH.open("r", encoding="utf-8") as handle:
        payload = yaml.safe_load(handle) or {}

    matching = payload.get("matching")
    if not isinstance(matching, dict):
        raise SystemExit(f"{CONFIG_PATH} must contain a top-level 'matching' mapping.")
    return matching


def load_jobs_store() -> list[dict[str, Any]]:
    if not JOBS_PATH.exists():
        return []

    with JOBS_PATH.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, list):
        raise SystemExit(f"{JOBS_PATH} must contain a top-level JSON array.")
    return payload


def write_jobs_store(jobs: list[dict[str, Any]]) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with JOBS_PATH.open("w", encoding="utf-8") as handle:
        json.dump(jobs, handle, indent=2, ensure_ascii=True)
        handle.write("\n")


def load_resume_text() -> str:
    database_url = resolve_database_url()
    if database_url:
        if psycopg is None:
            raise SystemExit("psycopg is required to read the resume from Postgres.")

        with psycopg.connect(database_url) as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT content
                    FROM profile_documents
                    WHERE document_key = 'resume_markdown'
                    LIMIT 1
                    """
                )
                row = cursor.fetchone()

        stored_resume = row[0] if row else ""

        resume_text = clean_text(str(stored_resume or ""))
        if resume_text:
            return resume_text

    resume_path = RESUME_MARKDOWN_PATH if RESUME_MARKDOWN_PATH.exists() else RESUME_TEXT_PATH
    if not resume_path.exists():
        raise SystemExit(
            "Missing resume input. Sync the resume into Postgres or create "
            f"{RESUME_MARKDOWN_PATH} / {RESUME_TEXT_PATH}."
        )

    resume_text = clean_text(resume_path.read_text(encoding="utf-8"))
    if not resume_text:
        raise SystemExit(f"{resume_path} is empty.")
    return resume_text


def normalize_text(value: str | None) -> str:
    if not value:
        return ""
    lowered = value.casefold()
    lowered = re.sub(r"[^a-z0-9+#/]+", " ", lowered)
    return re.sub(r"\s{2,}", " ", lowered).strip()


def tokenize(value: str | None) -> set[str]:
    return {token for token in normalize_text(value).split() if token}


def title_tokens(value: str | None) -> set[str]:
    return {token for token in tokenize(value) if token not in TITLE_STOPWORDS}


def title_matches(job_title: str, target_titles: list[str]) -> list[str]:
    job_tokens = title_tokens(job_title)
    hits: list[str] = []

    for target_title in target_titles:
        target_tokens = title_tokens(target_title)
        if not target_tokens:
            continue

        overlap = job_tokens & target_tokens
        required_overlap = 1 if len(target_tokens) == 1 else 2
        if len(overlap) >= min(required_overlap, len(target_tokens)):
            hits.append(target_title)

    return hits


def location_match(
    location: str | None,
    preferred_locations: list[str],
    remote_markers: list[str],
    allow_remote: bool,
) -> str | None:
    location_text = normalize_text(location)
    if not location_text:
        return None

    if not preferred_locations:
        return "any"

    for preferred in preferred_locations:
        preferred_text = normalize_text(preferred)
        if preferred_text and preferred_text in location_text:
            return preferred

    if allow_remote:
        for marker in remote_markers:
            marker_text = normalize_text(marker)
            if marker_text and marker_text in location_text:
                return marker

    return None


def keyword_hits(text: str, keywords: list[str]) -> list[str]:
    normalized_text = normalize_text(text)
    padded_text = f" {normalized_text} "
    hits: list[str] = []

    for keyword in keywords:
        keyword_text = normalize_text(keyword)
        if keyword_text and f" {keyword_text} " in padded_text:
            hits.append(keyword)

    return hits


def build_input_hash(job: dict[str, Any], matching_config: dict[str, Any], resume_text: str) -> str:
    payload = {
        "job": {
            "title": job.get("title"),
            "location": job.get("location"),
            "description": job.get("description"),
            "posted_date": job.get("posted_date"),
        },
        "matching_config": matching_config,
        "resume_text": resume_text,
        "version": MATCH_VERSION,
    }
    encoded = json.dumps(payload, sort_keys=True, ensure_ascii=True).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def should_score_job(job: dict[str, Any], input_hash: str, rescore_all: bool) -> bool:
    if rescore_all:
        return True

    match = job.get("match")
    if not isinstance(match, dict):
        return True

    if match.get("status") == "llm_error":
        return True

    return match.get("input_hash") != input_hash


def build_match_base(
    job: dict[str, Any],
    input_hash: str,
    matching_config: dict[str, Any],
    title_hit_titles: list[str],
    matched_location: str | None,
    keyword_hit_terms: list[str],
) -> dict[str, Any]:
    keyword_terms = list(matching_config.get("keyword_terms", []))
    keyword_score = 0.0
    if keyword_terms:
        keyword_score = round(len(keyword_hit_terms) / len(keyword_terms), 3)

    llm_config = dict(matching_config.get("llm", {}))
    return {
        "version": MATCH_VERSION,
        "input_hash": input_hash,
        "status": "insufficient_data",
        "stage_reached": 0,
        "title_hits": title_hit_titles,
        "location_match": matched_location,
        "keyword_hits": keyword_hit_terms,
        "keyword_score": keyword_score,
        "llm_score": None,
        "llm_rationale": None,
        "llm_model": llm_config.get("model"),
        "llm_provider_base_url": llm_config.get("base_url"),
        "llm_score_threshold": int(matching_config.get("llm_score_threshold", 70)),
        "scored_at": utcnow_iso(),
        "last_error": None,
    }


def build_llm_messages(job: dict[str, Any], resume_text: str) -> list[dict[str, str]]:
    system_prompt = (
        "You evaluate how well a resume fits a job posting. "
        "Return only a compact JSON object with keys score and rationale. "
        "score must be an integer from 0 to 100. "
        "rationale must be at most two sentences. "
        "Do not include markdown, code fences, or extra keys. "
        "Use only facts present in the resume and job description."
    )

    user_payload = {
        "resume": resume_text,
        "job": {
            "title": job.get("title"),
            "company_name": job.get("company_name"),
            "location": job.get("location"),
            "categories": job.get("categories"),
            "description": job.get("description"),
            "posted_date": job.get("posted_date"),
        },
        "task": (
            "Score overall fit for this role. "
            "Consider title alignment, skills overlap, domain fit, location suitability, "
            "and seniority. Penalize clear gaps. Reward strong direct overlap."
        ),
    }

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": json.dumps(user_payload, ensure_ascii=True)},
    ]


def chat_completions_url(base_url: str) -> str:
    return f"{base_url.rstrip('/')}/chat/completions"


def strip_thinking_tags(value: str) -> str:
    return re.sub(r"<think>.*?</think>", "", value, flags=re.DOTALL).strip()


def extract_json_object(value: str) -> dict[str, Any]:
    cleaned = strip_thinking_tags(value).strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)

    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise ValueError("Model response did not contain a JSON object.")

    snippet = cleaned[start : end + 1]
    return json.loads(snippet)


def parse_llm_result(raw_content: str) -> tuple[int, str]:
    payload = extract_json_object(raw_content)
    score = payload.get("score")
    rationale = clean_text(str(payload.get("rationale", "")))

    if score is None:
        raise ValueError("Model response is missing score.")
    if not rationale:
        raise ValueError("Model response is missing rationale.")

    numeric_score = int(round(float(score)))
    numeric_score = max(0, min(100, numeric_score))
    return numeric_score, rationale


def call_llm(
    session: requests.Session,
    llm_config: dict[str, Any],
    job: dict[str, Any],
    resume_text: str,
) -> tuple[int, str]:
    api_key_env = str(llm_config.get("api_key_env", "DEEPSEEK_API_KEY"))
    api_key = os.getenv(api_key_env)
    if not api_key:
        raise RuntimeError(f"Missing API key env var: {api_key_env}")

    payload = {
        "model": llm_config.get("model", "deepseek-chat"),
        "messages": build_llm_messages(job, resume_text),
        "temperature": float(llm_config.get("temperature", 0.1)),
        "max_tokens": int(llm_config.get("max_output_tokens", 180)),
    }
    if llm_config.get("response_format") == "json_object":
        payload["response_format"] = {"type": "json_object"}

    response = session.post(
        chat_completions_url(str(llm_config.get("base_url", "https://api.deepseek.com"))),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=float(llm_config.get("timeout_seconds", 60)),
    )
    response.raise_for_status()
    body = response.json()

    choices = body.get("choices")
    if not choices:
        raise RuntimeError("LLM response did not contain choices.")

    message = choices[0].get("message", {})
    content = message.get("content", "")
    if isinstance(content, list):
        parts = [str(part.get("text", "")) for part in content if isinstance(part, dict)]
        content = "\n".join(parts)
    if not isinstance(content, str):
        raise RuntimeError("LLM response content was not a string.")

    return parse_llm_result(content)


def evaluate_job(
    job: dict[str, Any],
    matching_config: dict[str, Any],
    resume_text: str,
    session: requests.Session,
) -> dict[str, Any]:
    input_hash = build_input_hash(job, matching_config, resume_text)
    target_titles = [str(value) for value in matching_config.get("target_titles", [])]
    preferred_locations = [str(value) for value in matching_config.get("preferred_locations", [])]
    remote_markers = [str(value) for value in matching_config.get("remote_markers", [])]
    keyword_terms = [str(value) for value in matching_config.get("keyword_terms", [])]
    allow_remote = bool(matching_config.get("allow_remote", False))
    min_keyword_hits = int(matching_config.get("min_keyword_hits", 1))

    title_hit_titles = title_matches(str(job.get("title") or ""), target_titles)
    matched_location = location_match(
        str(job.get("location") or ""),
        preferred_locations,
        remote_markers,
        allow_remote,
    )
    combined_text = clean_text(f"{job.get('title') or ''}\n{job.get('description') or ''}")
    keyword_hit_terms = keyword_hits(combined_text, keyword_terms)

    match = build_match_base(
        job=job,
        input_hash=input_hash,
        matching_config=matching_config,
        title_hit_titles=title_hit_titles,
        matched_location=matched_location,
        keyword_hit_terms=keyword_hit_terms,
    )

    description = clean_text(str(job.get("description") or ""))
    if not description:
        match["status"] = "insufficient_data"
        match["last_error"] = "Job description is empty."
        return match

    if not title_hit_titles:
        match["status"] = "filtered_title"
        match["stage_reached"] = 1
        return match

    match["stage_reached"] = 1
    if not matched_location:
        match["status"] = "filtered_location"
        match["stage_reached"] = 2
        return match

    match["stage_reached"] = 2
    if len(keyword_hit_terms) < min_keyword_hits:
        match["status"] = "filtered_keyword"
        match["stage_reached"] = 3
        return match

    match["stage_reached"] = 3
    try:
        llm_score, llm_rationale = call_llm(
            session=session,
            llm_config=dict(matching_config.get("llm", {})),
            job=job,
            resume_text=resume_text,
        )
    except Exception as exc:
        match["status"] = "llm_error"
        match["stage_reached"] = 3
        match["last_error"] = str(exc)
        return match

    match["status"] = "scored"
    match["stage_reached"] = 4
    match["llm_score"] = llm_score
    match["llm_rationale"] = llm_rationale
    match["last_error"] = None
    return match


def summarize_matches(matches: list[dict[str, Any]], skipped: int, total_candidates: int) -> str:
    counts = {
        "filtered_title": 0,
        "filtered_location": 0,
        "filtered_keyword": 0,
        "scored": 0,
        "llm_error": 0,
        "insufficient_data": 0,
    }

    for match in matches:
        status = str(match.get("status"))
        if status in counts:
            counts[status] += 1

    return (
        f"{total_candidates} candidates | "
        f"{skipped} skipped | "
        f"{counts['filtered_title']} title_filtered | "
        f"{counts['filtered_location']} location_filtered | "
        f"{counts['filtered_keyword']} keyword_filtered | "
        f"{counts['scored']} scored | "
        f"{counts['llm_error']} llm_errors | "
        f"{counts['insufficient_data']} insufficient_data"
    )


def main() -> None:
    args = parse_args()
    load_dotenv(ENV_PATH)
    matching_config = load_matching_config()
    jobs = load_jobs_store()
    resume_text = load_resume_text()

    selected_jobs: list[dict[str, Any]] = []
    for job in jobs:
        if args.company and str(job.get("company_id")) != args.company:
            continue
        if args.job_id and str(job.get("id")) != args.job_id:
            continue
        selected_jobs.append(job)
    selected_ids = {str(job.get("id")) for job in selected_jobs}

    session = requests.Session()
    updated_jobs: list[dict[str, Any]] = []
    scored_matches: list[dict[str, Any]] = []
    skipped = 0

    for job in jobs:
        if str(job.get("id")) not in selected_ids:
            updated_jobs.append(job)
            continue

        input_hash = build_input_hash(job, matching_config, resume_text)
        if not should_score_job(job, input_hash, args.rescore_all):
            skipped += 1
            updated_jobs.append(job)
            continue

        match = evaluate_job(
            job=job,
            matching_config=matching_config,
            resume_text=resume_text,
            session=session,
        )
        scored_matches.append(match)

        updated_job = dict(job)
        updated_job["match"] = match
        updated_jobs.append(updated_job)

    if not args.dry_run:
        write_jobs_store(updated_jobs)

    print(summarize_matches(scored_matches, skipped=skipped, total_candidates=len(selected_jobs)))


if __name__ == "__main__":
    main()
