# ACBC Implementation Decisions

## 2026-06-21 10:03:38 — Phase 3 decisions

- Public API (`src/index.ts`) remains engine-core only; SurveyJS adapter is imported directly from `src/integration/surveyjs-adapter.js`.
- SurveyJS is treated as an optional peer dependency; adapter declares minimal inline types and guards against missing `document`/`window` in Node.
- Team mode was unstable in this environment; redundant team members were cancelled and work completed via focused `task()` delegations.
- Demo is a self-contained HTML file that inlines a study and engine state machine for manual QA; it does not depend on the published package build.