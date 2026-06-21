# Ultrawork Notepad — ACBC Phase 3 UX Shell
Started: 2026-06-20T18:35:00Z

## Goal
Implement Phase 3 of the ACBC engine: UX shell with SurveyJS integration, accessible rendering, and interruption-safe resume.

## Context
- Phase 1 kernel complete: TypeScript + Zod + reducer + event log + PRNG + 24 passing tests
- Phase 2 (academic logic: generator, detector, matrix export) is NOT yet implemented
- Phase 3 must work with the existing Phase 1 engine API
- AGENTS.md specifies: SurveyJS (MIT) is the primary rendering substrate; OpenSurvey (AGPL-3.0) is optional shell
- Engine is source of truth; shells never mutate state

## Phase 3 scope
1. Public API entry point (`src/index.ts`)
2. SurveyJS adapter (`src/integration/surveyjs-adapter.ts`)
3. OpenSurvey integration notes/stub (`src/integration/opensurvey-adapter.ts` or docs)
4. Demo HTML page (`demo/index.html`) showing full BYO→Screening→Tournament flow
5. Accessibility: aria-labels, focus management, keyboard navigation, WCAG 2.1 AA
6. Adapter tests (`test/unit/surveyjs-adapter.test.ts`)
7. Manual QA: open demo in browser, verify flow works end-to-end

## Scenarios (contract)
### S1 — Happy path
- Load engine with sample study config
- Render BYO screen, submit ideal concept
- Render screening screen with 3 concepts, submit responses
- Render tournament screen with triples, submit choice
- PASS: state advances correctly through phases

### S2 — Edge: resume after interruption
- Save event log after BYO submission
- Simulate page refresh (new engine instance)
- Load event log, continue from SCREENING phase
- PASS: no data loss, screen resumes correctly

### S3 — Accessibility
- Render BYO/screening/tournament screens
- PASS: all interactive elements have aria-labels, keyboard navigable, no color-only cues

## Now
Loading team-mode skill, then creating Phase 3 team.

## Todo
- Create Phase 3 team
- Implement src/index.ts public API
- Implement SurveyJS adapter
- Implement OpenSurvey integration notes/stub
- Create demo HTML page
- Write adapter tests
- Run a11y review
- Run manual QA (browser)
- Update docs if needed

## Learnings
- Team mode is now enabled; need to follow closure sequence strictly
