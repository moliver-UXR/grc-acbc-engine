
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

## 2026-06-21 11:59 — SessionStorage adapter for browser persistence (NFR: State persistence)

- Added `SessionStorage` class to `src/core/state.ts` implementing `EventStorage`.
- Constructor: `new SessionStorage(studyId, respondentId)` — forms key `acbc:${studyId}:${respondentId}` (per spec).
- `save`/`load`/`clear` use `JSON.stringify`/`JSON.parse` against the global `sessionStorage`.
- Guards against `sessionStorage` being `undefined` (Node.js / SSR): `load` returns `null`, `save`/`clear` are no-ops. Uses `typeof sessionStorage === "undefined"` check (ReferenceError-safe).
- Did NOT modify the existing `EventStorage` interface, `MemoryStorage`, or the pre-existing `SessionStorageAdapter` (different semantics: single-string key, no undefined-guard).
- Test file: `test/unit/state-session-storage.test.ts` — 5 tests: round-trip with key-shape assertion, clear, missing-key returns null, undefined-sessionStorage no-op isolation, per-respondent isolation.
- Tests mock `globalThis.sessionStorage` via `Object.defineProperty` with an in-memory `MemoryStore` (Map-backed Web Storage stub); restored in `afterEach`.
- `npx tsc --noEmit` passes clean. `npx vitest run test/unit/state-session-storage.test.ts` → 5/5 pass.
- Closes NFR "State persistence" gap — enables browser refresh safety by persisting the append-only `EventLog` to `sessionStorage`.

## 2026-06-21 — Phase 2 academic logic complete

- Implemented `src/design/balancer.ts` with deficit weighting (12 tests)
- Implemented `src/design/price.ts` for component/summed price modeling (13 tests)
- Implemented `src/detection/cutoff.ts` for must-have/unacceptable rule detection (13 tests)
- Implemented `src/design/generator.ts` for near-neighbor concept pool generation (22 tests)
- Implemented `src/design/replacement.ts` for rule-invalidation replacement cards (10 tests)
- Refactored `src/core/reducer.ts` to use the new design and detection modules
- Full suite: 113 tests pass; `npx tsc --noEmit` clean

## 2026-06-21 — Piecewise price vector (`piecewisePriceVector` in `src/design/price.ts`)

- Added `piecewisePriceVector(price, breakpoints)` export to `src/design/price.ts` implementing FR-5 piecewise-linear price encoding.
- Given breakpoints `[b0, ..., bn]` (3-5 entries), returns n segment values: `0` if `price <= b(i-1)`, `bi - b(i-1)` if `price >= bi`, else `price - b(i-1)`.
- Edge cases handled: empty/single breakpoint → `[]`; price below all → all zeros; price above all → full segment widths; price at exact breakpoint boundary → saturates or zeros per segment.
- Validates strictly ascending breakpoints; throws `Error` on non-ascending or duplicate input to prevent silent miscoding.
- Pure function: does not mutate the input `breakpoints` array.
- 14 unit tests added in `test/unit/design/price.test.ts` covering: 3-bp middle/second-segment, above-all, below-all, exact-boundary (first/mid/last), 5-bp partial and saturated, empty, single, non-ascending throw, duplicate throw, non-mutation.
- `npx tsc --noEmit` passes. `npx vitest run test/unit/design/price.test.ts` passes.

## 2026-06-21 11:59 — FR-4 tie resolution in TOURNAMENT phase

- Extended `src/core/reducer.ts` TOURNAMENT case to handle `TOURNAMENT_TASK_SUBMITTED` with `chosenConceptId === null` (tie/None per FR-4).
- When null, instantiates `SeededRNG` with seed `${state.rngSeed}-tie-r${currentTournamentRound}-t${currentTournamentTask}` and uses `rng.pick(currentTask.concepts).id` to select a random winner from the 3 concepts.
- Seed incorporates round+task index so each matchup gets an independent coin flip (avoiding identical winners across all tasks in a round).
- Bracket advancement logic unchanged — always advances regardless of tie or explicit choice.
- No changes to `TournamentTask` type, `TournamentTaskSubmittedEvent` shape, or any file outside `src/core/reducer.ts` and `test/unit/reducer.test.ts`.
- Added 2 tests: (1) null chosenConceptId resolves to one of the 3 valid concept IDs; (2) determinism — same seed produces same coin-flip winner across independent state instances.
- `npx tsc --noEmit` passes clean. `npx vitest run test/unit/reducer.test.ts` — 11 tests pass (9 original + 2 new).

## 2026-06-21 12:08 — FR-6 Unified effects-coded design matrix (`src/estimation/matrix.ts`)

- Implemented `src/estimation/matrix.ts` exporting:
  - `DesignMatrix`, `MatrixColumn`, `MatrixRow`, `MatrixMetadata` interfaces
  - `effectsCode(levelIndex, levelCount)` — deviation-from-mean effects coding; last level aliased to `-1` in all L-1 columns.
  - `encodeAttributeLevels(concept, config)` — flat vector of discrete (non-price) attribute effects codes in config order.
  - `buildDesignMatrix(state, config)` — unified `.CHO`-compatible matrix across all phases.
- Header columns (deterministic order):
  1. One column per non-last level of each `price_type: "none"` attribute (`attrId_levelId`).
  2. Optional `price` continuous column when any price-type attribute exists.
  3. `none_threshold` binary column (1 for screening None alternative, 0 otherwise).
  4. `task_id` and `phase` metadata columns.
- Row order is deterministic: BYO → Screening → Tournament → Calibration.
- BYO: K rows (one per non-price BYO attribute), each encoding the full `C0` concept, `response = 1`, `taskId = byo-{attrId}`.
- Screening: one row per screened concept, `none_threshold = 1`, `response = 1` if possible else `0`, `taskId = screen-{screenIndex}`.
- Tournament: 3 rows per task, `response = 1` for winner, `0` for losers, `taskId = tournament-r{round}-t{task}`.
- Calibration: one row using the calibration concept, `response = purchaseIntent`, `taskId = calibration`.
- Test file: `test/unit/estimation/matrix.test.ts` — 16 tests covering effects coding for 2/3/4-level attributes, attribute-level encoding, header structure, all four phases, deterministic ordering, metadata, and price-column omission.
- `npx tsc --noEmit` passes. `npx vitest run test/unit/estimation/matrix.test.ts` — 16/16 pass.

## 2026-06-21 12:18 — Browser-native streaming aggregate MNL (`src/estimation/mnl.ts`)

- Implemented `src/estimation/mnl.ts` exporting:
  - `MNLResult` interface (`utilities`, `logLikelihood`, `iterations`, `converged`).
  - `logistic(x)` — numerically stable sigmoid.
  - `StreamingMNL` class with `update(row)` and `estimate()`.
- Constructor accepts optional `{ learningRate, maxIterations, convergenceThreshold, columns }`.
- `columns` (header metadata) selects only `type === "effect" | "price" | "none"` columns and names the returned utility keys; `task_id` and `phase` are ignored.
- BYO and Screening rows are treated as binary Bernoulli observations (`P = logistic(utility)`).
- Tournament rows are grouped by `taskId` and modelled with softmax over the three concept utilities.
- Gradient ascent uses the mean residual × feature gradient across all streamed rows.
- CALIBRATION rows are intentionally excluded from this provisional client-side estimator.
- Test file: `test/unit/estimation/mnl.test.ts` — 11 tests covering logistic behaviour, empty input, simple 2-attribute utility recovery, streaming one row at a time, task_id/phase skip verification, tournament softmax grouping, independent task grouping, and continuous price/none column estimation.
- `npx tsc --noEmit` passes. `npx vitest run test/unit/estimation/mnl.test.ts` — 11/11 pass.


## 2026-06-21 12:15 — FR-6 HB endpoint contract (`src/estimation/hb-interface.ts`)

- Implemented `src/estimation/hb-interface.ts` — the wire contract between the ACBC engine and an external server-side HB estimator. This is only the contract layer; no HB sampler is implemented.
- Exports:
  - `HBOptions` — `{ chains?, iterations?, burnIn?, thinning?, seed? }`.
  - `HBRequest` — internal handle bundling `{ studyId, respondentId, matrix, options? }`.
  - `HBResult` — `{ respondentUtilities, attributeImportance, noneUtility, converged, diagnostics }`.
  - `HBPayload` — wire format `{ version, studyId, respondentId, columns, rows, options? }`.
  - `serializeMatrix(matrix, options?)` — collapses DesignMatrix header to column-name array, maps rows to `{ taskId, phase, values, response }`, stamps `version: "1.0.0"`.
  - `parseHBResult(payload, matrix)` — validates with TypeScript type guards (no Zod), computes `attributeImportance`, returns typed `HBResult`. Throws on invalid payload.
  - `buildHBRequest(matrix, options?)` — convenience wrapper extracting studyId/respondentId from matrix metadata.
- Type guards: `isRecord`, `isNumberRecord` (rejects NaN/Infinity), `isHBServerResponse` — all hand-written, zero new deps.
- Attribute importance calculation:
  - Discrete (effects-coded) attributes: group columns by prefix before first `_` in column name. For L levels, omitted level utility = `−sum(explicit L−1 utilities)`. Range = `max − min` across all L utilities.
  - Continuous price: range = `|β_price| × (max_price − min_price)` observed in matrix rows.
  - Importance = `(attribute range) / (sum of all attribute ranges) × 100`. Zero denominator → all importances 0.
  - `none_threshold`, `task_id`, `phase` columns are excluded from importance.
- Design decision: `attributeOfColumn` splits effect column names on the first underscore (`{attrId}_{levelId}` convention from `matrix.ts`). This is correct when attribute IDs don't contain underscores. A more robust approach would store `attrId` in `MatrixColumn`, but that would require modifying `matrix.ts` (out of scope for this task).
- Test file: `test/unit/estimation/hb-interface.test.ts` — 27 tests covering:
  - `serializeMatrix`: version, ids, columns, rows, options passthrough, JSON serializability, phase as string.
  - `buildHBRequest`: full bundle, no-options, interface shape.
  - `parseHBResult` happy path: utilities, noneUtility, converged, diagnostics, importance calculation (verified against hand-computed values: brand≈25.8%, color≈9.7%, price≈64.5%), importances sum to 100, zero-utility edge case, missing utility keys (graceful 0 default), exclusion of non-attribute columns.
  - `parseHBResult` validation: null, undefined, string, number, array, missing fields, wrong types, NaN, Infinity — all throw.
  - Round-trip: matrix → buildHBRequest → serializeMatrix → simulated server response → parseHBResult, with JSON serialization survival test.
- `npx tsc --noEmit` passes (exit 0). `npx vitest run test/unit/estimation/hb-interface.test.ts` — 27/27 pass.

## 2026-06-21 — NFR diagnostic quality checks (`test/diagnostics.ts`)

- Implemented `test/diagnostics.ts` exporting design-quality diagnostics:
  - `computeDEfficiency(matrix)` — D-criterion `det(X'X)^(1/p)` after dropping `task_id`/`phase` columns; uses pure JS LU decomposition with partial pivoting, returns `0` for singular or empty matrices.
  - `levelBalance(pool, config)` — per-attribute level counts, expected frequency (`pool.length / levelCount`), and deviation.
  - `duplicateRate(pool)` — fraction of exact level duplicates in the concept pool.
  - `resumeSafetyCheck(config, seed)` — simulates a full respondent through `ACBCEngine`, persists the event log in `MemoryStorage`, replays via `replay(log, config)`, and compares the replayed state to the live engine state byte-for-byte (`JSON.stringify`).
- Simulation details:
  - BYO answers pick the first level of every `in_byo` attribute.
  - Screening submits all concepts as `possible: true` in `screens_per_concept_batch` batches.
  - Candidate must-have/unacceptable rules are rejected so the check completes without config-dependent cutoff branches.
  - Tournament winners are always the first concept in the current task; calibration (if enabled) uses the first pool concept and a fixed intent score.
- Test file: `test/unit/diagnostics.test.ts` — 11 tests covering:
  - D-efficiency for singular and full-rank matrices, empty matrix, and metadata-column exclusion.
  - Level balance counts/expected/deviation and empty-pool behavior.
  - Duplicate-rate unique, mixed, and empty pools.
  - Resume safety replay match and seed determinism.
- `npx tsc --noEmit` passes. `npx vitest run test/unit/diagnostics.test.ts` — 11/11 pass.
- Did not modify any core engine files and did not add external math dependencies.

## 2026-06-21 — Robotic respondent simulation harness (`test/harness.ts`)

- Implemented `test/harness.ts` exporting the NFR validation harness:
  - `RoboticRespondentOptions` (`seed`, `utilityNoise`, `screeningThreshold`, `calibrationEnabled`).
  - `RespondentRun` and `CohortReport` result shapes.
  - `generateRandomUtilities(config, rng)` — deterministic true utilities keyed by effects-coded matrix column names (`{attrId}_{levelId}` for non-reference levels, `price` for continuous price coefficient).
  - `simulateRespondent(studyId, respondentId, config, options)` — drives `ACBCEngine` via events only.
  - `simulateCohort(config, n, options)` — runs N respondents with seeded per-respondent ids.
- Behavior:
  - BYO: chooses the highest part-worth level per `in_byo` attribute; price levels are evaluated as `price_coefficient * price_increment`.
  - Screening: computes concept utility = sum of effects-coded part-worths + price × coefficient + optional uniform noise; marks possible when utility exceeds `screeningThreshold`.
  - Cutoff rules: always confirms detected candidate rules (`RULE_CONFIRMED`).
  - Tournament: selects the highest-utility concept in each triple; ties within `1e-9` are resolved by a separate seeded RNG.
  - Calibration: maps the BYO concept's utility to a 1–5 purchase-intent scale proportional to its rank within the observed concept utility range.
- Defaults chosen for robust simulation: `screeningThreshold = -100` ensures concepts are marked possible so the tournament bracket is non-empty and every run reaches `DONE`.
- `MemoryStorage` is passed to `ACBCEngine` so the returned `RespondentRun.eventLog` is the actual persisted event log.
- Test file `test/unit/harness.test.ts` covers:
  - Utility key generation matching matrix columns.
  - Determinism under the same seed.
  - Single respondent reaching `DONE`.
  - Calibration-enabled config reaching `DONE` with a valid 1–5 intent.
  - Cohort of 10 respondents all reaching `DONE` with summary metrics.
- `npx tsc --noEmit` passes. `npx vitest run test/unit/harness.test.ts` — 8/8 pass.

## 2026-06-21 — End-to-end integration test (`test/integration/full-pipeline.test.ts`)

- Created `test/integration/full-pipeline.test.ts` to exercise the full respondent pipeline: BYO → Screening → Tournament → DesignMatrix → MNL/HB → Diagnostics.
- Uses `sample-study.json` as the study config and `simulateRespondent` from `test/harness.ts` to generate a deterministic event log.
- Verifies `buildDesignMatrix` produces rows from BYO, Screening, and Tournament phases.
- Streams the matrix into `StreamingMNL.estimate` and confirms a non-empty utility record with finite values.
- Serializes the matrix with `serializeMatrix`, builds an `HBRequest` with `buildHBRequest`, and parses a mock HB server response with `parseHBResult`.
- Confirms the parsed HB result contains `respondentUtilities`, `attributeImportance`, and `noneUtility`.
- Computes diagnostics: `computeDEfficiency`, `levelBalance`, `duplicateRate`, and `resumeSafetyCheck`; asserts resume safety returns `true`.
- `npx tsc --noEmit` passes. `npx vitest run test/integration/full-pipeline.test.ts` passes.

## 2026-06-21 — Manual QA CLI (`scripts/robotic-run.ts`)

- Implemented `scripts/robotic-run.ts` — a zero-dependency CLI that runs a robotic respondent cohort and prints diagnostics.
- CLI args parsed from `process.argv`: `--respondents N` (default 50), `--seed VALUE` (default `default-seed`). No CLI dependency added; pure `for`-loop over `argv`.
- Loads `test/fixtures/sample-study.json` via `readFileSync` + `JSON.parse` (avoids `resolveJsonModule` dependency; fixture path resolved relative to `import.meta.url`).
- Calls `simulateCohort(config, n, { seed })` from `test/harness.ts`.
- For the first respondent run, builds the unified design matrix via `buildDesignMatrix(finalState, config)`, streams every row into `new StreamingMNL({ columns: matrix.header })`, then calls `estimate()`.
- Computes `computeDEfficiency(matrix)`, `duplicateRate(conceptPool)`, `levelBalance(conceptPool, config)`, and `resumeSafetyCheck(config, seed)` from `test/diagnostics.ts`.
- Prints the required summary to stdout:
  ```
  Cohort: N respondents
  Avg screening responses: X
  Avg tournament tasks: Y
  D-efficiency: Z
  Duplicate rate: W
  Level balance: [...]
  Resume safety: true/false
  MNL utilities: { ... }
  ```
- Verified: `npx tsx scripts/robotic-run.ts` exits 0; `--respondents 3 --seed qa-run` exits 0 with seed-dependent utilities differing from the default run.
- Observation: D-efficiency reports `0` for the single-respondent sample-study matrix because the 6-concept near-neighbor pool plus BYO rows is rank-deficient — this is the diagnostic correctly flagging a singular `X'X`, not a script bug. Aggregate D-efficiency across a larger cohort is the intended NFR metric.
- No core engine files modified; no new dependencies.

## 2026-06-21 — Phase 4 estimation and validation complete

- Implemented `src/estimation/matrix.ts` — unified effects-coded design matrix (16 tests)
- Implemented `src/estimation/mnl.ts` — streaming aggregate MNL estimator (11 tests)
- Implemented `src/estimation/hb-interface.ts` — HB server endpoint contract (27 tests)
- Implemented `test/harness.ts` — robotic respondent simulation (8 tests)
- Implemented `test/diagnostics.ts` — D-efficiency, level balance, duplicate rate, resume safety (11 tests)
- Implemented `test/integration/full-pipeline.test.ts` — end-to-end pipeline (7 tests)
- Implemented `scripts/robotic-run.ts` — CLI cohort runner
- Extended `src/core/state.ts` with `SessionStorage` adapter (5 tests)
- Extended `src/core/reducer.ts` with tournament tie resolution
- Extended `src/design/price.ts` with piecewise price vector
- Extended `src/design/generator.ts` with D-efficiency relabeling
- Full suite: 214 tests pass across 18 test files; `npx tsc --noEmit` clean
- CLI verified with 5-respondent cohort producing utilities and diagnostics

## 2026-06-21 — Documentation suite added under `doc/`

- Created `doc/README.md` with project overview, quick start, and install instructions.
- Created `doc/ARCHITECTURE.md` describing the core, design, detection, estimation, and integration layers.
- Created `doc/API.md` covering `ACBCEngine`, `buildDesignMatrix`, `StreamingMNL`, `simulateRespondent`, persistence adapters, and diagnostic functions.
- Created `doc/CONFIG.md` explaining the study configuration schema with the full `test/fixtures/sample-study.json` example.
- Created `doc/PHASES.md` documenting BYO, Screening, Tournament, Calibration, and rule confirmation phases.
- Created `doc/ESTIMATION.md` describing effects coding, the unified design matrix, Streaming MNL, and the HB endpoint contract.
- Created `doc/VALIDATION.md` for the robotic respondent harness and diagnostic quality checks.
- Created `doc/SLR_SUMMARY.md` as a concise summary of the systematic literature review findings.
- No source files were modified.

## 2026-06-21 — Documentation suite refreshed for implementation accuracy

- Rewrote all eight files under `doc/` to align with the current source tree.
- Updated API examples to use relative ESM imports (`./src/index.js`, `./src/estimation/matrix.js`, etc.) matching the codebase.
- Added `SessionStorageAdapter` to `doc/API.md` alongside `SessionStorage`.
- Added `encodeAttributeLevels`, `getConceptPrice`, and `piecewisePriceVector` coverage in `doc/ESTIMATION.md`.
- Clarified screening completion rule (`total_screening_screens * screens_per_concept_batch`) in `doc/PHASES.md` and `doc/CONFIG.md`.
- Clarified must-have detection requires that no other level of the attribute has been accepted.
- Verified no source files were modified; only `doc/*.md` and `.omo/notepads/acbc-implementation-plan/learnings.md` changed.

