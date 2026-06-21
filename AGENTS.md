# AGENTS.md — ACBC Engine for OpenSurvey.js

## What this repo is

Building an open-source **Adaptive Choice-Based Conjoint (ACBC)** engine in JavaScript. The engine implements a three-phase preference survey (BYO → Screening → Choice Tournament) with on-the-fly design generation and Hierarchical Bayes utility estimation. Intended as a plugin or companion to OpenSurvey.js-style survey shells.

**Always read `ACBC_SLR_AdaptiveEngine_Requirements.md` first** — it is the canonical specification containing the SLR findings, architecture diagrams, functional requirements (FR-1 through FR-7), the config schema, and the integration architecture diagram. Every architectural decision traces to that document.

## Technology constraints (strict)

- **TypeScript (ES2022+ target, ESM output)**. Zero mandatory framework dependencies.
- Config validation: **Zod**.
- State machine: pure reducer + append-only event log (not mutable state).
- State authority: server-side session; OpenSurvey/SurveyJS are thin renderers consuming EngineState snapshots.
- Estimation backend: browser-native MNL streaming OR server-side HB via R/Python/WASM.
- Optional: SurveyJS dynamic question API adapter (a plugin, not a core dep).

## Architecture: the three things you must not get wrong

### 1. Design generation is on-the-fly, per respondent
Standard CBC generates designs offline pre-study. ACBC generates concepts **at survey runtime using the near-neighbor algorithm seeded by the BYO ideal concept (C₀)**. You cannot pre-compute the design; the engine must generate, prune, and replace concepts reactively as the respondent screens.

### 2. All three phases are one estimation model
BYO, Screening, and Tournament data are coded into a **single unified effects-coded design matrix** and estimated jointly in one HB or MNL run. Partial estimation (e.g., only tournament data) degrades individual-level precision. Each phase contributes different information density and error scale — this is a known methodological issue, not a bug to "fix" by normalizing.

### 3. Price is continuous, not discrete
Model price as **piecewise linear** (3–5 breakpoints) or summed component prices. Do not treat it as a regular discrete attribute. The default config uses ±30% random variation around summed component prices, rounded to a configurable unit.

## Key algorithms

| Algorithm | Where | What it does |
|-----------|-------|--------------|
| Near-neighbor design | FR-2 | Generates T concepts near C₀ by varying Amin–Amax attributes randomly |
| Cutoff pattern detection | FR-3 / PH-2a, PH-2b | Scans screening responses for systematic level avoidance/selection |
| Replacement card generation | FR-2 / PH-2c | Regenerates pruned concepts satisfying all confirmed cutoff rules |
| Tournament bracket | FR-4 | t/2 rounds of triple elimination with tied-attribute graying |
| Effects-coded matrix builder | FR-6 | Unifies BYO (binary), Screening (binary+None), Tournament (multinomial) into one design matrix |

## State management

Full survey state must survive page refresh:
- C₀ (BYO seed concept vector)
- Concept pool with screening response per concept
- Confirmed cutoff rules (must-have / unacceptable)
- Tournament bracket state
- Use `sessionStorage` or server-side session — do not rely on in-memory state alone.

## Validation

Built-in test harness: simulate N robotic respondents with random utilities, compute per-respondent D-efficiency and aggregate standard errors. This is a development tool, not optional — design generation correctness can only be verified by simulating the full respondent pipeline.

## Survey shell integration

SurveyJS (MIT) is the primary rendering substrate. OpenSurvey (AGPL-3.0) is an optional full survey platform shell. The engine is the source of truth; shells never mutate C0, cutoffs, survivors, or bracket state.

## Pre-existing context files

| File | Role |
|------|------|
| `ACBC_SLR_AdaptiveEngine_Requirements.md` | Canonical spec: SLR + functional/non-functional requirements |
| `.omo/personas/` | Auto-generated stakeholder personas (End User, Stakeholder, Contributor) |

## Commands

- `npm test` — vitest run
- `npm run build` — tsc
- `npm run typecheck` — tsc --noEmit
