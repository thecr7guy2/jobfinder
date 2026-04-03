# JobFinder Scraper — Plan

## Goal
A single script (`fetch_jobs.py`) that reads a list of target companies, scrapes their job listings using the right strategy per company, caches results to avoid redundant API calls, normalizes everything to a common schema, and writes to a single `data/jobs.json` store.

---

## Directory Structure

```
jobfinder/
├── config/
│   └── companies.yaml        # One entry per company: name, url, scraper type, filters
├── scrapers/
│   ├── base.py               # Abstract base class all scrapers inherit from
│   ├── icims.py              # Booking.com (iCIMS JSON API)
│   ├── html.py               # TNO (BeautifulSoup static HTML)
│   └── playwright.py         # ASML and others (JS-rendered, built later)
├── data/
│   ├── cache/                # Raw per-company cache files (one JSON per company)
│   └── jobs.json             # Final normalized + merged job store
├── fetch_jobs.py             # Single entry point — run this to get all jobs
└── requirements.txt
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

## `companies.yaml` Shape

```yaml
companies:
  - id: booking_com
    name: Booking.com
    type: icims
    api_url: https://jobs.booking.com/api/jobs
    filters:
      location: Netherlands
      categories: "Data Science & Analytics|ML Engineering|ML Science"
    ttl_hours: 6

  - id: tno
    name: TNO
    type: html
    url: https://www.tno.nl/en/careers/vacancies/
    filters:
      "Zoe_Selected_facet:Careers Vakgebied": "759"
    selectors:
      job_card: "div.ipx-pt-vacancy"
      title: "h3"
      link: "a"
      location: "dd.extra-werklocatie"
    ttl_hours: 6

  # ASML — needs Playwright (JS-rendered), build later
  # - id: asml
  #   name: ASML
  #   type: playwright
  #   url: https://www.asml.com/en/careers/find-your-job
  #   ttl_hours: 6
```

---

## Scraper Types

| Type | Companies | Method | Status |
|---|---|---|---|
| `icims` | Booking.com | Direct JSON API (`/api/jobs`) | V1 |
| `html` | TNO | `requests` + BeautifulSoup | V1 |
| `playwright` | ASML | Headless browser | Later |

---

## Build Order

- [ ] `requirements.txt` and project skeleton
- [ ] `scrapers/base.py` — abstract base class with `fetch()` and `normalize()` interface
- [ ] `scrapers/icims.py` — Booking.com API scraper
- [ ] `scrapers/html.py` — TNO BeautifulSoup scraper
- [ ] `fetch_jobs.py` — orchestrator: cache logic + merge + dedup
- [ ] `config/companies.yaml` — wire up both companies
- [ ] End-to-end test: run once (fetches fresh), run again (hits cache)

---

## Known Companies + Scraper Strategy

| Company | URL | Type | Notes |
|---|---|---|---|
| Booking.com | jobs.booking.com/api/jobs | icims | Clean JSON API, filter by category + NL location |
| TNO | tno.nl/en/careers/vacancies/ | html | Server-rendered, `ipx-pt-vacancy` div cards |
| ASML | asml.com/en/careers/find-your-job | playwright | Next.js SPA, no public API found |

---

## Open Questions

- What other companies should be added?
- Should `fetch_jobs.py` also accept a `--company` flag to fetch just one company?
- TTL: 6 hours default — override per company in YAML?
