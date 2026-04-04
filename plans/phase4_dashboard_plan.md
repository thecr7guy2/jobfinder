# Phase 4 Plan: Next.js Dashboard on Vercel

## Summary

Build Phase 4 as a polished Next.js app deployed to Vercel, with a simple passcode gate and two roles: viewer and owner. The app ships all three planned views in v1: Inbox, Tracker, and Dashboard. Viewer access is read-only. Owner access can update review/application status, and those changes persist to Postgres through a server-side route.

Defaults locked for this phase:
- platform: Next.js App Router + TypeScript + Vercel
- v1 views: Inbox, Tracker, Dashboard
- auth: app-level passcode gate with viewer code and owner code
- data exposure: no public raw `jobs.json`; derive dashboard data server-side
- state model: Postgres `applications` table, with `data/applications.json` kept only as a local fallback when no database is configured
- owner edits: review status only
- inbox rule: unreviewed jobs with `match.status == "scored"` and `llm_score >= 70`

## Key Changes

- Add a new frontend app in-repo using Next.js App Router, TypeScript, and a polished product-style UI.
- Add passcode access with two roles:
  - viewer: can browse all dashboard views
  - owner: same access plus status updates
- Store passcode session state in signed/validated cookies via server routes or middleware; no full user system.
- Add an `applications` Postgres table as the dashboard-owned state store, separate from `data/jobs.json`.

Public/data interfaces to add:
- `applications` table keyed by job ID, with:
  - `job_id`
  - `status`
  - `updated_at`
  - `updated_by_role`
- compact status set for v1:
  - `new`
  - `reviewing`
  - `saved`
  - `applied`
  - `interview`
  - `offer`
  - `rejected`
  - `skipped`

Frontend behavior:
- Inbox view:
  - jobs with score `>= 70`
  - no existing application/review status
  - sorted by score desc, then recency
- Tracker view:
  - all jobs with status, filters, sort, and search
  - owner-only status controls
- Dashboard view:
  - counts by status
  - score distribution
  - company breakdown
  - alerted vs not alerted
- Job inspection:
  - open a drawer/modal from any list
  - show title, company, location, score, rationale, alert state, source link, and selected description excerpt

Data flow:
- server-side loader reads `data/jobs.json` and the `applications` table
- transform into a dashboard-safe view model before sending to the client
- never expose the raw repo file directly as a public static asset
- merge application state onto job records in memory for rendering
- owner status changes go through a protected server route
- server route writes `applications` updates directly to Postgres

Recommended route shape:
- `/login`
- `/` or `/inbox`
- `/tracker`
- `/dashboard`
- `/api/auth/verify`
- `/api/status/update`

Required env/config additions:
- `VIEWER_ACCESS_CODE`
- `OWNER_ACCESS_CODE`
- `DATABASE_URL` or `POSTGRES_URL`

## Implementation Changes

Frontend app:
- create a Next.js app with App Router and shared layout
- implement a strong visual system: refined typography, clear hierarchy, responsive layout, intentional charts/cards/tables
- use a small component set for:
  - top nav
  - stats cards
  - filter bar
  - jobs table/list
  - detail drawer
  - status badge/control

Server/auth layer:
- verify entered code against env values
- assign role `viewer` or `owner`
- persist role in a secure cookie
- protect all dashboard routes behind the passcode gate
- enforce owner-only permission on status update endpoints

Database write-back:
- create a server-side Postgres helper for the `applications` table
- on status change:
  - upsert one row by `job_id`
  - persist `status`, `updated_at`, and `updated_by_role`
- rely on database concurrency instead of Git commits

State derivation:
- build a dashboard view model from `jobs.json` + Postgres `applications`
- normalize missing application state to `new`
- compute dashboard metrics server-side
- keep status labels and color mapping in one shared constant/module

## Test Plan

- Unit test dashboard data derivation:
  - unreviewed score>=70 jobs land in Inbox
  - application status overrides default `new`
  - filtered jobs do not appear in Inbox
- Unit test auth:
  - viewer code grants viewer access
  - owner code grants owner access
  - invalid code is rejected
  - owner-only routes reject viewer role
- Unit test status update flow:
  - valid owner update produces correct `applications` row upsert
  - invalid status is rejected
  - unknown job ID is rejected
- Unit test metrics:
  - counts by status
  - company counts
  - score buckets
- Integration test local app behavior:
  - login redirects correctly
  - Inbox, Tracker, Dashboard render from repo data
  - detail drawer opens with merged job/application data
  - owner can update a status and see it reflected after reload
- Acceptance checks:
  - viewer can browse but cannot edit
  - owner can change status and persist it to Postgres
  - deployed app does not expose raw `jobs.json`
  - Vercel deployment works with env-configured codes and a Postgres connection string

## Assumptions

- Phase 4 v1 includes real status persistence, so it is no longer a purely read-only dashboard.
- `data/jobs.json` remains scraper/match/alert state; Postgres owns dashboard review/application state.
- The dashboard is intended to be protected, not publicly open, even if hosted on Vercel.
- Detailed notes, comments, and richer workflow actions are out of scope for v1.
- Telegram alerts remain unchanged in Phase 4; dashboard links or alert-edit flows can come later.
