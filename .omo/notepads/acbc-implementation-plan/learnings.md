
# ACBC Implementation Learnings

## 2026-06-21

### Decoupled SurveyJS Adapter from Public API

**What changed:** Removed the SurveyJS adapter re-exports (\enderACBCSurvey\, \onStateChange\, \injectACBCStyles\, \ACBCEngineInterface\, \AdapterOptions\) from \src/index.ts\ (lines 126-132). The public API entry point now exports only the core engine.

**Why:** The public API entry point must remain decoupled from optional shell adapters so that consumers who only need the engine core do not pull in SurveyJS types or browser-only code. Adapter consumers now import directly from \src/integration/surveyjs-adapter.js\ instead of \src/index.js\.

**Files modified:**
- \src/index.ts\ � deleted adapter re-export block (lines 126-132)

**Verification:** \
px tsc --noEmit\ passes (exit 0).

## 2026-06-21 10:03:38 — Phase 3 UX shell completion

- Removed SurveyJS adapter re-exports from `src/index.ts` to keep the public API independent.
- Full vitest suite passes: 43 tests across 6 files.
- `npx tsc --noEmit` passes.
- Verified `demo/index.html` loads via Playwright; BYO phase renders with 3 attribute dropdowns.
- Only console error on demo load is missing `favicon.ico` (benign).
- Cancelled two stale team-mode background tasks (`bg_f71da702`, `bg_420b0feb`) after their work was covered by direct delegations.

## 2026-06-21 10:22 — Phase 2: Level-balance tracker (balancer.ts)

- Extracted inline balance logic from `src/core/reducer.ts:43-84` into standalone `src/design/balancer.ts`.
- Exports: `type LevelCounts`, `function createBalancer`, `interface LevelBalancer { record, getCounts, selectLevel, reset }`.
- `selectLevel` uses deficit weighting: `weight = 1/(count+1)` so underrepresented levels are preferred during near-neighbor generation.
- Throws `Error` if `selectLevel` receives empty `allowedLevels`.
- Uses `SeededRNG` from `src/core/prng.ts` for deterministic selection.
- Test file: `test/unit/design/balancer.test.ts` — 12 tests covering initialization, recording, deficit weighting preference, uniform distribution, reset, edge cases.
- All 81 tests pass (9 test files). `npx tsc --noEmit` passes.

## 2026-06-21 10:19 — Price computation module (`src/design/price.ts`)

- Implemented `computePrice`, `basePrice`, and `applyPriceVariation` functions.
- `price_type: "none"` → returns `undefined`; `"component"` / `"summed"` → sum of `price_increment` across matching levels.
- When `SeededRNG` provided: applies ±`price_variation_pct`% uniform variation, rounds to `price_rounding` unit.
- All functions are pure — no mutation of `Concept` or config.
- 13 unit tests pass covering summed, component, no-price, variation bounds, rounding, and determinism.
- `npx tsc --noEmit` passes clean.

## 2026-06-21 10:32 — Concept replacement module (`src/design/replacement.ts`)

- Implemented `replaceInvalidatedConcepts` and `regeneratePool` functions.
- `replaceInvalidatedConcepts`: filters out concepts violating cutoff rules via `isRuleViolated`, then fills pool back to original size using `nearNeighborConcept`.
- Replacement concepts have `source: "REPLACEMENT"` and unique IDs prefixed `replacement-`.
- `regeneratePool` is an alias for REGENERATE phase use.
- `tryGenerateReplacement` has 50 max attempts per replacement; returns null if no valid concept can be generated (e.g., all levels ruled out).
- Uses `isRuleViolated` from `src/detection/cutoff.js` — works correctly for `unacceptable` rules. `mustHave` rules require inverted semantics not yet implemented.
- Uses `nearNeighborConcept` from `src/design/generator.js` which pre-filters unacceptable levels during generation.
- 10 unit tests pass covering: no-violation passthrough, unacceptable removal, pool size stability, REPLACEMENT source tagging, rule compliance, multiple rules, single-level exhaustion, and regenerate alias.
- `npx tsc --noEmit` passes. All 10 tests pass.

## 2026-06-21 10:32 — Near-neighbor concept pool generator (`src/design/generator.ts`)

- Extracted inline generator from `src/core/reducer.ts:34-88` into standalone `src/design/generator.ts`.
- Exports: `generateNearNeighborPool`, `nearNeighborConcept`, `isConceptDuplicate`.
- `generateNearNeighborPool(c0, rules, config, rng)` generates `T` concepts near BYO seed `c0`:
  - Each concept varies `Amin`–`Amax` attributes randomly selected from `in_byo` attributes.
  - Uses `createBalancer` with deficit weighting (`1/(count+1)`) for level selection.
  - Filters out unacceptable levels per `rules` during attribute selection.
  - Rejects must-have violations (`candidate.levels[rule.attributeId] !== rule.levelId`).
  - Rejects unacceptable violations via `isRuleViolated` from `src/detection/cutoff.ts`.
  - Rejects exact duplicates (same levels for all attributes).
  - Computes price via `computePrice` from `src/design/price.ts`.
  - Concept IDs: `concept-${index + 1}`, source: `"SCREENING"`.
- `nearNeighborConcept(c0, config, rng, rules?)` generates a single near-neighbor concept; returns `null` when all levels of a varied attribute are filtered out.
- `isConceptDuplicate(candidate, pool)` checks level-by-level equality against existing pool.
- **Bug fix**: Original reducer line 26 only checked `isRuleViolated` (unacceptable rules) but missed `mustHave` rule violations. Fixed in generator.ts with explicit `mustHave` check.
- 22 unit tests pass covering: duplicate detection, single concept generation, pool generation, rule filtering (unacceptable + mustHave), price computation, determinism, ID sequencing, source tagging, non-mutation of c0, and in_byo attribute scoping.
- `npx tsc --noEmit` passes clean.

## 2026-06-21 10:37 — Reducer refactored to use standalone modules

- Refactored `src/core/reducer.ts` to import from standalone modules instead of inline implementations.
- Removed inline functions: `generateNearNeighborPool` (89→44 lines), `detectCandidateRule` (35 lines), and their helpers.
- Imports:
  - `generateNearNeighborPool` from `src/design/generator.js` — replaces inline near-neighbor generation in BYO and REGENERATE phases.
  - `detectCandidateRule` from `src/detection/cutoff.js` — replaces inline cutoff pattern detection in SCREENING phase.
  - `regeneratePool` from `src/design/replacement.js` — used in REGENERATE phase to incrementally replace invalidated concepts instead of full regeneration.
- Kept helper functions with no module equivalent: `buildByoConcept`, `screeningComplete`, `collectSurvivors`, `makeTriples`, `sharedAttributes`, `buildTournament`, `mapRuleToPhase`.
- REGENERATE phase now uses `regeneratePool(existingPool, rules, c0, config, rng)` which filters out rule-violating concepts and fills back to original size — an improvement over the previous full regeneration from scratch.
- Deterministic behavior preserved: `SeededRNG` instantiated with `state.rngSeed` before each module call, matching original seed→state reproducibility.
- `npx tsc --noEmit` passes. All 9 reducer tests pass.

## 2026-06-21 10:18 — Cutoff pattern detection module (`src/detection/cutoff.ts`)

- Extracted and refactored `detectCandidateRule` from `src/core/reducer.ts` (lines 90-124) into a standalone, testable module.
- Exports: `detectCandidateRule`, `isRuleViolated`, `buildExposureTable`.
- Unacceptable detection runs before must-have (per spec PH-2a before PH-2b).
- `confirmedAtScreen` set to `screened.length` (not the original `Math.floor(screened.length / 4)`).
- Added `minExposure` parameter (default 3) for configurable exposure threshold.
- 13 unit tests covering: empty input, exposure table correctness, rule violation check, unacceptable detection, must-have detection, must-have rejection when other levels accepted, confirmed rule skipping, unacceptable preference, custom minExposure, and no-pattern null return.
- `npx tsc --noEmit` passes. All 13 tests pass.

## 2026-06-21 — Phase 2 academic logic complete

- Implemented `src/design/balancer.ts` with deficit weighting (12 tests)
- Implemented `src/design/price.ts` for component/summed price modeling (13 tests)
- Implemented `src/detection/cutoff.ts` for must-have/unacceptable rule detection (13 tests)
- Implemented `src/design/generator.ts` for near-neighbor concept pool generation (22 tests)
- Implemented `src/design/replacement.ts` for rule-invalidation replacement cards (10 tests)
- Refactored `src/core/reducer.ts` to use the new design and detection modules
- Full suite: 113 tests pass; `npx tsc --noEmit` clean
