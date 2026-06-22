# Phase 4 — Estimation and Validation (Scoped Plan)

## Goal

Produce estimation-ready design matrices, provisional aggregate utilities, a server-side HB contract, and a robotic-respondent validation harness with diagnostics. Closes the remaining SLR gaps (FR-6, NFR validation, NFR state persistence).

## Scope

### In scope
1. Effects-coded design matrix export (BYO + Screening + Tournament + Calibration)
2. Streaming aggregate MNL estimator (client-side, monitoring only)
3. HB server endpoint interface contract (request/response types + serialization)
4. Piecewise linear price encoding for estimation
5. Robotic-respondent simulation harness
6. Diagnostics: D-efficiency, level balance, duplicate rate, resume safety
7. `sessionStorage` storage adapter (NFR state persistence)
8. Tournament tie resolution (coin flip / None)
9. D-efficiency improvement via relabeling/swapping in generator (FR-2 gap)

### Out of scope (deferred)
- Actual HB runtime (R/Python/WASM) — only the interface contract
- Production concurrency testing (≥100 respondents) — harness covers single-process simulation
- Extensibility plugin API — separate future work
- OpenSurvey adapter — remains optional/deferred
- Latency micro-benchmarks — harness provides coarse timing

## Deliverables

| Module | File | Exports |
|---|---|---|
| Design matrix builder | `src/estimation/matrix.ts` | `buildDesignMatrix(state, config): DesignMatrix`, `effectsCode(...)`, `encodePricePiecewise(...)` |
| Streaming MNL | `src/estimation/mnl.ts` | `class StreamingMNL`, `estimate(matrix): MNLResult` |
| HB interface contract | `src/estimation/hb-interface.ts` | `type HBRequest`, `type HBResult`, `serializeMatrix(matrix): HBPayload`, `parseHBResult(payload): Utilities` |
| Piecewise price | `src/design/price.ts` (extend) | `piecewisePriceVector(price, breakpoints): number[]` |
| Session storage | `src/core/state.ts` (extend) | `class SessionStorage implements EventStorage` |
| Tournament ties | `src/core/reducer.ts` (extend) | tie resolution in TOURNAMENT phase |
| D-efficiency relabel | `src/design/generator.ts` (extend) | `improveDEfficiency(pool, config): Concept[]` |
| Robotic harness | `test/harness.ts` | `simulateRespondent(config, seed): RespondentRun`, `simulateCohort(config, n): CohortReport` |
| Diagnostics | `test/diagnostics.ts` | `computeDEfficiency(matrix): number`, `levelBalance(pool): BalanceReport`, `duplicateRate(pool): number`, `resumeSafetyCheck(seed): boolean` |
| Integration tests | `test/integration/*.test.ts` | end-to-end pipeline tests |
| CLI demo | `scripts/robotic-run.ts` | runs a cohort and prints diagnostics |

## Task breakdown and execution batches

### Batch 1 — Independent foundation (parallel)
- **T1.1** `src/estimation/matrix.ts` + tests — effects-coded matrix builder
- **T1.2** `src/core/state.ts` extend with `SessionStorage` + tests
- **T1.3** `src/design/price.ts` extend with `piecewisePriceVector` + tests
- **T1.4** `src/core/reducer.ts` extend with tournament tie resolution + tests
- **T1.5** `src/design/generator.ts` extend with D-efficiency relabeling + tests

### Batch 2 — Estimation backends (parallel, depends on T1.1)
- **T2.1** `src/estimation/mnl.ts` + tests — streaming aggregate MNL
- **T2.2** `src/estimation/hb-interface.ts` + tests — HB request/response contract

### Batch 3 — Validation harness (depends on T1.1)
- **T3.1** `test/harness.ts` — robotic respondent simulation
- **T3.2** `test/diagnostics.ts` — D-efficiency, balance, duplicate, resume safety

### Batch 4 — Integration and CLI (depends on T3)
- **T4.1** `test/integration/full-pipeline.test.ts` — end-to-end BYO→Screening→Tournament→Matrix
- **T4.2** `scripts/robotic-run.ts` — CLI demo

### Batch 5 — Verification
- **T5.1** Run full test suite + typecheck
- **T5.2** Run robotic cohort and verify diagnostics output
- **T5.3** Update plan and notepad

## Dependencies

```
T1.1 matrix ──┬── T2.1 mnl
              ├── T2.2 hb-interface
              ├── T3.1 harness
              └── T3.2 diagnostics
T1.2 sessionStorage (independent)
T1.3 piecewise price (independent)
T1.4 tie resolution (independent)
T1.5 D-efficiency relabel (independent)
T3.1 harness + T3.2 diagnostics ── T4.1 integration ── T4.2 CLI
```

## Acceptance criteria

- [ ] `npx vitest run` passes with all new tests
- [ ] `npx tsc --noEmit` clean
- [ ] `scripts/robotic-run.ts` runs a 50-respondent cohort and prints D-efficiency, balance, duplicate rate, resume safety
- [ ] `buildDesignMatrix` produces an effects-coded matrix covering all three phases
- [ ] `StreamingMNL.estimate` returns a utility vector from a matrix
- [ ] `serializeMatrix` / `parseHBResult` round-trip a payload
- [ ] `SessionStorage` persists and replays an event log in a browser-like environment
- [ ] Tournament ties resolve to a winner or None
- [ ] Generator D-efficiency improvement does not break determinism

## Execution location

All work in the `phase4` worktree at `F:\Documents\OpenCode\acbc-phase4-worktree` unless noted otherwise. The main worktree stays on `master`.

## Risks

- **MNL math**: streaming logit needs careful numerics; keep it simple (vanilla MNL, no regularization) since it's monitoring-only
- **HB contract**: without a real HB runtime, the contract is speculative; keep types minimal and documented
- **D-efficiency relabeling**: must preserve determinism (seeded); test against existing generator tests
- **Robotic respondents**: need realistic utility generation and a choice model to produce responses; use simple additive utility + logit choice
