# JobFinder Scraper — Implemented Snapshot

## Goal
A single script (`fetch_jobs.py`) that reads a list of target companies, scrapes their job listings using the right strategy per company, caches results to avoid redundant API calls, normalizes everything to a common schema, and writes to a single `data/jobs.json` store.

---

## Directory Structure

```
jobfinder/
├── config/
│   ├── companies.yaml        # Runtime scraper config for active sources
│   └── sources.yaml          # Source registry and investigation notes
├── scrapers/
│   ├── base.py               # Abstract base class all scrapers inherit from
│   ├── icims.py              # Booking.com (iCIMS JSON API)
│   ├── html.py               # TNO (BeautifulSoup static HTML)
│   ├── greenhouse.py         # Adyen (Greenhouse API)
│   ├── abn_amro.py           # ABN AMRO vacancy API
│   ├── ing.py                # ING search API + detail pages
│   ├── albert_heijn.py       # Albert Heijn vacancy API
│   └── __init__.py           # Scraper registry
├── data/
│   ├── cache/                # Raw per-company cache files (one JSON per company)
│   └── jobs.json             # Final normalized + merged job store
├── fetch_jobs.py             # Single entry point — run this to get all jobs
└── docs/company_source_onboarding.md
```

---

## How `fetch_jobs.py` Works

1. Reads `config/companies.yaml`
2. For each company, picks the right scraper based on `type:` field
3. **Cache check**: if `data/cache/{company_id}.json` exists and is younger than TTL (default 6h), skip fetching and use cache
4. Otherwise fetch fresh, save raw response to cache
5. Normalize all jobs to common schema
6. Merge into `data/jobs.json` — deduplicate by `id`, update `last_seen` on existing, add new ones
7. Print summary: `X new | Y updated | Z total`

---

## Cache Design

Each `data/cache/{company_id}.json`:
```json
{
  "company_id": "booking_com",
  "fetched_at": "2026-04-03T10:00:00Z",
  "ttl_hours": 6,
  "raw_jobs": []
}
```

Cache stores **raw** pre-normalization data so you can re-normalize without re-fetching.
Force-refresh with `--force` flag on `fetch_jobs.py`.

---

## Normalized Job Schema (`data/jobs.json`)

```json
{
  "id": "booking_com::27758",
  "company_id": "booking_com",
  "company_name": "Booking.com",
  "title": "Senior ML Engineer I",
  "url": "https://jobs.booking.com/booking/jobs/27758",
  "location": "Amsterdam, Netherlands",
  "categories": ["ML Engineering"],
  "description": "...",
  "posted_date": "2026-01-14",
  "first_seen": "2026-04-03T10:00:00Z",
  "last_seen": "2026-04-03T10:00:00Z",
  "source": "icims_api"
}
```

---

## Source Registry vs Runtime Config

- `config/sources.yaml` records every investigated source, including active, skipped, and blocked sites.
- `config/companies.yaml` contains only active runtime scraper config used by `fetch_jobs.py`.
- `docs/company_source_onboarding.md` defines how a new source moves from investigation into runtime config.

---

## Scraper Types

| Type | Companies | Method | Status |
|---|---|---|---|
| `icims` | Booking.com | Direct JSON API (`/api/jobs`) | Implemented |
| `html` | TNO | `requests` + BeautifulSoup | Implemented |
| `greenhouse` | Adyen | Greenhouse Boards API | Implemented |
| `abn_amro` | ABN AMRO | Vacancy API + detail page metadata | Implemented |
| `ing` | ING | Search endpoint + detail pages | Implemented |
| `albert_heijn` | Albert Heijn | Vacancy API + detail page metadata | Implemented |
| `none` | ASML, Uber | Browser-only or unsupported | Skipped |

---

## Implemented Work

- `scrapers/base.py` provides shared request, normalization, and timestamp helpers.
- `fetch_jobs.py` supports cache-aware full runs and `--company <id>` scoped runs.
- Raw responses are cached in `data/cache/{company_id}.json`.
- Normalized records are merged into `data/jobs.json` with stable IDs, `first_seen`, and `last_seen`.
- Active source configuration lives in `config/companies.yaml`.
- Investigated source status and notes live in `config/sources.yaml`.

---

## Known Companies + Scraper Strategy

| Company | URL | Type | Notes |
|---|---|---|---|
| Booking.com | jobs.booking.com/api/jobs | icims | Clean JSON API, filter by category + NL location |
| TNO | tno.nl/en/careers/vacancies/ | html | Server-rendered, `ipx-pt-vacancy` div cards |
| Adyen | boards-api.greenhouse.io/v1/boards/adyen/jobs | greenhouse | Public Boards API with content support |
| ABN AMRO | werkenbijabnamro.nl/en/api/vacancy/ | abn_amro | Vacancy API plus JSON-LD detail pages |
| ING | careers.ing.com/en/search-jobs/resultspost | ing | Search endpoint plus server-rendered detail pages |
| Albert Heijn | werk.ah.nl/en/api/vacancy/ | albert_heijn | Vacancy API with XMLHttpRequest header |
| ASML | asml.com/en/careers/find-your-job | skipped | Browser-only under current no-Playwright rule |
| Uber | uber.com/nl/en/careers/list/ | skipped | No confirmed non-browser search endpoint |

---

## Resolved Decisions

- `fetch_jobs.py` supports `--company <id>` for scoped fetches.
- TTL remains configurable per company in `config/companies.yaml`.
- Playwright is intentionally not part of the implemented scraper stack.
