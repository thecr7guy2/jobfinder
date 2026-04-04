# Phase 5 Plan: Cover Letter Generation and PDF Compilation

## Summary

Build an on-demand cover letter flow directly from the dashboard. When the user presses `Generate cover letter`, the app will call an LLM with the selected job description, the resume, and a tightly controlled prompt. The system will generate LaTeX-ready content, inject it into a repo-stored LaTeX template, and return a downloadable `.tex` file immediately.

The longer-term path is to compile that LaTeX into PDF using Tectonic, eliminating the need for Overleaf in the core workflow.

Defaults locked for this phase:
- template source of truth lives in the repo as LaTeX
- generation is triggered from the frontend on demand
- prompt instructions live in a modifiable config file
- v1 returns downloadable `.tex`
- PDF compilation is handled by Tectonic, preferably through GitHub Actions after generation is working

## Product Goals

- Generate a tailored cover letter from a selected job with one click
- Use only real facts from the resume and job description
- Keep the prompt structure editable without code changes
- Avoid dependence on Overleaf for generation or compilation
- Support future saving of generated letters into `cover_letters/`

## Final Architecture

### Inputs

- `data/resume.md`
- selected job from `data/jobs.json`
- prompt instructions from a config file
- LaTeX template from the repo

### Generation flow

1. User opens a job in the dashboard
2. User clicks `Generate cover letter`
3. Frontend calls a protected route
4. Server loads:
   - job record
   - resume
   - prompt instructions
   - LaTeX template
5. Server calls the LLM
6. Server receives structured content for the letter body
7. Server injects the generated content into the LaTeX template
8. Frontend receives:
   - generated `.tex`
   - filename
   - optional plain-text preview
9. User downloads the file immediately

### Compilation flow

Phase 5 initial implementation:
- generate `.tex` only

Phase 5 extension:
- compile `.tex` into `.pdf` with Tectonic

Recommended compilation path:
- GitHub Actions compiles LaTeX to PDF using Tectonic after generation or save

Optional local path:
- compile locally with Tectonic for manual use

## Why Tectonic Instead of Overleaf

- Tectonic can compile LaTeX to PDF without Overleaf
- it works locally and in CI
- it avoids browser/editor dependency
- it fits the repo-driven workflow better

Overleaf becomes optional:
- useful only if you want its editor
- not required for generation or compilation

## Template Strategy

Store the real template in the repo:

- `data/cover_letter_template.tex`

Use explicit placeholders such as:

- `{{DATE}}`
- `{{COMPANY_NAME}}`
- `{{ROLE_TITLE}}`
- `{{HIRING_TEAM}}`
- `{{LETTER_BODY}}`

The LLM should generate only content sections, not arbitrary full-document LaTeX.

Recommended generated sections:

- `opening_paragraph`
- `experience_paragraph`
- `closing_paragraph`

The server will combine them into `{{LETTER_BODY}}`.

## Prompt Strategy

Store prompt instructions in:

- `config/cover_letter_prompt.md`

This prompt should define:

- tone and style
- paragraph-by-paragraph structure
- factuality constraints
- what must not be invented
- output format requirements

Prompt structure:

1. System rules
- use only facts from resume and job description
- do not invent experience, tools, metrics, or claims
- keep language concise and professional
- avoid generic filler

2. Letter structure instructions
- paragraph 1: motivation for company/role
- paragraph 2: most relevant experience
- paragraph 3: closing and fit

3. Output requirements
- return structured JSON fields, not freeform LaTeX
- each paragraph should be plain text
- no markdown

## API Design

Add route:

- `POST /api/cover-letter/generate`

Request:

```json
{
  "jobId": "abn_amro::9162",
  "saveToRepo": false
}
```

Response:

```json
{
  "ok": true,
  "filename": "abn-amro-senior-data-scientist-2026-04-04.tex",
  "tex": "...",
  "previewText": "..."
}
```

Later response extension:

```json
{
  "savedPath": "cover_letters/abn-amro-senior-data-scientist-2026-04-04.tex",
  "pdfArtifact": null
}
```

## Frontend Behavior

In the job detail drawer:

- add `Generate cover letter` button
- show loading state while generating
- show error feedback if generation fails
- show success state with:
  - `Download .tex`
  - optional `Copy preview`
  - optional `Save to repo`

Later:

- `Compile PDF`
- `Download PDF`

## Save-to-Repo Behavior

This should be optional, not mandatory for v1.

If enabled:

- save generated `.tex` to:
  - `cover_letters/{company}-{role-slug}-{date}.tex`

Recommended implementation:

- use a server-side GitHub write helper for generated artifacts only
- do not reuse dashboard application-state storage logic

Reason:
- generated letters are valid repo artifacts
- status updates are not

## PDF Compilation With Tectonic

Recommended tool:

- Tectonic

Compilation targets:

- local dev/manual use
- GitHub Actions for automated build

Recommended workflow:

1. generate `.tex`
2. optionally save to `cover_letters/`
3. run Tectonic against the generated file
4. produce `.pdf`
5. optionally:
   - attach as artifact
   - commit PDF
   - send PDF to Telegram

## Deliverables

- `data/cover_letter_template.tex`
- `config/cover_letter_prompt.md`
- `app/api/cover-letter/generate/route.ts`
- `lib/cover-letter/prompt.ts`
- `lib/cover-letter/template.ts`
- `lib/cover-letter/latex.ts`
- `cover_letters/` output directory
- optional:
  - `generate_cover_letter.py` if CLI support is still wanted
  - GitHub Actions workflow for Tectonic compilation

## To-Do List

- Add repo-stored LaTeX template file
- Add prompt config file with editable instructions
- Implement prompt builder from resume + job + config
- Implement strict LLM output parsing
- Implement LaTeX escaping for generated content
- Implement placeholder injection into template
- Add protected API route for generation
- Add frontend button and download flow
- Add optional save-to-repo support for `.tex`
- Add Tectonic compilation path
- Add optional Telegram delivery of compiled PDF later

## Test Plan

- Unit test prompt composition
- Unit test LaTeX escaping for:
  - `%`
  - `&`
  - `_`
  - `#`
  - `{`
  - `}`
- Unit test placeholder injection into template
- Unit test filename generation
- Unit test route validation:
  - unknown job ID
  - missing template
  - malformed LLM output
- Integration test:
  - generate `.tex` for one real fixture job
- Later compilation test:
  - Tectonic compiles generated `.tex` successfully

## Acceptance Criteria

### V1

- User clicks `Generate cover letter`
- dashboard returns a downloadable `.tex`
- generated output follows the paragraph instructions
- output contains no invented resume claims
- output uses the repo template correctly

### V1.1

- generated `.tex` can be compiled to PDF with Tectonic

### V1.2

- user can optionally save generated `.tex` into `cover_letters/`
- PDF can optionally be produced in CI and delivered/downloaded

## Open Decisions

- Should `saveToRepo` default to `false` or be exposed as a checkbox?
- Do you want `.tex` only in v1, or `.tex` plus plain-text preview?
- Do you want PDF compilation in the same phase, or immediately after generation is stable?
- Do you want generated PDFs later sent to Telegram automatically?

## Recommendation

Implement this in two small steps:

1. Generate and download `.tex`
2. Add Tectonic PDF compilation after generation quality is stable

That keeps the first version simple while still moving toward a full Overleaf-free workflow.
