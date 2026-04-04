# JobFinder

JobFinder is a personal job discovery and application tracking system.

The intended end state is:
- monitor target company career pages
- normalize and deduplicate jobs into a repo-backed store
- score roles against a resume
- alert on strong matches via Telegram
- review jobs in a protected Vercel dashboard
- generate tailored cover letters on approval

The current system runs across GitHub, Vercel, and Postgres: GitHub Actions for automation, Vercel for the frontend, and Postgres for dashboard-owned state and stored cover letters.

## Current Status

The repository currently implements Phases 1 through 6 in practical terms: job scraping, DeepSeek-based matching, Telegram alerting, a protected dashboard, Postgres-backed application and cover-letter storage, dashboard-triggered PDF compilation via GitHub Actions, and scheduled scrape/match/notify automation.

Active sources today:
- Booking.com
- TNO
- Adyen
- ABN AMRO
- ING
- Albert Heijn

Current implementation rules:
- prefer direct APIs when available
- use static HTML when possible
- skip sources that require browser automation

## Problem

Most missed opportunities happen because the role was never seen in time. JobFinder is meant to solve that by continuously watching a small set of target companies and surfacing relevant openings automatically.

## Planned User Flow

```text
companies.yaml
     |
     v
fetch_jobs.py  -- cache check --> scrape / API call
     |
     v
data/jobs.json  (normalized, deduplicated)
     |
     v
match_jobs.py  -- staged filter --> LLM score
     |
     v
Telegram alert  (score >= threshold)
     |
     v
Vercel dashboard
     |
     |-- Review job -> Apply / Skip
     |-- Generate cover letter -> stored in Postgres
     |-- Compile/download PDF -> Cover Letters page + GitHub Actions + Postgres
     `-- Track status -> Applied / Interview / Offer / Rejected
```

## Roadmap

### Phase 1 - Scraper

Goal: fetch jobs from target companies into one normalized JSON store with TTL-based caching.

Status: implemented.

Main deliverables in this repo:
- [`config/companies.yaml`](/Users/sai/Documents/Projects/jobfinder/config/companies.yaml)
- [`config/sources.yaml`](/Users/sai/Documents/Projects/jobfinder/config/sources.yaml)
- [`scrapers/base.py`](/Users/sai/Documents/Projects/jobfinder/scrapers/base.py)
- [`scrapers/icims.py`](/Users/sai/Documents/Projects/jobfinder/scrapers/icims.py)
- [`scrapers/html.py`](/Users/sai/Documents/Projects/jobfinder/scrapers/html.py)
- [`scrapers/greenhouse.py`](/Users/sai/Documents/Projects/jobfinder/scrapers/greenhouse.py)
- [`scrapers/abn_amro.py`](/Users/sai/Documents/Projects/jobfinder/scrapers/abn_amro.py)
- [`scrapers/ing.py`](/Users/sai/Documents/Projects/jobfinder/scrapers/ing.py)
- [`scrapers/albert_heijn.py`](/Users/sai/Documents/Projects/jobfinder/scrapers/albert_heijn.py)
- [`fetch_jobs.py`](/Users/sai/Documents/Projects/jobfinder/fetch_jobs.py)
- [`data/jobs.json`](/Users/sai/Documents/Projects/jobfinder/data/jobs.json)
- `data/cache/`

Done when:
- `uv run python fetch_jobs.py` collects jobs for configured companies
- rerunning within TTL reuses cache instead of refetching

### Phase 2 - Matching

Goal: score each new job against a plain-text resume using a cheap-first staged pipeline.

Status: implemented.

Main deliverables in this repo:
- [`config/matching.yaml`](/Users/sai/Documents/Projects/jobfinder/config/matching.yaml)
- [`data/resume.md`](/Users/sai/Documents/Projects/jobfinder/data/resume.md)
- [`match_jobs.py`](/Users/sai/Documents/Projects/jobfinder/match_jobs.py)
- match data written back into `data/jobs.json`

Current stages:
1. title filter
2. location filter
3. keyword overlap heuristic
4. DeepSeek API score for shortlisted roles only

### Phase 3 - Telegram Alerts

Goal: notify when a new job crosses the score threshold.

Status: implemented.

Main deliverables in this repo:
- [`notify.py`](/Users/sai/Documents/Projects/jobfinder/notify.py)
- alert metadata written back into `data/jobs.json`
- [`data/source_health.json`](/Users/sai/Documents/Projects/jobfinder/data/source_health.json) created on first real notifier run

Current behavior:
- sends one Telegram message per newly qualified job
- deduplicates by top-level alert metadata on each job
- warns when a source returns zero jobs for 2 consecutive runs

### Phase 4 - Vercel Dashboard

Goal: provide a protected dashboard to review jobs and track application status.

Status: implemented.

Planned views:
- Inbox
- Tracker
- Dashboard

Current approach:
- load `data/jobs.json` from the repository
- store application state in Postgres
- protect owner actions with server routes
- deploy on Vercel

### Phase 5 - Cover Letter Generation

Goal: generate a tailored cover letter when a job is approved.

Current deliverables:
- `data/cover_letter_template.tex`
- `config/cover_letter_prompt.md`
- `app/api/cover-letter/generate`
- `app/api/cover-letter/compile`
- `app/api/cover-letter/pdf`
- on-demand generation from the dashboard
- cover letter storage in Postgres
- Cover Letters page for stored drafts and PDFs
- dashboard-triggered PDF compilation with Tectonic
- direct PDF download from the dashboard after compilation

### Phase 6 - GitHub Actions Automation

Goal: run the full pipeline without manual intervention.

Current workflows:
- `scrape.yml`: fetch, match, notify
- `cover_letter_pdf.yml`: compile stored cover letters to PDF and persist the result back to Postgres

Expected secrets:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `DEEPSEEK_API_KEY`
- `VIEWER_ACCESS_CODE`
- `OWNER_ACCESS_CODE`
- `DATABASE_URL` or `POSTGRES_URL`

## Repository Layout

```text
jobfinder/
├── .github/
│   └── workflows/
│       ├── cover_letter_pdf.yml
│       └── scrape.yml
├── config/
│   ├── companies.yaml
│   ├── cover_letter_prompt.md
│   ├── matching.yaml
│   └── sources.yaml
├── data/
│   ├── cache/
│   ├── cover_letter_template.tex
│   ├── jobs.json
│   └── resume.md
├── lib/
│   ├── cover-letter/
│   └── dashboard/
├── app/
│   ├── api/
│   │   └── cover-letter/
│   ├── dashboard/
│   ├── cover-letters/
│   ├── inbox/
│   ├── login/
│   └── tracker/
├── docs/
│   └── company_source_onboarding.md
├── plans/
│   ├── masterplan.md
│   ├── phase2_matching_plan.md
│   └── scraper_plan.md
├── scripts/
│   ├── compile-cover-letter-pdf.mjs
│   └── sync-resume-to-postgres.mjs
├── scrapers/
│   ├── abn_amro.py
│   ├── albert_heijn.py
│   ├── __init__.py
│   ├── base.py
│   ├── greenhouse.py
│   ├── html.py
│   ├── ing.py
│   └── icims.py
├── fetch_jobs.py
├── dashboard-tests/
│   ├── auth.test.ts
│   └── data.test.ts
├── components/
├── match_jobs.py
├── notify.py
├── package.json
├── pyproject.toml
├── tests/
│   └── test_match_jobs.py
├── tsconfig.json
└── uv.lock
```

## Current Usage

This project uses `uv` and currently supports the scraper pipeline plus Phase 2 matching.

Install dependencies:

```bash
uv sync
```

Fetch all active companies:

```bash
uv run python fetch_jobs.py
```

Force refresh all active companies:

```bash
uv run python fetch_jobs.py --force
```

Fetch one company:

```bash
uv run python fetch_jobs.py --company booking_com
uv run python fetch_jobs.py --company tno
uv run python fetch_jobs.py --company adyen
uv run python fetch_jobs.py --company abn_amro
uv run python fetch_jobs.py --company ing
uv run python fetch_jobs.py --company albert_heijn
```

Configure matching preferences in `config/matching.yaml`.
If you want to use a different DeepSeek model than the default, update
`matching.llm.model` there before running the matcher.

Main secrets now live in `.env`:

```bash
DEEPSEEK_API_KEY=your_key_here
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
VIEWER_ACCESS_CODE=your_viewer_code_here
OWNER_ACCESS_CODE=your_owner_code_here
DATABASE_URL=your_postgres_connection_string
```

`DEEPSEEK_API_KEY` is used by matching. `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`
are used by `notify.py`. `VIEWER_ACCESS_CODE` and `OWNER_ACCESS_CODE` protect the
dashboard. `DATABASE_URL` or `POSTGRES_URL` is used for owner status write-back
and persisted application state, resume storage, and cover letter storage.
`DEEPSEEK_API_KEY` is also used by the dashboard cover-letter generation route.

For cover letter generation in production, the dashboard reads the resume from
Postgres instead of from the local gitignored file. After you configure
`DATABASE_URL` or `POSTGRES_URL`, sync your local resume once with:

```bash
pnpm sync:resume
```

That command uploads [`data/resume.md`](/Users/sai/Documents/Projects/jobfinder/data/resume.md) into the
`profile_documents` table under the `resume_markdown` key.

Compile a stored cover letter PDF locally:

```bash
pnpm compile:cover-letter-pdf -- --job-id ing::35870385728
```

GitHub Actions now includes:
- `Scrape Jobs` for scheduled/manual fetch + match + notify + repo state commit-back
- `Cover Letter PDF` for manual Tectonic PDF compilation from stored Postgres cover letters

If you prefer exporting the current required key directly:

```bash
export DEEPSEEK_API_KEY=your_key_here
```

Score all jobs:

```bash
uv run python match_jobs.py
```

Preview matching without writing `data/jobs.json`:

```bash
uv run python match_jobs.py --dry-run --rescore-all
```

Score one company or one job:

```bash
uv run python match_jobs.py --company booking_com
uv run python match_jobs.py --job-id abn_amro::9162
```

Send Telegram alerts for newly qualified jobs:

```bash
uv run python notify.py
```

Preview alerts without sending or writing:

```bash
uv run python notify.py --dry-run
```

Scope job alerts or check only source failures:

```bash
uv run python notify.py --company booking_com
uv run python notify.py --failures-only
uv run python notify.py --dry-run --resend
```

Run the dashboard locally:

```bash
pnpm install
pnpm dev
```

Then open `http://localhost:3000/login` and enter either the viewer code or owner code
from `.env`.

## Data Model

Current normalized and matched jobs are stored in [`data/jobs.json`](/Users/sai/Documents/Projects/jobfinder/data/jobs.json).

Each record includes core fields such as:
- `id`
- `company_id`
- `company_name`
- `title`
- `url`
- `location`
- `categories`
- `description`
- `posted_date`
- `first_seen`
- `last_seen`
- `source`

The current schema includes match metadata from Phase 2 and alert metadata from Phase 3. The planned end-state schema will add application lifecycle state.

## Tech Choices

Current stack:
- Python 3.11+
- `requests`
- `beautifulsoup4`
- `PyYAML`
- DeepSeek API for scoring
- JSON files in-repo for scraped/matched job state
- Telegram notifications
- Next.js on Vercel for the dashboard
- Postgres for application state, resume storage, and cover letters
- GitHub Actions automation

## Notes

- [`plans/masterplan.md`](/Users/sai/Documents/Projects/jobfinder/plans/masterplan.md) is the product blueprint.
- [`plans/scraper_plan.md`](/Users/sai/Documents/Projects/jobfinder/plans/scraper_plan.md) documents the completed Phase 1 scraper implementation.
- [`plans/phase2_matching_plan.md`](/Users/sai/Documents/Projects/jobfinder/plans/phase2_matching_plan.md) documents the implemented Phase 2 matching pipeline.
- [`config/sources.yaml`](/Users/sai/Documents/Projects/jobfinder/config/sources.yaml) is the source registry and investigation log.
- [`docs/company_source_onboarding.md`](/Users/sai/Documents/Projects/jobfinder/docs/company_source_onboarding.md) documents how to evaluate and add new company sources.
