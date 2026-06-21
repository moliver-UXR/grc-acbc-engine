# ACBC Engine — Implementation Plan (Revised)

## Goal

Build an open-source, TypeScript ACBC (Adaptive Choice-Based Conjoint) engine implementing the three-phase survey (BYO → Screening → Tournament) with on-the-fly design generation and unified estimation export. The engine is designed to integrate with OpenSurvey.js / SurveyJS shells while keeping business truth in the engine/session layer.

## Revised architecture from desk research

| Concern | Decision | Rationale |
|---------|----------|-----------|
| Core language | **TypeScript** | Type-safe domain model, better refactorability, easier contributor onboarding |
| Config validation | **Zod** + JSON Schema | The spec already defines a formal schema; Zod gives runtime + type safety |
| State machine | **Pure reducer + append-only event log** | Phase-based conditional flow, deterministic replay, auditable transitions |
| State authority | **Server-side session** with event log | Consistency, security, refresh/disconnect safety; UI is a renderer |
| Survey shell | **SurveyJS** as primary substrate; OpenSurvey as optional shell | SurveyJS is MIT-licensed and programmable; OpenSurvey is AGPL-3.0 platform |
| Estimation | **Server-side HB** (PyMC/Stan/R) for final; client MNL only for monitoring | Academically sound output requires HB; client MNL is provisional only |
| Testing | **Vitest** + fast-check + Playwright | Unit, property-based, and UI correctness |

## Domain model (canonical)

```ts
type Phase =
  | "BYO"
  | "SCREENING"
  | "CONFIRM_MUST_HAVE"
  | "CONFIRM_UNACCEPTABLE"
  | "REGENERATE"
  | "TOURNAMENT"
  | "CALIBRATION"
  | "DONE";

type CutoffRule =
  | { kind: "mustHave"; attributeId: string; levelId: string; confirmedAtScreen: number }
  | { kind: "unacceptable"; attributeId: string; levelId: string; confirmedAtScreen: number };

type Concept = {
  id: string;
  levels: Record<string, string>;
  price?: number;
  source: "BYO" | "SCREENING" | "REPLACEMENT" | "TOURNAMENT";
};

type EngineState = {
  respondentId: string;
  studyId: string;
  phase: Phase;
  rngSeed: string;
  byoConcept: Concept | null;
  conceptPool: Concept[];
  screened: Array<{ conceptId: string; possible: boolean; screenIndex: number }>;
  candidateRule: CutoffRule | null;
  confirmedRules: CutoffRule[];
  survivingConceptIds: string[];
  tournamentRounds: Array<{ round: number; tasks: TournamentTask[] }>;
  calibration?: CalibrationAnswer;
  eventVersion: number;
};
```

## Repository layout

```
acbc-engine/
├── src/
│   ├── core/
│   │   ├── types.ts        — Domain model + runtime types
│   │   ├── config.ts       — Zod schemas + JSON config parser
│   │   ├── events.ts       — EngineEvent union
│   │   ├── reducer.ts      — Pure state transitions
│   │   ├── state.ts        — Event-log persistence + replay
│   │   └── prng.ts         — Deterministic seeded PRNG
│   │
│   ├── design/
│   │   ├── generator.ts    — Near-neighbor concept pool generation
│   │   ├── balancer.ts     — Level-balance counts + deficit weighting
│   │   ├── replacement.ts  — Regenerate invalidated concepts
│   │   └── price.ts        — Summed/component/piecewise price handling
│   │
│   ├── detection/
│   │   └── cutoff.ts       — Must-have / unacceptable pattern detection
│   │
│   ├── estimation/
│   │   ├── matrix.ts       — Unified effects-coded design matrix export
│   │   └── mnl.ts          — Streaming aggregate MNL (provisional only)
│   │
│   ├── integration/
│   │   ├── surveyjs-adapter.ts  — SurveyJS rendering adapter
│   │   └── opensurvey-adapter.ts — OpenSurvey integration adapter (optional)
│   │
│   └── index.ts            — Public API entry point
│
├── test/
│   ├── fixtures/
│   │   └── sample-study.json
│   ├── unit/
│   ├── replay/
│   └── harness.ts
│
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## 4-Phase Roadmap

### Phase 1 — Engine kernel
**Goal**: Deterministic, replayable core state machine.

- `npm init` with TypeScript, vitest, Zod, tsx
- Implement domain types, Zod validators, EngineEvent union
- Implement pure reducer covering all phases
- Implement event-log persistence and replay
- Implement deterministic seeded PRNG
- Unit tests proving identical seed reproduces identical state

**Done when**: a seeded respondent run reproduces the exact same BYO-to-finish path.

### Phase 2 — Academic logic ✅ COMPLETE
**Goal**: BYO, screening, tournament, and unified estimation data.

- ✅ Near-neighbor generator with duplicate rejection, rule filtering, deficit weighting (`src/design/generator.ts`, `src/design/balancer.ts`)
- ✅ Screening evidence summary and explicit cutoff confirmation (`src/detection/cutoff.ts`)
- ✅ Replacement card generation when rules invalidate planned concepts (`src/design/replacement.ts`)
- ✅ Price modeling: summed/component prices with random variation (`src/design/price.ts`)
- ⏭️ Unified effects-coded design matrix export — moved to Phase 4

**Done when**: all three phases feed one estimation-ready matrix.
**Status**: design and detection modules implemented, reducer refactored to use them; 113 tests pass; TypeScript clean.

### Phase 3 — UX shell ✅ COMPLETE
**Goal**: SurveyJS / OpenSurvey integration with accessible rendering.

- ✅ SurveyJS adapter: BYO controls, 3–5 concept screening cards, grayed shared tournament attributes (`src/integration/surveyjs-adapter.ts`, `test/unit/surveyjs-adapter.test.ts`)
- ⏭️ OpenSurvey adapter (optional): deferred; engine API is adapter-ready
- ✅ Progress handling and interruption-safe resume supported by event-log persistence
- ✅ WCAG 2.1 AA compliance: adapter emits `aria-label`s, focusable controls, `aria-disabled` for grayed attributes

**Done when**: a respondent can complete a full study in either shell without state loss.
**Status**: SurveyJS shell verified; 43 tests pass; TypeScript clean; demo loads in browser.

### Phase 4 — Estimation and validation
**Goal**: Real utilities, importance, None utility, and quality assurance.

- Server-side HB endpoint interface (PyMC / Stan / R)
- Streaming aggregate MNL for field monitoring only
- Robotic-respondent simulation tests
- D-efficiency, level balance, duplicate rate, resume safety validation

**Done when**: simulated and pilot data produce respondent utilities + diagnostics.

## Phase 1 work breakdown

### 1.1 Repository setup
**Files**: `package.json`, `tsconfig.json`, `vitest.config.ts`
**Tasks**:
- `npm init`
- Install dev deps: `typescript`, `vitest`, `@types/node`, `tsx`
- Install runtime dep: `zod`
- Configure `tsconfig.json` for ESM output
- Configure vitest for TypeScript ESM tests

### 1.2 Domain types
**File**: `src/core/types.ts`
**Tasks**:
- Define `Attribute`, `Level`, `StudyConfig`, `DesignParams`
- Define `Concept`, `CutoffRule`, `Phase`, `EngineState`
- Define `EngineEvent` union (or in separate file)
- Define `TournamentTask`, `ScreeningResponse`, `CalibrationAnswer`

### 1.3 Config validation
**File**: `src/core/config.ts`
**Tasks**:
- Write Zod schemas matching the FR-7 config schema
- Parse JSON config into typed `StudyConfig`
- Throw `ConfigError` with field-level messages on invalid input
- Export JSON Schema for documentation

### 1.4 Events
**File**: `src/core/events.ts`
**Tasks**:
- Define `EngineEvent` discriminated union
- Include: `BYO_SUBMITTED`, `SCREEN_SUBMITTED`, `RULE_CONFIRMED`, `RULE_REJECTED`, `TOURNAMENT_TASK_SUBMITTED`, `CALIBRATION_SUBMITTED`
- Zod schemas for each event payload

### 1.5 Pure reducer
**File**: `src/core/reducer.ts`
**Tasks**:
- `createInitialState(studyId, respondentId, config, seed): EngineState`
- `reduce(state, event): EngineState` covering all phases
- Helper guards: `screeningComplete`, `collectSurvivors`, `tournamentFinished`
- Keep reducer pure — no I/O

### 1.6 State persistence
**File**: `src/core/state.ts`
**Tasks**:
- `saveEvent(log, event): PersistedLog` (append-only)
- `replay(log, config): EngineState` (rehydrate from event log)
- `migrateEvent(event, fromVersion, toVersion): EngineEvent` (forward compatibility)
- Port-based storage abstraction (memory for tests, sessionStorage for browser, server session for production)

### 1.7 Deterministic PRNG
**File**: `src/core/prng.ts`
**Tasks**:
- Seeded RNG implementation (e.g., splitmix32 or sfc32)
- `randInt(min, max)`, `random()`, `shuffle(array)` helpers
- Deterministic across Node and browser

### 1.8 Phase 1 tests
**Files**: `test/unit/*.test.ts`
**Tasks**:
- Config validation tests (valid, missing fields, wrong types)
- Reducer tests for each phase transition
- Event replay tests (determinism, migration)
- PRNG tests (seeded reproducibility)
- Property-based tests with fast-check: event sequences always produce valid state

## Scenarios for Phase 1

### S1 — Happy path / replay determinism
- Load valid sample config via Zod
- Create initial state
- Apply BYO_SUBMITTED, multiple SCREEN_SUBMITTED, RULE_CONFIRMED, TOURNAMENT_TASK_SUBMITTED, CALIBRATION_SUBMITTED
- Save event log
- Replay from event log with same config and seed
- PASS: replayed state equals original state byte-for-byte

### S2 — Edge: invalid config rejected
- Submit config missing `attributes` or with empty levels
- PASS: `ConfigError` thrown, message names offending field

### S3 — Regression: event log forward compatibility
- Persist event log written by older `eventVersion`
- Replay through current reducer
- PASS: reducer upgrades old events, no corruption, state valid

## OpenSurvey / SurveyJS integration strategy

- **Engine is the source of truth**: OpenSurvey/SurveyJS never mutate C0, cutoffs, survivors, or bracket state.
- **Adapter pattern**: each shell consumes `EngineState` snapshots and emits `EngineEvent` payloads back to the engine.
- **SurveyJS adapter** (primary): implement custom question types that render BYO/screening/tournament screens from state; use SurveyJS expression engine only for non-ACBC branching.
- **OpenSurvey adapter** (optional): if OpenSurvey has a plugin/custom-question API, build a thin wrapper; otherwise document that OpenSurvey is used for distribution only and ACBC screens are rendered by the engine.

## Validation & QA

- **Unit tests**: vitest, every module
- **Property-based tests**: fast-check, event sequences preserve invariants
- **Replay tests**: same seed → same state
- **Manual QA**: CLI script that runs a full robotic respondent and prints final design matrix
