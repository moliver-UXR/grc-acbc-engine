# Architecture Overview

The ACBC engine is organized as a set of concentric layers. The inner layers are pure functions and deterministic state machines. The outer layers connect to survey shells and estimation backends. Survey shells are thin renderers. The engine owns all business logic, state, and estimation data.

## High-level flow

```
StudyConfig (JSON / Zod)
         │
         ▼
   ACBCEngine
         │
         ▼
   Pure Reducer + Event Log
         │
         ├── Design Generator — near-neighbor concepts
         ├── Cutoff Detector — must-have / unacceptable rules
         ├── Replacement Generator — fill pruned slots
         └── Tournament Builder — bracket and triples
         │
         ▼
   Design Matrix Builder
         │
         ├── Streaming MNL (browser)
         └── HB Endpoint Contract (server)
```

## Engine layers

### 1. Core

Located in `src/core/`.

- `types.ts` — domain model: `StudyConfig`, `Concept`, `EngineState`, `CutoffRule`, and others
- `config.ts` — Zod schemas and `parseConfig()` for validating the study JSON
- `events.ts` — discriminated union of all engine events (`BYO_SUBMITTED`, `SCREEN_SUBMITTED`, etc.)
- `reducer.ts` — pure `reduce(state, event, config)` function that advances `EngineState`
- `state.ts` — append-only event-log persistence, replay, and storage adapters (`MemoryStorage`, `SessionStorage`, `SessionStorageAdapter`)
- `prng.ts` — deterministic seeded RNG (`SeededRNG`) used across all randomized modules

The core never performs I/O. All randomness is driven by `SeededRNG`, so the same seed and event sequence always produces the same final state.

### 2. Design

Located in `src/design/`.

- `generator.ts` — near-neighbor concept pool generation seeded by the BYO concept
- `balancer.ts` — level-balance counts with deficit weighting so underrepresented levels are preferred
- `replacement.ts` — regenerates concepts invalidated by confirmed cutoff rules
- `price.ts` — summed, component, and piecewise-linear price handling with random variation

### 3. Detection

Located in `src/detection/`.

- `cutoff.ts` — scans screening responses and proposes must-have or unacceptable rules based on exposure patterns

### 4. Estimation

Located in `src/estimation/`.

- `matrix.ts` — builds the unified effects-coded design matrix from `EngineState`
- `mnl.ts` — `StreamingMNL`, a browser-native aggregate Multinomial Logit estimator
- `hb-interface.ts` — serialization contract and result parser for external HB services

### 5. Integration

Located in `src/integration/`.

- `surveyjs-adapter.ts` — renders BYO, screening, and tournament screens using SurveyJS dynamic questions
- `opensurvey-adapter.ts` — planned adapter for OpenSurvey.js (optional)

Adapters consume `EngineState` snapshots and emit `EngineEvent` payloads back to the engine. They never mutate C0, cutoffs, survivors, or tournament bracket state directly.

## State authority

`EngineState` is the single source of truth. In production it lives server-side or in `sessionStorage`. The event log can be replayed through the reducer to reconstruct the exact same state, which supports:

- page refresh survival
- audit trails
- deterministic QA and robotic respondent tests

## Public API entry point

`src/index.ts` exports `ACBCEngine` and the public types and helpers. It deliberately does not re-export integration adapters, keeping the engine core free of shell dependencies.
