# Public API Reference

The public API is exported from `src/index.ts`. It exposes the engine class, event helpers, persistence primitives, and types. Estimation helpers are exported from `src/estimation/matrix.js`, `src/estimation/mnl.js`, and `src/estimation/hb-interface.js`.

## `ACBCEngine`

The main facade that owns respondent state.

### Constructor

```typescript
new ACBCEngine(
  studyId: string,
  respondentId: string,
  config: unknown,
  seed: string,
  storage?: EventStorage
)
```

- `studyId` and `respondentId` identify the run.
- `config` is validated by Zod through `parseConfig()`.
- `seed` drives the deterministic PRNG.
- `storage` defaults to `MemoryStorage`. Use `SessionStorage` in the browser or a server-side adapter in production.

### Methods

#### `start(): EngineState`

Initializes the state, persists the empty event log, and emits `stateChange`.

```typescript
const state = engine.start();
console.log(state.phase); // "BYO"
```

#### `submitEvent(event: EngineEvent): EngineState`

Advances the engine by one event, persists the log, and emits `stateChange` and optionally `phaseChange`.

```typescript
engine.submitEvent({
  type: "BYO_SUBMITTED",
  answers: { brand: "brand_a", color: "color_red", price: "price_mid" },
});
```

#### `getState(): EngineState`

Returns the current state snapshot.

#### `getConfig(): StudyConfig`

Returns the parsed study configuration.

#### `loadState(state: EngineState): void`

Replaces the current state and rebuilds the event log from it.

#### `loadEventLog(log: EventLog): EngineState`

Replays an event log through the reducer and sets the result as the current state.

### Events

Subscribe to engine lifecycle events:

```typescript
engine.on("stateChange", (state) => {
  render(state);
});

engine.on("phaseChange", (newPhase, oldPhase, state) => {
  console.log(`${oldPhase} -> ${newPhase}`);
});
```

## `parseConfig`

```typescript
import { parseConfig } from "./src/index.js";

const studyConfig = parseConfig(rawJson);
```

Validates the study JSON and throws a `ConfigError` with field-level messages if the input is invalid.

## `parseEvent`

```typescript
import { parseEvent } from "./src/index.js";

const event = parseEvent(unknownPayload);
```

Validates an incoming event payload against the Zod event schemas.

## `buildDesignMatrix`

```typescript
import { buildDesignMatrix } from "./src/estimation/matrix.js";

const matrix = buildDesignMatrix(state, config);

for (const row of matrix.rows) {
  console.log(row.taskId, row.phase, row.response, row.values);
}
```

Returns a `DesignMatrix` containing the header, rows, and metadata for estimation. See [ESTIMATION.md](ESTIMATION.md) for details on the effects-coded format.

## `StreamingMNL`

A browser-native aggregate Multinomial Logit estimator intended for monitoring and diagnostics. It is not a substitute for server-side HB.

```typescript
import { StreamingMNL } from "./src/estimation/mnl.js";

const mnl = new StreamingMNL({ columns: matrix.header });
for (const row of matrix.rows) {
  mnl.update(row);
}
const result = mnl.estimate();
console.log(result.utilities);
console.log(result.converged, result.logLikelihood);
```

## `simulateRespondent` and `simulateCohort`

The robotic respondent harness lives in `test/harness.ts`.

```typescript
import { simulateRespondent, simulateCohort } from "./test/harness.js";
import config from "./test/fixtures/sample-study.json";

const run = simulateRespondent("demo", "r-1", config, {
  seed: "demo-seed",
  utilityNoise: 0.1,
});

const report = simulateCohort(config, 50, { seed: "cohort-seed" });
console.log(report.summary);
```

## Diagnostic functions

Located in `test/diagnostics.ts`.

```typescript
import {
  computeDEfficiency,
  levelBalance,
  duplicateRate,
  resumeSafetyCheck,
} from "./test/diagnostics.js";

const d = computeDEfficiency(matrix);
const balance = levelBalance(state.conceptPool, config);
const dup = duplicateRate(state.conceptPool);
const safe = resumeSafetyCheck(config, "demo-seed");
```

## Persistence adapters

### `MemoryStorage`

In-memory storage for tests and scripts.

```typescript
import { MemoryStorage } from "./src/index.js";

const engine = new ACBCEngine("s", "r", config, "seed", new MemoryStorage());
```

### `SessionStorage`

Browser adapter that persists the event log to `sessionStorage` so the survey survives a page refresh. The key is formed as `acbc:${studyId}:${respondentId}`.

```typescript
import { SessionStorage } from "./src/core/state.js";

const engine = new ACBCEngine("s", "r", config, "seed", new SessionStorage("s", "r"));
```

### `SessionStorageAdapter`

A simpler browser adapter that uses a single configurable key.

```typescript
import { SessionStorageAdapter } from "./src/core/state.js";

const engine = new ACBCEngine("s", "r", config, "seed", new SessionStorageAdapter("my-key"));
```
