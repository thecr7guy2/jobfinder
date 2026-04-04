# Phase 3 Plan: Telegram Alerts

## Summary

Build `notify.py` — a deduplicating Telegram notifier that reads scored jobs from
`data/jobs.json`, sends one message per newly qualified high-match job, and warns
when a source returns zero jobs for 2 consecutive runs.

Locked decisions for this phase:
- alert threshold: `70` (aligned with `match.llm_score_threshold`)
- alert style: one Telegram message per job, sorted by score descending
- links in alerts: direct job URL only (no dashboard URL until Phase 4)
- failure warnings: trigger after `0 jobs` in `2` consecutive runs, send once per failure event
- Telegram client: raw `requests` to Bot API — no additional SDK (consistent with Phase 1/2)
- credentials: `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` from `.env` (already present)
- no new config file — threshold comes from `matching.yaml`, credentials from `.env`
- `fetch_jobs.py` stays unchanged — `notify.py` computes source job counts from `jobs.json` directly

---

## What Gets Built

### `notify.py` — entry point

CLI flags:
- `--dry-run` — print what would be sent to stdout; make no writes, no HTTP calls
- `--company <id>` — scope job alerts to one company only
- `--failures-only` — skip job alerts, only check and send source failure warnings
- `--resend` — re-alert jobs already marked `alerted: true` (testing / forced resend)

Default behavior: send job alerts then source failure warnings, print a run summary.

Run order per pipeline cycle: `fetch_jobs.py` → `match_jobs.py` → `notify.py`

Responsibilities:
1. Load `data/jobs.json`
2. Find alertable jobs:
   - `match.status == "scored"`
   - `match.llm_score >= match.llm_score_threshold` (default `70`)
   - no prior `alerted` metadata (or `--resend` is set)
3. Sort alertable jobs by `match.llm_score` descending
4. For each job: format message → send → on success write alert metadata back to `data/jobs.json`; on failure log error, do not mark alerted, continue to next job
5. Apply rate limiting: `0.05 s` sleep between sends to stay well under the Telegram Bot API 30 msg/s limit
6. Load `data/source_health.json`, compute current job counts per active source from `jobs.json`
7. Update `consecutive_zero_job_runs` per source, send failure warnings where triggered
8. Print run summary: N sent, N skipped (already alerted), N failed to send, N source warnings

### `data/source_health.json` — source run state

Written by `notify.py` after each run. Computed from the current state of `jobs.json`
(no changes needed to `fetch_jobs.py`).

Schema:
```json
{
  "abn_amro": {
    "last_seen_job_count": 0,
    "consecutive_zero_job_runs": 2,
    "failure_alerted": true,
    "failure_alerted_at": "2026-04-04T18:00:00Z",
    "updated_at": "2026-04-04T18:00:00Z"
  },
  "booking_com": {
    "last_seen_job_count": 12,
    "consecutive_zero_job_runs": 0,
    "failure_alerted": false,
    "failure_alerted_at": null,
    "updated_at": "2026-04-04T18:00:00Z"
  }
}
```

Failure-alert lifecycle:
- count `0` on first run → increment counter, do not alert yet
- count `0` on second consecutive run → increment counter, send warning, set `failure_alerted: true`
- count `0` on subsequent runs → counter increments but no further alert (already alerted)
- count `> 0` on any run → reset `consecutive_zero_job_runs` to `0`, reset `failure_alerted` to `false`
  (source recovered; next failure event will alert fresh)

If `source_health.json` is missing on first run: create it, skip the failure check for that run.

---

## Alert Message Formats

### Job alert

```
*[85/100] Senior ML Engineer — Booking.com*
📍 Amsterdam, Netherlands
💬 _Strong Python and ML overlap. Missing Rust experience._

🔗 [View job](https://jobs.booking.com/booking/jobs/27758)
```

Rules:
- Score and title in bold, score first for quick triage
- Location on its own line
- Rationale in italic, truncated to 150 chars with `…` if longer
- Job URL as inline link, `disable_web_page_preview: true` to keep chat clean
- Telegram `parse_mode: Markdown`

### Source failure warning

```
⚠️ *Source warning: ABN AMRO*
No jobs returned for 2 consecutive runs.
Observed count: 0
Timestamp: 2026-04-04T18:00:00Z
```

---

## Schema Changes to `data/jobs.json`

Four fields added at the top level of each job object after a successful alert send:

| Field | Type | Written by | Meaning |
|---|---|---|---|
| `alerted` | `bool` | `notify.py` | Whether a Telegram alert was sent |
| `alerted_at` | `str \| null` | `notify.py` | ISO 8601 UTC timestamp of the send |
| `alert_score` | `int \| null` | `notify.py` | `llm_score` value at time of alert |
| `alert_message_id` | `int \| null` | `notify.py` | Telegram message ID returned by the API |

`alert_score` guards against score drift: if a job is rescored later, the score that
triggered the alert is still on record. `alert_message_id` enables future features
(e.g. editing the alert message from a Phase 4 dashboard action).

Fields are only written on a successful API response. A failed send leaves the job
unalerted so the next run retries it.

---

## To-Do List

- [ ] Implement `notify.py`:
  - [ ] Load `.env` and read `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
  - [ ] Read `llm_score_threshold` from `config/matching.yaml`
  - [ ] Implement Telegram Bot API client: `POST /sendMessage`, parse response, return `message_id`
  - [ ] Implement job selection: status, score, alerted filters
  - [ ] Sort selected jobs by `llm_score` descending
  - [ ] Implement message formatter for job alerts (Markdown, 150-char rationale truncation)
  - [ ] Implement per-job send loop with `0.05 s` rate-limit sleep
  - [ ] Write `alerted`, `alerted_at`, `alert_score`, `alert_message_id` back to `data/jobs.json` on success only
  - [ ] Implement `data/source_health.json` read/write helpers
  - [ ] Compute current job count per active source from `jobs.json`
  - [ ] Implement consecutive-zero tracking and recovery reset
  - [ ] Implement failure warning dedupe (`failure_alerted` flag)
  - [ ] Implement message formatter for failure warnings
  - [ ] CLI flags: `--dry-run`, `--company`, `--failures-only`, `--resend`
  - [ ] Print run summary
- [ ] Update `README.md`:
  - [ ] Add Phase 3 setup section: required env vars, how to run, dry-run command
  - [ ] Document `alerted` fields and `source_health.json`
  - [ ] Update Current Status to "Phases 1, 2, and 3"

---

## Acceptance Criteria

- **Job alert**: a scored job with `llm_score >= 70` and no prior alert metadata produces one Telegram message and gets all four alert fields written to `data/jobs.json`
- **Deduplication**: running `notify.py` twice sends no duplicate for the same job
- **Partial failure**: if one send fails, remaining jobs are still processed; the failed job is not marked alerted
- **Sort order**: highest-scoring job arrives first in Telegram
- **Dry run**: `--dry-run` makes zero writes and zero HTTP calls; prints exactly what would be sent
- **Resend**: `--resend` re-sends already-alerted jobs and overwrites their alert metadata
- **Failures-only**: `--failures-only` skips all job alerts, only evaluates source health
- **Source warning**: a source with 2 consecutive zero-job runs triggers exactly one warning; a third zero-job run sends no additional warning; recovery then re-failure sends a new warning
- **No LLM calls**: `notify.py` makes zero LLM API calls

---

## Test Plan

### Unit tests

- Job selection:
  - scored job above threshold, not alerted → selected
  - scored job below threshold → skipped
  - filtered/errored job → skipped regardless of score
  - already alerted job → skipped (selected when `--resend`)
- Message formatter:
  - verify exact output string against a fixture job
  - rationale exactly 150 chars → not truncated
  - rationale 151 chars → truncated with `…`
- Telegram client:
  - successful response → returns `message_id`
  - HTTP error response → raises, does not return message_id
  - malformed JSON response → raises, does not return message_id
- Source health logic:
  - 1 zero-job run → counter `1`, no alert sent
  - 2 consecutive zero-job runs → counter `2`, alert sent, `failure_alerted: true`
  - 3rd consecutive zero-job run → counter `3`, no additional alert
  - recovery (count > 0) → counter reset to `0`, `failure_alerted` reset to `false`
  - recovery followed by 2 more zero runs → new alert sent

### Integration tests

- Mock Telegram API endpoint: run full `notify.py`, assert correct POST payloads, assert `alerted` fields written
- `--dry-run`: assert zero writes to `jobs.json` and `source_health.json`, assert zero HTTP calls

---

## Assumptions

- Telegram Bot has already been created via BotFather; credentials are in `.env`
- `python-dotenv` is already a project dependency (used by `match_jobs.py`)
- `match_jobs.py` must run before `notify.py`; `notify.py` does not trigger or re-run matching
- Jobs below threshold are silently skipped; no digest or secondary alert in Phase 3
- `notify.py` processes all unalerted qualifying jobs per run, regardless of how many there are; batching is not needed at current scale

---

## Open Questions

- [ ] Should the job alert include the `keyword_hits` list (e.g. `python, sql, mlops`) as a quick skill summary? Decide when implementing the message formatter; easy to add.
- [ ] Should jobs scoring 50–69 get a lower-priority alert style (e.g. no emoji, no bold)? Deferred to Phase 4 inbox design.
- [ ] Rate-limit sleep of `0.05 s` — adjust if batches ever exceed ~20 jobs per run.
