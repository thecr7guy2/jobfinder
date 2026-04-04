# JobFinder — Master Plan

## What This Is

A personal job discovery and application tracking system. It continuously monitors career pages of target companies, scores open roles against a resume using a cheap LLM, sends Telegram alerts for strong matches, and provides a protected Vercel dashboard to review jobs, track applications, and generate cover letters.

The current implementation runs across GitHub and Vercel infrastructure: GitHub for the repo and planned automation, Vercel for the dashboard frontend, and Postgres for dashboard-owned application state.

---

## The Problem It Solves

Most missed opportunities happen not because of a bad application — but because you never knew the company was hiring. This system fixes that by watching the companies you care about and surfacing the right roles to you automatically.

---

## Core User Flow

```
companies.yaml
     │
     ▼
fetch_jobs.py  ──(cache check)──►  scrape / API call
     │
     ▼
data/jobs.json  (normalized, deduplicated)
     │
     ▼
match_jobs.py  ──(staged filter)──►  LLM score (only shortlisted)
     │
     ▼
Telegram alert  (score ≥ threshold)
     │
     ▼
Vercel dashboard
     │
     ├── Review job → status update in Postgres
     │
     ├── Generate cover letter  →  cover_letters/{company}-{role}-{date}.md
     │                             + Telegram file delivery
     │
     └── Track status  →  Applied / Phone Screen / Interview / Offer / Rejected
```

---

## Phases

### Phase 1 — Scraper (current)
Get jobs from all target companies into a single normalized JSON store with caching.

**Deliverables:**
- `config/companies.yaml` — company list with scraper config
- `config/sources.yaml` — source registry with investigation status and notes
- `docs/company_source_onboarding.md` — onboarding rules for new company sources
- `scrapers/base.py` — abstract base class
- `scrapers/icims.py` — Booking.com (JSON API)
- `scrapers/html.py` — TNO (BeautifulSoup)
- `scrapers/greenhouse.py` — Adyen (Greenhouse API)
- `scrapers/abn_amro.py` — ABN AMRO vacancy API
- `scrapers/ing.py` — ING search API + detail pages
- `scrapers/albert_heijn.py` — Albert Heijn vacancy API
- `fetch_jobs.py` — single entry point, handles cache + merge
- `data/cache/` — raw per-company cache (TTL-based)
- `data/jobs.json` — normalized job store

**Done when:** Run `python fetch_jobs.py`, get all jobs from all companies, run again → hits cache.

---

### Phase 2 — Matching
Score each new job against the resume using a staged cheap-first pipeline.

**Deliverables:**
- `config/matching.yaml` — matching preferences and model config
- `data/resume.md` — markdown resume used as plain text input
- `match_jobs.py` — scoring pipeline
- Scoring written back into `data/jobs.json` per job

**Staged pipeline:**
1. **Title filter** — drop roles with zero keyword overlap with desired titles (no API call)
2. **Location filter** — drop roles not matching remote/NL preference (no API call)
3. **Keyword heuristic** — count skill overlaps between resume and JD (no API call)
4. **LLM score** — only for jobs that pass stages 1–3; returns 0–100 score + 2-line rationale

**LLM:** DeepSeek Chat (`deepseek-chat`) via the DeepSeek API.

**Done when:** New jobs get scored; only ~20–30% reach the LLM stage.

---

### Phase 3 — Telegram Alerts
Notify via Telegram when a job scores above threshold.

**Deliverables:**
- `notify.py` — sends Telegram message for new high-score jobs
- Alert includes: company, title, location, score, rationale snippet, and job URL
- Deduplication: never alert on the same job twice (`alerted: true` in jobs.json)
- Scraper failure alert: if a company returns 0 jobs for 2+ consecutive runs, send warning

**Done when:** New high-match job → Telegram message within one run cycle.

---

### Phase 4 — Vercel Dashboard
Protected Next.js dashboard showing all jobs, their scores, and current application status.

**Pages/Views:**
- **Inbox** — new high-match jobs pending a decision (Apply / Skip buttons)
- **Tracker** — all jobs with current status, sortable/filterable
- **Dashboard** — stats: total discovered, applied, response rate, funnel breakdown

**How actions work:**
- Dashboard reads `data/jobs.json` server-side
- Review and application status are stored in Postgres, not in `jobs.json`
- Owner actions call protected server routes
- Vercel deploys the dashboard; dashboard status changes do not trigger code deploys

**Tech:** Next.js App Router + TypeScript on Vercel, with Postgres-backed application state.

**Done when:** Can open the site, see matched jobs, click Apply → state updates persist in Postgres.

---

### Phase 5 — Cover Letter Generation
Generate a tailored cover letter when a job is approved.

**Deliverables:**
- `data/cover_letter_template.md` — user's template with named placeholders
- `generate_cover_letter.py` — takes job ID, fetches JD + resume + template, calls LLM
- Output saved to `cover_letters/{company}-{role-slug}-{date}.md`
- Cover letter also sent as a file to Telegram for immediate access
- Prompt explicitly instructs: use only facts from resume, do not invent experience

**Trigger:** Approval action on dashboard → server-side trigger or GitHub Actions `workflow_dispatch` → generates and commits cover letter.

**Done when:** Click Apply on dashboard → cover letter appears in Telegram within 2 minutes.

---

### Phase 6 — GitHub Actions Automation
Wire everything together so it runs on a schedule without manual intervention.

**Workflows:**
| Workflow | Trigger | What it does |
|---|---|---|
| `scrape.yml` | Schedule (every 8h) + manual | fetch_jobs.py + match_jobs.py + notify.py |
| `cover_letter.yml` | workflow_dispatch (job_id param) | generate_cover_letter.py + commit + Telegram |
| `deploy.yml` | Push to main | Build and deploy Vercel dashboard or related frontend assets |

**Secrets needed:** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `DEEPSEEK_API_KEY`, `VIEWER_ACCESS_CODE`, `OWNER_ACCESS_CODE`, and `DATABASE_URL` or `POSTGRES_URL` (for dashboard write-back)

**Done when:** No manual intervention needed; jobs discovered and alerted automatically every 8 hours.

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Scraping | `requests` + `BeautifulSoup` | Sufficient for static HTML and APIs |
| JS-rendered | none | Browser-only sources are intentionally skipped |
| Matching LLM | DeepSeek Chat | Implemented hosted LLM for Phase 2 scoring |
| Job data storage | JSON files in repo | Simple source-of-truth for scraped and matched jobs |
| Application state | Postgres | Fast writes for dashboard review/application state |
| Frontend | Next.js App Router + TypeScript | Protected dashboard, server routes, Vercel-native |
| Charts | CSS-based bars / dashboard UI | Lightweight and already implemented |
| Telegram | raw `requests` to Bot API | Implemented simple API integration for alerts |
| CI/CD | GitHub Actions + Vercel | Scheduled jobs on GitHub, dashboard hosting on Vercel |
| Config | YAML | Human-readable, easy to add companies |

---

## Data Files

| File | Purpose |
|---|---|
| `config/companies.yaml` | Company list, scraper type, filters, TTL |
| `config/sources.yaml` | Source registry and investigation status |
| `data/resume.md` | Resume used for matching |
| `data/cover_letter_template.md` | Cover letter template with placeholders |
| `data/jobs.json` | All discovered jobs, normalized + scored |
| `data/applications.json` | Local fallback only when dashboard Postgres is not configured |
| `data/cache/{company_id}.json` | Raw cached scrape per company |
| `cover_letters/*.md` | Generated cover letters |

---

## Job Status State Machine

```
discovered
    ├── ignored (user skipped)
    └── shortlisted
            └── approved
                    └── applied
                            ├── no_response
                            ├── recruiter_call
                            │       ├── rejected
                            │       └── interview_r1
                            │               ├── rejected
                            │               └── interview_r2
                            │                       ├── rejected
                            │                       └── offer
                            └── closed (posting removed)
```

---

## Normalized Job Schema

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
  "source": "icims_api",
  "match": {
    "version": "phase2_v1",
    "input_hash": "87e2b573169b126deebb0271ffdd70b44890d0a87a70454b6e2a9ff3c2e39c6d",
    "status": "scored",
    "stage_reached": 4,
    "title_hits": ["Data Scientist", "Senior Data Scientist", "GenAI Lead"],
    "location_match": "any",
    "keyword_hits": ["python", "machine learning", "data science", "llm", "genai"],
    "keyword_score": 0.208,
    "llm_score": 75,
    "llm_rationale": "Strong GenAI alignment, but lighter seniority than requested.",
    "llm_model": "deepseek-chat",
    "llm_provider_base_url": "https://api.deepseek.com",
    "llm_score_threshold": 70,
    "scored_at": "2026-04-04T02:06:31Z",
    "last_error": null
  },
  "alerted": true,
  "alerted_at": "2026-04-03T10:02:00Z"
}
```

---

## Known Companies

| Company | URL | Scraper Type | Phase |
|---|---|---|---|
| Booking.com | jobs.booking.com/api/jobs | icims (JSON API) | 1 |
| TNO | tno.nl/en/careers/vacancies/ | html (BeautifulSoup) | 1 |
| Adyen | boards-api.greenhouse.io/v1/boards/adyen | greenhouse (JSON API) | 1 |
| ABN AMRO | werkenbijabnamro.nl/en/api/vacancy/ | abn_amro (JSON API) | 1 |
| ING | careers.ing.com/en/search-jobs/resultspost | ing (JSON + detail pages) | 1 |
| Albert Heijn | werk.ah.nl/en/api/vacancy/ | albert_heijn (JSON API) | 1 |
| ASML | asml.com/en/careers/find-your-job | skipped (browser-only) | Later |

---

## Cost Estimate

| Item | Cost |
|---|---|
| DeepSeek API | Usage-based |
| GitHub Actions (public repo) | Free |
| Vercel | Free to low-cost, depending on usage |
| Neon / Postgres | Free to low-cost, depending on usage |
| Telegram Bot API | Free |
| **Total** | **Low, usage-dependent** |

---

## Repo Visibility Decision

- **Private repo** recommended — resume and cover letters should not be public
- Vercel works cleanly with a private repo and matches the current dashboard architecture
- If a public read-only dashboard is wanted later, build that separately instead of forcing the main app onto static hosting

---

## Open Questions

- [ ] Which other companies should be added beyond the current active set?
- [ ] Repo public or private? (affects automation and any future public dashboard variant)
- [ ] Cover letter delivery: Telegram file message, or just commit to repo?
