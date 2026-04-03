# JobFinder

JobFinder is a personal job discovery and application tracking system.

The intended end state is:
- monitor target company career pages
- normalize and deduplicate jobs into a repo-backed store
- score roles against a resume
- alert on strong matches via Telegram
- review jobs in a GitHub Pages dashboard
- generate tailored cover letters on approval

Everything is designed to run on GitHub infrastructure: Actions for scheduling, Pages for the frontend, and the repository itself as the database.

## Current Status

The repository currently implements Phase 1 only: job scraping, normalization, and cache-backed refresh.

Active sources today:
- Booking.com
- TNO
- Adyen
- ABN AMRO
- ING

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
GitHub Pages dashboard
     |
     |-- Review job -> Apply / Skip
     |-- Generate cover letter -> cover_letters/{company}-{role}-{date}.md
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
- [`fetch_jobs.py`](/Users/sai/Documents/Projects/jobfinder/fetch_jobs.py)
- [`data/jobs.json`](/Users/sai/Documents/Projects/jobfinder/data/jobs.json)
- `data/cache/`

Done when:
- `uv run python fetch_jobs.py` collects jobs for configured companies
- rerunning within TTL reuses cache instead of refetching

### Phase 2 - Matching

Goal: score each new job against a plain-text resume using a cheap-first staged pipeline.

Planned deliverables:
- `data/resume.txt`
- `match_jobs.py`
- match data written back into `data/jobs.json`

Planned stages:
1. title filter
2. location filter
3. keyword overlap heuristic
4. LLM score for shortlisted roles only

### Phase 3 - Telegram Alerts

Goal: notify when a new job crosses the score threshold.

Planned deliverables:
- `notify.py`
- deduplicated alerts recorded in `jobs.json`
- scraper failure warnings when a source unexpectedly goes empty

### Phase 4 - GitHub Pages Dashboard

Goal: provide a static dashboard to review jobs and track application status.

Planned views:
- Inbox
- Tracker
- Dashboard

Planned approach:
- load `data/jobs.json` from the repository
- update state through the GitHub API
- redeploy Pages on repo change

### Phase 5 - Cover Letter Generation

Goal: generate a tailored cover letter when a job is approved.

Planned deliverables:
- `data/cover_letter_template.md`
- `generate_cover_letter.py`
- `cover_letters/*.md`
- Telegram file delivery for generated letters

### Phase 6 - GitHub Actions Automation

Goal: run the full pipeline without manual intervention.

Planned workflows:
- `scrape.yml`: fetch, match, notify
- `cover_letter.yml`: generate approved cover letters
- `deploy.yml`: publish GitHub Pages

Expected secrets:
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `GEMINI_API_KEY`
- `GH_PAT`

## Repository Layout

```text
jobfinder/
├── config/
│   ├── companies.yaml
│   └── sources.yaml
├── data/
│   ├── cache/
│   └── jobs.json
├── docs/
│   └── company_source_onboarding.md
├── plans/
│   ├── masterplan.md
│   └── scraper_plan.md
├── scrapers/
│   ├── abn_amro.py
│   ├── base.py
│   ├── greenhouse.py
│   ├── html.py
│   └── icims.py
├── fetch_jobs.py
├── pyproject.toml
└── uv.lock
```

## Current Usage

This project uses `uv` and currently supports the scraper pipeline only.

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
```

## Data Model

Current normalized jobs are stored in [`data/jobs.json`](/Users/sai/Documents/Projects/jobfinder/data/jobs.json).

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

The planned end-state schema also includes match metadata, alert metadata, and application lifecycle state.

## Tech Choices

Current stack:
- Python 3.11+
- `requests`
- `beautifulsoup4`
- `PyYAML`
- JSON files in-repo for state

Planned additions:
- LLM-based matching
- Telegram notifications
- GitHub Pages frontend
- GitHub Actions automation

## Notes

- [`plans/masterplan.md`](/Users/sai/Documents/Projects/jobfinder/plans/masterplan.md) is the product blueprint.
- [`plans/scraper_plan.md`](/Users/sai/Documents/Projects/jobfinder/plans/scraper_plan.md) covers the current scraper-focused execution work.
- [`docs/company_source_onboarding.md`](/Users/sai/Documents/Projects/jobfinder/docs/company_source_onboarding.md) documents how to evaluate and add new company sources.
