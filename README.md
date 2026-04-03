# JobFinder

JobFinder is a personal job discovery pipeline.

The current implementation is focused on Phase 1:

- fetch jobs from supported company career sources
- normalize them into one JSON store
- cache raw source responses
- make it easy to keep adding new companies over time

## Current Status

Phase 1 is implemented.

Supported active sources:

- Booking.com
- TNO
- Adyen

Investigated sources:

- ASML: skipped

The current project rule is:

- use direct APIs when available
- use static HTML when possible
- do not use Playwright
- skip sources that require browser automation

## Repository Structure

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
│   ├── __init__.py
│   ├── base.py
│   ├── greenhouse.py
│   ├── html.py
│   └── icims.py
├── fetch_jobs.py
├── pyproject.toml
└── uv.lock
```

## Important Files

### `config/companies.yaml`

Runtime scraper configuration for active sources only.

This includes:

- source URLs
- scraper type
- exact working filters
- TTL settings
- selectors or URL templates

### `config/sources.yaml`

Source registry for all evaluated companies.

This is where we track:

- source status
- extraction method
- scraper type
- notes
- blockers
- last verification date

### `docs/company_source_onboarding.md`

The procedure for evaluating and adding a new company source.

Use this whenever a new careers URL is introduced.

## Implemented Scraper Types

### `icims`

Used for Booking.com.

Current behavior:

- calls the public API directly
- applies exact runtime query filters
- paginates through results
- normalizes jobs into the common schema

### `html`

Used for TNO.

Current behavior:

- fetches the filtered listing page
- follows detail pages
- extracts normalized fields from server-rendered HTML
- stores raw detail-derived payloads in cache

### `greenhouse`

Used for Adyen.

Current behavior:

- calls the public Greenhouse Boards API directly
- fetches jobs with embedded job content
- applies exact runtime filters for location and team
- normalizes jobs into the common schema

## Normalized Output

The normalized job store is written to:

- [data/jobs.json](/Users/sai/Documents/Projects/jobfinder/data/jobs.json)

Each job record includes fields such as:

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

## Cache Behavior

Each company has a raw cache file in:

- [data/cache/](/Users/sai/Documents/Projects/jobfinder/data/cache)

Cache is TTL-based.

On a normal run:

- if cache is fresh, the cached raw payload is reused
- if cache is stale, the source is fetched again

## How To Run

This project uses `uv`.

### Fetch all active companies

```bash
uv run python fetch_jobs.py
```

### Force refresh all active companies

```bash
uv run python fetch_jobs.py --force
```

### Fetch one company only

```bash
uv run python fetch_jobs.py --company booking_com
uv run python fetch_jobs.py --company tno
uv run python fetch_jobs.py --company adyen
```

### Force refresh one company

```bash
uv run python fetch_jobs.py --force --company booking_com
```

## Current Active Source Details

### Booking.com

- extraction method: API
- scraper type: `icims`
- current runtime filters:
  - Netherlands
  - `woe=12`
  - `regionCode=NL`
  - `stretchUnit=MILES`
  - `stretch=25`
  - categories:
    - `Data Science & Analytics`
    - `ML Engineering`
    - `ML Science`

### TNO

- extraction method: HTML
- scraper type: `html`
- current runtime filters are taken from the exact filtered vacancy URL
- current runtime filters include:
  - experience
  - education level
  - vacancy field

### Adyen

- extraction method: API
- scraper type: `greenhouse`
- current runtime filters:
  - Amsterdam
  - `Data Analytics`
  - `Development`
  - `NextGen`

## Workflow For New Companies

When adding a new company:

1. start with the exact careers URL the user provides
2. determine whether the source is:
   - API
   - static HTML
   - embedded payload
   - unusable without browser automation
3. record the result in [config/sources.yaml](/Users/sai/Documents/Projects/jobfinder/config/sources.yaml)
4. only add runtime config to [config/companies.yaml](/Users/sai/Documents/Projects/jobfinder/config/companies.yaml) if the source is worth supporting
5. implement the smallest scraper that works
6. verify fetch, cache, and normalized output

See:

- [docs/company_source_onboarding.md](/Users/sai/Documents/Projects/jobfinder/docs/company_source_onboarding.md)

## Not Supported

The project currently does not support:

- Playwright-based scraping
- Selenium/browser automation
- authenticated job portals
- sources that only work through fragile client-side interactions

## Next Likely Work

The next likely tasks are:

- add more supported company sources
- keep refining source tracking in `config/sources.yaml`
- begin Phase 2 matching once the source set is stable
