# Data Flow Deep Dive

> A visual, step-by-step walkthrough of how data moves through the ACBC Engine from initialization to estimation.

---

## Overview

The ACBC Engine processes data through **five major stages**:

`
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ 1. INIT  │───▶│ 2. BYO   │───▶│ 3.SCREEN │───▶│ 4.TOURNY │───▶│ 5.ESTIM  │
│          │    │          │    │          │    │          │    │          │
│ Config   │    │ C0 seed  │    │ Concepts │    │ Bracket  │    │ Matrix   │
│ + Seed   │    │ + Pool   │    │ + Rules  │    │ + Winner │    │ + Utils  │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
`

Each stage transforms data and passes it to the next. Let us trace every transformation.

---

## Stage 1: Initialization

### Input
- **StudyConfig** (JSON) — defines attributes, levels, design parameters
- **studyId** (string) — identifies the study
- **respondentId** (string) — identifies the respondent
- **seed** (string) — drives deterministic randomness
- **storage** (EventStorage) — where to persist the event log

### Process

`	ypescript
// 1. Validate config
const config = parseConfig(rawJson);
// Throws ConfigError if invalid

// 2. Create initial state
const state = createInitialState(studyId, respondentId, config, seed);
// Returns: { phase: "BYO", byoConcept: null, conceptPool: [], ... }

// 3. Create event log
const log = createEventLog(state);
// Returns: { events: [], initialState: state }

// 4. Create RNG
const rng = new SeededRNG(seed);
// Deterministic — same seed = same random sequence
`

### Output
- **EngineState** with phase: "BYO" and all fields empty/null
- **EventLog** with empty events array
- **SeededRNG** ready for deterministic random operations

### Key Files
- src/core/config.ts — parseConfig()
- src/core/reducer.ts — createInitialState()
- src/core/state.ts — createEventLog()
- src/core/prng.ts — SeededRNG

---

## Stage 2: Build Your Own (BYO)

### Input
- **EngineState** with phase: "BYO"
- **BYO_SUBMITTED event** with nswers: Record<string, string>

### Process

`	ypescript
// 1. Build C0 concept from answers
const byoConcept = {
  id: "byo-concept",
  levels: { ...answers },  // e.g., { brand: "apple", ram: "16gb" }
  source: "BYO",
};

// 2. Generate near-neighbor concept pool
const rng = new SeededRNG(state.rngSeed);
const conceptPool = generateNearNeighborPool(byoConcept, [], config, rng);
// Returns T concepts (e.g., 20) that vary 2-4 attributes from C0

// 3. Update state
return {
  ...state,
  byoConcept,
  conceptPool,
  phase: "SCREENING",
};
`

### Near-Neighbor Generation Algorithm

For each of T concepts:
1. Pick random number of attributes to vary: i = randInt(Amin, Amax)
2. Shuffle BYO attributes randomly
3. Select first i attributes to vary
4. For each varied attribute:
   - Get allowed levels (exclude unacceptable levels)
   - Use balancer to prefer underrepresented levels
   - Pick a new level
5. Check for duplicates (skip if duplicate)
6. Compute price: asePrice + random variation
7. Assign ID: concept-1, concept-2, etc.

### Output
- **EngineState** with phase: "SCREENING", populated yoConcept and conceptPool
- **EventLog** with one event appended

### Key Files
- src/core/reducer.ts — BYO case in educe()
- src/design/generator.ts — generateNearNeighborPool()
- src/design/balancer.ts — createBalancer()
- src/design/price.ts — computePrice()

---

## Stage 3: Screening

### Input
- **EngineState** with phase: "SCREENING"
- **SCREEN_SUBMITTED event** with esponses: ScreeningResponse[]

### Process

`	ypescript
// 1. Append responses to history
const screened = [...state.screened, ...event.responses];

// 2. Detect candidate cutoff rules
const candidate = detectCandidateRule(screened, state.conceptPool, state.confirmedRules);

// 3a. If rule detected → enter confirmation phase
if (candidate) {
  return {
    ...state,
    screened,
    candidateRule: candidate,
    phase: candidate.kind === "mustHave" ? "CONFIRM_MUST_HAVE" : "CONFIRM_UNACCEPTABLE",
  };
}

// 3b. If screening complete → build tournament
if (screeningComplete(screened, config)) {
  const survivors = collectSurvivors(screened);  // concepts marked "possible"
  const rounds = buildTournament(survivors, state.conceptPool, state.rngSeed);
  return {
    ...state,
    screened,
    survivingConceptIds: survivors,
    tournamentRounds: rounds,
    phase: "TOURNAMENT",
  };
}

// 3c. Otherwise → continue screening
return { ...state, screened };
`

### Cutoff Detection Algorithm

1. Build **exposure table**: for each attribute level, count:
   - exposure: how many times it appeared in screened concepts
   - ccepts: how many times the concept was marked "possible"
   - ejects: how many times the concept was marked "not possible"

2. Check for **unacceptable** patterns (checked first):
   - Level exposed ≥ 3 times AND rejected 100% of the time

3. Check for **must-have** patterns:
   - Level exposed ≥ 3 times AND accepted 100% of the time
   - AND no other level of the same attribute was ever accepted

### Output
- **EngineState** with updated screened[], possibly candidateRule, possibly phase changed
- **EventLog** with screening event appended

### Key Files
- src/core/reducer.ts — SCREENING case in educe()
- src/detection/cutoff.ts — detectCandidateRule(), uildExposureTable()

---

## Stage 3b: Rule Confirmation (Conditional)

### Input
- **EngineState** with phase: "CONFIRM_MUST_HAVE" or "CONFIRM_UNACCEPTABLE"
- **RULE_CONFIRMED** or **RULE_REJECTED** event

### Process

`	ypescript
// If confirmed:
if (event.type === "RULE_CONFIRMED") {
  return {
    ...state,
    confirmedRules: [...state.confirmedRules, state.candidateRule],
    candidateRule: null,
    phase: "REGENERATE",
  };
}

// If rejected:
if (event.type === "RULE_REJECTED") {
  return { ...state, candidateRule: null, phase: "SCREENING" };
}
`

### Output
- **EngineState** with updated confirmedRules[] (if confirmed) or back to SCREENING (if rejected)

---

## Stage 3c: Regeneration (Conditional)

### Input
- **EngineState** with phase: "REGENERATE"
- Any event (triggers regeneration)

### Process

`	ypescript
// 1. Filter out concepts that violate confirmed rules
const valid = pool.filter(concept =>
  !rules.some(rule => isRuleViolated(concept, rule))
);

// 2. Generate replacements for removed concepts
for (let i = 0; i < removedCount; i++) {
  const replacement = tryGenerateReplacement(c0, rules, config, rng, valid);
  if (replacement) valid.push(replacement);
}

// 3. Return to screening
return { ...state, conceptPool: valid, phase: "SCREENING" };
`

### Output
- **EngineState** with updated conceptPool (all concepts now satisfy rules), phase: "SCREENING"

### Key Files
- src/design/replacement.ts — egeneratePool(), eplaceInvalidatedConcepts()
- src/detection/cutoff.ts — isRuleViolated()

---

## Stage 4: Tournament

### Input
- **EngineState** with phase: "TOURNAMENT"
- **TOURNAMENT_TASK_SUBMITTED event** with matchupId and chosenConceptId

### Process

`	ypescript
// 1. Get current task
const currentTask = state.tournamentRounds[state.currentTournamentRound]
  .tasks[state.currentTournamentTask];

// 2. Determine winner (handle ties)
let winnerId = event.chosenConceptId;
if (winnerId === null) {
  // Tie: deterministic coin flip
  const rng = new SeededRNG(\\-tie-r\-t\\);
  winnerId = rng.pick(currentTask.concepts).id;
}

// 3. Update the task with winner
const rounds = state.tournamentRounds.map((r, idx) =>
  idx !== state.currentTournamentRound ? r : {
    ...r,
    tasks: r.tasks.map((t, ti) =>
      ti !== state.currentTournamentTask ? t : { ...t, winnerConceptId: winnerId }
    ),
  }
);

// 4. Advance to next task or round
const nextTask = state.currentTournamentTask + 1;
if (nextTask >= cur.tasks.length) {
  const nextRound = state.currentTournamentRound + 1;
  if (nextRound >= rounds.length) {
    // Tournament complete
    return { ...state, tournamentRounds: rounds, phase: "CALIBRATION" or "DONE" };
  }
  return { ...state, tournamentRounds: rounds, currentTournamentRound: nextRound, currentTournamentTask: 0 };
}
return { ...state, tournamentRounds: rounds, currentTournamentTask: nextTask };
`

### Tournament Bracket Construction

1. Collect surviving concept IDs (those marked "possible" in screening)
2. Shuffle with seeded RNG
3. Group into triples: [c1, c3, c7], [c5, c12, c2], etc.
4. For each triple, compute grayedAttributes — attributes where all three concepts share the same level
5. Create rounds: winners of round 1 advance to round 2, etc.

### Output
- **EngineState** with updated 	ournamentRounds[], advanced task/round pointers
- Eventually: phase: "CALIBRATION" or "DONE"

### Key Files
- src/core/reducer.ts — TOURNAMENT case in educe(), uildTournament(), sharedAttributes()

---

## Stage 5: Estimation

### Input
- **EngineState** with phase: "DONE" (or any completed state)
- **StudyConfig**

### Process

`	ypescript
// 1. Build unified design matrix
const matrix = buildDesignMatrix(state, config);

// Matrix structure:
// header: [
//   { name: "brand_apple", type: "effect", coding: "effects" },
//   { name: "brand_dell", type: "effect", coding: "effects" },
//   { name: "price", type: "price", coding: "continuous" },
//   { name: "none_threshold", type: "none", coding: "binary" },
//   ...
// ]
// rows: [
//   { taskId: "byo-brand", phase: "BYO", values: [1, 0, 1200, 0, 0, 0], response: 1 },
//   { taskId: "screen-0", phase: "SCREENING", values: [0, 1, 1150, 1, 1, 1], response: 1 },
//   ...
// ]

// 2a. Quick check: Streaming MNL (browser)
const mnl = new StreamingMNL({ columns: matrix.header });
for (const row of matrix.rows) {
  mnl.update(row);
}
const result = mnl.estimate();
// Returns: { utilities, logLikelihood, iterations, converged }

// 2b. Production: Send to HB server
const payload = serializeMatrix(matrix, { chains: 4, iterations: 10000 });
// POST to /api/hb-estimate
const hbResult = parseHBResult(serverResponse, matrix);
// Returns: { respondentUtilities, attributeImportance, noneUtility, converged, diagnostics }
`

### Effects Coding

For an attribute with L levels, effects coding creates L-1 columns:

| Level | Column 1 | Column 2 |
|-------|----------|----------|
| Level 0 | 1 | 0 |
| Level 1 | 0 | 1 |
| Level 2 (reference) | -1 | -1 |

This ensures coefficients sum to zero within each attribute.

### Output
- **DesignMatrix** — unified effects-coded matrix
- **MNLResult** or **HBResult** — utilities, importance scores, diagnostics

### Key Files
- src/estimation/matrix.ts — uildDesignMatrix(), effectsCode()
- src/estimation/mnl.ts — StreamingMNL class
- src/estimation/hb-interface.ts — serializeMatrix(), parseHBResult()

---

## Complete Data Flow Diagram

`
                    ┌─────────────────────────────────────────────┐
                    │              StudyConfig (JSON)              │
                    │  attributes[], design{}, phases{}, est{}     │
                    └──────────────────┬──────────────────────────┘
                                       │ parseConfig()
                                       ▼
                    ┌─────────────────────────────────────────────┐
                    │              ACBCEngine                      │
                    │  constructor: validates config, creates state│
                    └──────────────────┬──────────────────────────┘
                                       │ start()
                                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        EngineState { phase: "BYO" }                      │
│  byoConcept: null, conceptPool: [], screened: [], ...                    │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │ submitEvent({ type: "BYO_SUBMITTED", ... })
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  REDUCER: reduce(state, event, config)                                   │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ 1. Build C0 concept from answers                                   │  │
│  │ 2. generateNearNeighborPool(C0, rules, config, rng)                │  │
│  │    ├── balancer: weight underrepresented levels                    │  │
│  │    ├── price: basePrice + random variation                         │  │
│  │    └── dedup: skip duplicate concepts                              │  │
│  │ 3. Return new state with phase: "SCREENING"                        │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │ submitEvent({ type: "SCREEN_SUBMITTED", ... })
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  REDUCER: SCREENING case                                                 │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ 1. Append responses to screened[]                                  │  │
│  │ 2. detectCandidateRule(screened, pool, confirmedRules)             │  │
│  │    ├── buildExposureTable(): count accepts/rejects per level       │  │
│  │    ├── Check unacceptable: 100% reject, ≥3 exposures               │  │
│  │    └── Check must-have: 100% accept, no other level accepted       │  │
│  │ 3. If rule found → phase: "CONFIRM_MUST_HAVE/UNACCEPTABLE"         │  │
│  │ 4. If screening complete → buildTournament() → phase: "TOURNAMENT" │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │ submitEvent({ type: "RULE_CONFIRMED" })
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  REDUCER: REGENERATE case                                                │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ 1. regeneratePool(pool, rules, C0, config, rng)                    │  │
│  │    ├── Filter out concepts violating confirmed rules               │  │
│  │    └── Generate replacements satisfying all rules                  │  │
│  │ 2. Return to phase: "SCREENING"                                    │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │ submitEvent({ type: "TOURNAMENT_TASK_SUBMITTED", ... })
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  REDUCER: TOURNAMENT case                                                │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ 1. Record winnerConceptId for current task                         │  │
│  │ 2. Handle ties: deterministic coin flip via SeededRNG              │  │
│  │ 3. Advance to next task or next round                              │  │
│  │ 4. When all rounds complete → phase: "CALIBRATION" or "DONE"       │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │ submitEvent({ type: "CALIBRATION_SUBMITTED", ... })
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  EngineState { phase: "DONE" }                                           │
│  Complete respondent data: C0, pool, screened, rules, tournament, cal    │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │ buildDesignMatrix(state, config)
                           ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  DesignMatrix                                                            │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │ header: effect columns + price + none_threshold + task_id + phase │  │
│  │ rows: BYO + Screening + Tournament + Calibration                  │  │
│  │ metadata: respondentId, studyId, totalTasks, attributeCount       │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
┌─────────────────────────┐ ┌─────────────────────────────────┐
│  StreamingMNL (browser) │ │  HB Server (R/Python/WASM)      │
│  - Gradient ascent      │ │  - MCMC sampling                │
│  - Aggregate utilities  │ │  - Individual utilities         │
│  - Diagnostics only     │ │  - Attribute importance         │
└─────────────────────────┘ └─────────────────────────────────┘
`

---

## State Persistence Flow

`
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Engine     │     │  EventLog    │     │  Storage     │
│  submitEvent│────▶│  saveEvent() │────▶│  storage.save│
│             │     │  (append)    │     │  (persist)   │
└─────────────┘     └──────────────┘     └──────────────┘
                                               │
                                    ┌──────────┴──────────┐
                                    ▼                     ▼
                          ┌─────────────────┐   ┌─────────────────┐
                          │ MemoryStorage   │   │ SessionStorage  │
                          │ (in-memory)     │   │ (browser)       │
                          └─────────────────┘   └─────────────────┘

On page refresh:
┌──────────────┐     ┌──────────────┐     ┌─────────────┐
│  Storage     │     │  EventLog    │     │  Engine     │
│  storage.load│────▶│  replay()    │────▶│  loadEventLog│
│  (retrieve)  │     │  (re-reduce) │     │  (restore)  │
└──────────────┘     └──────────────┘     └─────────────┘
`

The replay function re-applies every event through the reducer, reconstructing the exact same state. This is how the survey survives a page refresh.
