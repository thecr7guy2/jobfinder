# Company Source Onboarding

This document defines the process for evaluating and adding a new company careers source to the project.

The project rule is simple:

- use direct APIs when available
- use static HTML when possible
- do not use Playwright
- skip sources that require heavy browser automation

## Goal

When a new company URL is added, decide whether it is:

- `active`: ready to be scraped
- `investigating`: looks possible, but not implemented yet
- `skipped`: not worth supporting under current rules

The outcome should be recorded in:

- [config/sources.yaml](/Users/sai/Documents/Projects/jobfinder/config/sources.yaml) for source status and notes
- [config/companies.yaml](/Users/sai/Documents/Projects/jobfinder/config/companies.yaml) only if the source is active and should be fetched at runtime

## Decision Rules

### 1. Prefer API first

Always check whether the site uses:

- public JSON endpoints
- iCIMS / Greenhouse / Lever / Workday style APIs
- server-exposed structured payloads such as Nuxt or Next.js data blobs

If a stable non-browser endpoint exists, use that.

### 2. Accept static HTML

If the listing page and job detail pages are accessible with normal HTTP requests and the needed data can be extracted from:

- HTML cards
- detail pages
- embedded JSON-LD
- embedded app payloads

then the source is acceptable.

### 3. Reject browser-only sources

If job results only appear after client-side rendering and there is no reliable API or embedded payload we can call directly, do not add the source.

Examples to reject:

- pages that require Playwright or Selenium
- pages that hide all useful data behind browser-only interactions
- sources that require login, session hacks, or fragile anti-bot workarounds

## Onboarding Procedure

### Step 1. Capture the source URL

Start from the exact URL the user provides.

Record:

- company name
- careers/listing URL
- filters present in the URL
- what the user expects to see there

### Step 2. Check the page response type

Fetch the page and inspect:

- HTTP status
- whether HTML is returned
- whether results are visible in source HTML
- whether the page is a server shell only

Questions to answer:

- do job cards appear in HTML?
- do job detail URLs appear in HTML?
- is there embedded JSON or app state?

### Step 3. Look for a direct data source

Search for:

- JSON endpoints
- `application/ld+json`
- `__NUXT_DATA__`
- `__NEXT_DATA__`
- vendor-specific APIs
- job IDs or slug patterns in page source or linked scripts

If a direct data source exists, prefer that over brittle HTML parsing.

### Step 4. Decide the extraction method

Choose one of:

- `api`
- `html`
- `nuxt_payload`
- `next_payload`
- `custom`
- `unknown`

Choose a scraper type:

- `icims`
- `html`
- `custom`
- `none`

### Step 5. Record the result in `config/sources.yaml`

Every investigated source must be added to the registry, even if rejected.

Required fields:

- `id`
- `name`
- `careers_url`
- `status`
- `extraction_method`
- `scraper_type`
- `last_verified`
- `notes`

Optional fields:

- `runtime_config`
- `blocker`

### Step 6. Only active sources go into `config/companies.yaml`

If a source is approved:

- add its runtime config
- include the exact filters that worked
- keep the config literal to the proven URL or proven API params

Do not invent generalized filters if the source-specific ones are already known.

### Step 7. Implement the scraper in the smallest possible way

Use the least complex method that works:

- direct API calls
- SSR payload extraction
- static HTML listing + detail page scraping

Avoid premature abstraction.

If a second or third company repeats the same pattern, then generalize.

### Step 8. Run a real fetch

Verify:

- forced fetch works
- cache file is written
- normalized jobs are added to `data/jobs.json`
- second run uses cache

### Step 9. Validate the result set

Check whether:

- the filters really match the user’s intent
- the number of jobs looks correct
- the titles and locations are in scope
- duplicate IDs are handled correctly

If the source returns too many irrelevant jobs, tighten runtime filters before considering the source complete.

## Status Definitions

### `active`

Use when:

- the source is implemented
- fetch works end to end
- results are relevant enough to keep

### `investigating`

Use when:

- the source looks possible
- some structure is visible
- more work is needed before implementation

### `skipped`

Use when:

- the source does not meet the no-Playwright rule
- the source is too fragile or too costly to maintain
- there is no reliable non-browser extraction path

## File Responsibilities

### `config/sources.yaml`

This is the source registry.

Use it to track:

- what was tested
- what worked
- what failed
- what should be revisited later

### `config/companies.yaml`

This is the runtime scraper config.

Use it only for sources that are actively fetched.

It should contain:

- company id
- scraper type
- source URL or API URL
- exact filters
- selectors or templates if needed
- TTL

## Practical Examples

### Booking.com

- status: `active`
- extraction method: `api`
- scraper type: `icims`
- reason: public API works directly with known query params

### TNO

- status: `active`
- extraction method: `html`
- scraper type: `html`
- reason: listing and detail pages are server-rendered and filterable by URL query params

### ASML

- status: `skipped`
- extraction method: `unknown`
- scraper type: `none`
- reason: page behaves like a client-rendered search app and no proven non-browser listing source was confirmed

### Adyen

- status: `investigating`
- extraction method: `nuxt_payload`
- scraper type: `custom`
- reason: SSR payload exists and detail pages are public, but runtime implementation is not done yet

## Default Rule For Future Additions

For every new company:

1. test the exact URL the user provides
2. determine whether the source is API, HTML, embedded payload, or unusable
3. record the result in `config/sources.yaml`
4. only then implement runtime scraping if the source is worth keeping

This keeps source decisions explicit and prevents repeating the same investigation work.
