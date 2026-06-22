# Validation

The engine includes a robotic respondent harness and diagnostic functions to verify design quality, determinism, and resume safety. These are development tools, not optional extras: design generation correctness can only be verified by simulating the full respondent pipeline.

## Robotic respondent harness

`test/harness.ts` simulates deterministic respondents with seeded true utilities. Each robot drives `ACBCEngine` through events only, never mutating state directly.

### Simulate one respondent

```typescript
import { simulateRespondent } from "acbc-engine/test/harness.js";
import config from "acbc-engine/test/fixtures/sample-study.json";

const run = simulateRespondent("demo", "r-1", config, {
  seed: "demo-seed",
  utilityNoise: 0.1,
  screeningThreshold: -100,
  calibrationEnabled: true,
});

console.log(run.finalState.phase); // "DONE"
console.log(run.trueUtilities);
console.log(run.eventLog);
```

### Simulate a cohort

```typescript
import { simulateCohort } from "acbc-engine/test/harness.js";

const report = simulateCohort(config, 50, { seed: "cohort-seed" });
console.log(report.summary);
```

The harness reports average screening responses, average tournament tasks, and average calibration score per cohort.

## Diagnostic functions

`test/diagnostics.ts` exports four quality checks.

### D-efficiency

```typescript
import { computeDEfficiency } from "acbc-engine/test/diagnostics.js";

const d = computeDEfficiency(matrix);
```

Computes `det(X'X)^(1/p)` after dropping `task_id` and `phase` columns. A value of 0 means the matrix is rank-deficient. D-efficiency is intended as an aggregate metric across many respondents, not for a single small run.

### Level balance

```typescript
import { levelBalance } from "acbc-engine/test/diagnostics.js";

const balance = levelBalance(state.conceptPool, config);
```

Reports observed counts, expected counts, and deviations for every attribute level in the concept pool.

### Duplicate rate

```typescript
import { duplicateRate } from "acbc-engine/test/diagnostics.js";

const rate = duplicateRate(state.conceptPool);
```

Returns the fraction of exact duplicate concepts in the pool. Near-zero is ideal.

### Resume safety

```typescript
import { resumeSafetyCheck } from "acbc-engine/test/diagnostics.js";

const safe = resumeSafetyCheck(config, "demo-seed");
```

Simulates a full respondent, persists the event log, replays it, and checks that the replayed state matches the live engine state byte-for-byte.

## CLI runner

`scripts/robotic-run.ts` runs a cohort from the command line:

```bash
npx tsx scripts/robotic-run.ts --respondents 50 --seed qa-run
```

It prints cohort summary, D-efficiency, duplicate rate, level balance, resume safety, and MNL utilities.

## Test coverage

The validation suite includes:

- Unit tests for `matrix.ts`, `mnl.ts`, and `hb-interface.ts`
- Property-based tests for event sequences
- Replay determinism tests
- Full end-to-end pipeline tests
- Diagnostic tests for D-efficiency, balance, duplicates, and resume safety

Run the full suite with `npm test`.
