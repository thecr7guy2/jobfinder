# Phase 2 Plan: DeepSeek-Based Matching

## Summary

Build a Phase 2 matching pipeline that reads jobs from `data/jobs.json`, runs three cheap deterministic filters, and sends only shortlisted jobs to the DeepSeek API for final scoring.

Defaults locked for this plan:
- matching preferences live in `config/matching.yaml`
- scoring is incremental by default: only new or changed jobs are rescored
- the LLM step uses a provider-configurable OpenAI-compatible HTTP client, currently pointed at DeepSeek
- `data/jobs.json` remains the single write target for match results

## Key Changes

- Add `config/matching.yaml` with:
  - `target_titles`
  - `preferred_locations`
  - `allow_remote`
  - `keyword_terms`
  - `min_keyword_hits`
  - `llm_score_threshold`
  - `llm.base_url`
  - `llm.model`
  - `llm.api_key_env`
  - `llm.timeout_seconds`
  - `llm.api_style`
- Set `llm.api_style` to `openai_compatible` for v1.
- Add `data/resume.md` as the resume input.
- Add `match_jobs.py` with CLI flags:
  - `--company <id>`
  - `--job-id <id>`
  - `--rescore-all`
  - `--dry-run`
- Deterministic stages:
  - title filter
  - location filter
  - keyword overlap heuristic
- Hosted LLM stage:
  - call the DeepSeek API, not a local model
  - use the OpenAI-compatible `/chat/completions` request shape
  - pass compact job data plus resume text
  - require strict JSON response with `score` and `rationale`
- Persist per-job match data under `match`:
  - `version`
  - `input_hash`
  - `status`
  - `stage_reached`
  - `title_hits`
  - `location_match`
  - `keyword_hits`
  - `keyword_score`
  - `llm_score`
  - `llm_rationale`
  - `llm_model`
  - `llm_provider_base_url`
  - `llm_score_threshold`
  - `scored_at`
  - `last_error`
- Incremental scoring rule:
  - score jobs with no `match`
  - rescore jobs whose relevant fields changed
  - `--rescore-all` overrides skipping
- Failure handling:
  - if pre-LLM filters fail, persist the filter result and skip API usage
  - if the API call fails or returns invalid JSON, mark `llm_error` and retry on a later run

## To-Do List

- Create `config/matching.yaml` with default title, location, keyword, threshold, and hosted API settings.
- Add `data/resume.md` placeholder and README instructions.
- Implement config loading and resume loading.
- Implement job fingerprinting for incremental rescoring.
- Implement title filtering.
- Implement location filtering, including remote handling.
- Implement keyword scoring and shortlist thresholding.
- Implement the DeepSeek API client using `requests`.
- Implement strict JSON parsing and score validation.
- Merge `match` results back into `data/jobs.json`.
- Add CLI summary output for scanned, skipped, filtered, LLM-called, scored, and errored jobs.
- Update `README.md` with Phase 2 setup and usage.

## Test Plan

- Unit test title filtering for pass/fail cases.
- Unit test location filtering for NL-only and remote-allowed cases.
- Unit test keyword scoring for exact hits, no hits, and duplicate terms.
- Unit test incremental rescoring based on changed input fields.
- Unit test API response parsing for valid JSON, malformed JSON, missing fields, and out-of-range scores.
- Integration test the full pipeline with a mocked hosted API.
- Acceptance checks:
  - first run scores all eligible jobs
  - second run skips unchanged jobs
  - `--rescore-all` rescans everything
  - filtered jobs never trigger an API call

## Assumptions

- Phase 2 uses DeepSeek Chat (`deepseek-chat`) by default through an OpenAI-compatible API shape.
- Default score threshold is `70` for later reuse in Phase 3 alerts.
- No separate matches file will be added; `data/jobs.json` stays the source of truth.
