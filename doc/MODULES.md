# Module Deep Dive

> Detailed explanations of every module in the ACBC Engine, written for novice programmers.

---

## How to Read This Guide

Each module section follows the same pattern:
1. **What it does** - one-sentence summary
2. **Why it exists** - the problem it solves
3. **Key functions** - the important exports
4. **How it works** - step-by-step explanation
5. **Dependencies** - what other modules it uses
6. **Example** - code showing usage

---

## Core Modules (src/core/)

### types.ts - Domain Types

**What it does:** Defines every data structure the engine uses.

**Why it exists:** TypeScript needs to know the shape of data. This file is the single source of truth for all types.

**Key Types:**

| Type | Purpose |
|------|---------|
| Phase | Which survey phase the respondent is in |
| StudyConfig | The complete study configuration |
| EngineState | Complete snapshot of respondent progress |
| Concept | A product configuration (levels + price) |
| CutoffRule | A must-have or unacceptable constraint |
| ScreeningResponse | One concept possible/not-possible answer |
| TournamentRound / TournamentTask | Bracket structure for the tournament |

**How to read it:** Start from the top. Each type builds on previous ones. StudyConfig references Attribute, which references Level. EngineState references Concept, CutoffRule, TournamentRound, etc.

**Dependencies:** None - this is the foundation everything else builds on.

---

### events.ts - Event System

**What it does:** Defines the discriminated union of all events the engine accepts.

**Why it exists:** The engine is event-driven. Every state change happens through an event. This file defines what events are valid and what data they carry.

**Key Events:**

| Event | When | Payload |
|-------|------|---------|
| BYO_SUBMITTED | Respondent finishes BYO | answers: attrId to levelId mapping |
| SCREEN_SUBMITTED | Respondent finishes a screening batch | responses: ScreeningResponse array |
| RULE_CONFIRMED | Respondent confirms a detected rule | None |
| RULE_REJECTED | Respondent rejects a detected rule | None |
| TOURNAMENT_TASK_SUBMITTED | Respondent picks a tournament winner | matchupId, chosenConceptId |
| CALIBRATION_SUBMITTED | Respondent rates purchase intent | answer: CalibrationAnswer |

**Zod Schemas:** Each event has a Zod schema for runtime validation. parseEvent(raw) validates unknown input and returns a typed event or throws.

**Dependencies:** types.ts (for ScreeningResponse, CalibrationAnswer)

---

### config.ts - Configuration Validation

**What it does:** Validates study configuration JSON using Zod schemas.

**Why it exists:** The engine needs a valid configuration to work. Zod provides runtime validation with detailed error messages.

**Key Functions:**

- parseConfig(json) - Throws ConfigError on invalid input
- safeParseConfig(json) - Returns success/data or success/error

**How it works:**
1. Defines Zod schemas for each part of the config (Level, Attribute, DesignParams, etc.)
2. Composes them into a StudyConfigSchema
3. parseConfig() calls safeParse() and throws a ConfigError with the field path and message if invalid

**Dependencies:** types.ts, zod (external library)

---

### reducer.ts - Pure State Machine

**What it does:** The heart of the engine. A pure function that transforms state given an event.

**Why it exists:** This is the Redux-style reducer pattern. Pure functions are predictable, testable, and replayable.

**Key Functions:**

- createInitialState(studyId, respondentId, config, seed) - Creates initial state with phase BYO
- reduce(state, event, config) - The main reducer: state + event produces new state

**How the reducer works:**

The reduce() function is a switch statement on state.phase:

- BYO: Build C0 concept, generate near-neighbor pool, advance to SCREENING
- SCREENING: Append responses, detect cutoff rules, advance to confirmation or tournament
- CONFIRM_MUST_HAVE / CONFIRM_UNACCEPTABLE: Add rule or reject, advance to REGENERATE or SCREENING
- REGENERATE: Regenerate concept pool respecting rules, return to SCREENING
- TOURNAMENT: Record winner, handle ties, advance task/round, advance to CALIBRATION or DONE
- CALIBRATION: Store answer, advance to DONE
- DONE: Terminal state, no changes

**Dependencies:** types.ts, events.ts, prng.ts, design/generator.ts, detection/cutoff.ts, design/replacement.ts

---

### state.ts - Event Log Persistence

**What it does:** Manages the append-only event log and provides storage adapters.

**Why it exists:** The event log enables page refresh survival, audit trails, and deterministic testing.

**Key Types and Functions:**

- EventLog - stores initial state plus array of persisted events
- EventStorage - interface with load(), save(), clear()
- MemoryStorage - in-memory implementation (for tests)
- SessionStorage - browser sessionStorage adapter (survives page refresh)
- SessionStorageAdapter - simple keyed adapter
- createEventLog(initialState) - creates new empty log
- saveEvent(log, event, currentState) - appends event to log
- replay(log, config) - replays all events through reducer to reconstruct state

**How replay works:** Start from initialState, re-apply every event through reduce(), return final state.

**Dependencies:** types.ts, events.ts, reducer.ts

---

### prng.ts - Deterministic Random Number Generator

**What it does:** Provides a seeded PRNG that produces the same sequence for the same seed.

**Why it exists:** Standard Math.random() is not reproducible. For testing and QA, we need the same seed to produce the same concept pool, same tournament bracket, same tie-breaking.

**Algorithm:** sfc32 (Simple Fast Counter 32-bit)

**Key Methods:**

- constructor(seed) - Initialize from a string seed
- next() - Float in [0, 1)
- randInt(min, max) - Integer in [min, max]
- shuffle(array) - Fisher-Yates shuffle
- pick(array) - Random element

**Dependencies:** None - pure algorithm.

---

## Design Modules (src/design/)

### generator.ts - Near-Neighbor Concept Generation

**What it does:** Generates T product concepts that are near neighbors of the respondent ideal concept (C0).

**Why it exists:** Standard CBC uses pre-built designs. ACBC generates concepts at runtime, personalized to each respondent.

**Key Functions:**

- generateNearNeighborPool(c0, rules, config, rng) - Generate T concepts near C0
- nearNeighborConcept(c0, config, rng, rules?, balancer?) - Generate one concept
- isConceptDuplicate(candidate, pool) - Check if concept already exists

**Algorithm:**
1. Pick random number of attributes to vary (Amin to Amax)
2. Shuffle BYO attributes, select first ai to vary
3. For each varied attribute, pick new level using balancer
4. Check for duplicates and rule violations
5. Compute price with random variation
6. Repeat until T unique concepts generated

**Dependencies:** types.ts, prng.ts, balancer.ts, price.ts, detection/cutoff.ts

---

### balancer.ts - Level Balance

**What it does:** Tracks level appearance frequency and weights selection to favor underrepresented levels.

**Why it exists:** A good experimental design has balanced level frequencies. The balancer ensures fair representation.

**Key Functions:**

- createBalancer(attributes, options) - Creates a LevelBalancer
- record(attributeId, levelId) - Record that a level was used
- selectLevel(allowedLevels) - Pick a level, favoring underrepresented ones
- getCounts() - Get current counts
- reset() - Reset all counts to zero

**How weighting works:** weight(level) = 1 / (count(level) + 1). Underrepresented levels get higher weight.

**Dependencies:** prng.ts

---

### replacement.ts - Replacement Card Generation

**What it does:** Regenerates concepts invalidated by confirmed cutoff rules.

**Why it exists:** When a respondent confirms a rule, concepts violating it become invalid. This module fills those slots.

**Key Functions:**

- replaceInvalidatedConcepts(pool, rules, c0, config, rng) - Replace and fill to original size
- regeneratePool(pool, rules, c0, config, rng) - Alias used by reducer

**Algorithm:** Filter invalid concepts, generate replacements (up to 50 attempts each) that satisfy all rules.

**Dependencies:** types.ts, prng.ts, generator.ts, detection/cutoff.ts

---

### price.ts - Price Handling

**What it does:** Calculates concept prices and encodes them for estimation.

**Why it exists:** Price is continuous, not discrete. This module handles summed component prices, random variation, and piecewise-linear encoding.

**Key Functions:**

- basePrice(concept, config) - Sum price_increment values
- applyPriceVariation(base, config, rng) - Apply variation with rounding
- computePrice(concept, config, rng?) - Combine base + variation
- piecewisePriceVector(price, breakpoints) - Encode price as piecewise-linear vector

**Dependencies:** types.ts, prng.ts

---

## Detection Module (src/detection/)

### cutoff.ts - Cutoff Rule Detection

**What it does:** Scans screening responses to detect must-have and unacceptable patterns.

**Why it exists:** Respondents often have non-compensatory preferences. Detecting these early improves the survey.

**Key Functions:**

- buildExposureTable(screened, pool) - Build exposure table from responses
- isRuleViolated(concept, rule) - Check if concept violates a rule
- detectCandidateRule(screened, pool, confirmedRules, minExposure?) - Detect candidate rule

**Detection Logic:**
- Unacceptable: exposure >= 3 AND 100% rejection
- Must-have: exposure >= 3 AND 100% acceptance AND no other level of that attribute ever accepted

**Dependencies:** types.ts

---

## Estimation Modules (src/estimation/)

### matrix.ts - Design Matrix Builder

**What it does:** Builds a unified effects-coded design matrix from the final EngineState.

**Why it exists:** Statistical estimation requires numerical data. This converts qualitative choices into a numerical matrix.

**Key Functions:**

- effectsCode(levelIndex, levelCount) - Effects coding: L levels to L-1 columns
- encodeAttributeLevels(concept, config) - Encode concept levels as effects-coded vector
- getConceptPrice(concept, config) - Get price for a concept
- buildDesignMatrix(state, config) - Build complete design matrix

**Row Order:** BYO rows, Screening rows, Tournament rows, Calibration row.

**Dependencies:** types.ts

---

### mnl.ts - Streaming Multinomial Logit

**What it does:** A browser-native aggregate MNL estimator using gradient ascent.

**Why it exists:** Quick field monitoring and diagnostics without needing a server.

**Key Class:** StreamingMNL
- constructor(config?) - learningRate, maxIterations, etc.
- update(row) - Add a row to the streaming aggregate
- estimate() - Run gradient ascent, return utilities

**How it works:** Separates binary rows (BYO, Screening) from multinomial rows (Tournament), runs gradient ascent with Bernoulli and softmax likelihoods.

**Dependencies:** matrix.ts

---

### hb-interface.ts - Hierarchical Bayes Contract

**What it does:** Defines the wire format for sending data to a server-side HB estimator.

**Why it exists:** The engine does not implement HB sampling. This defines a clean contract for external HB services.

**Key Functions:**

- serializeMatrix(matrix, options?) - Serialize DesignMatrix to JSON payload
- parseHBResult(payload, matrix) - Validate and parse HB server response
- buildHBRequest(matrix, options?) - Build in-process HB request

**Dependencies:** matrix.ts

---

## Integration Module (src/integration/)

### surveyjs-adapter.ts - SurveyJS Adapter

**What it does:** Renders the ACBC survey using SurveyJS and captures user input as engine events.

**Why it exists:** The engine is framework-agnostic. This adapter connects it to SurveyJS.

**Key Functions:**

- renderACBCSurvey(survey, engine, options?) - Build and render complete ACBC survey
- onStateChange(survey, callback) - Register state change callback
- injectACBCStyles(cssPrefix?) - Inject default CSS styles

**Design Principle:** The adapter never mutates engine state. All changes flow through engine.submitEvent().

**Dependencies:** types.ts, events.ts, core modules

---

## Test Modules (test/)

### harness.ts - Robotic Respondent Simulator

**What it does:** Simulates respondents with known true utilities to validate the engine.

**Key Functions:**

- generateRandomUtilities(config, rng) - Generate random utilities matching effects-coded naming
- simulateRespondent(studyId, respondentId, config, options?) - Run one respondent through full pipeline
- simulateCohort(config, n, options?) - Run N respondents and produce aggregate report

**Dependencies:** src/index.ts, types.ts, prng.ts

---

### diagnostics.ts - Design Quality Checks

**What it does:** Computes quality metrics for generated designs.

**Key Functions:**

- computeDEfficiency(matrix) - D-efficiency: det(XtX)^(1/p)
- levelBalance(pool, config) - Level balance report
- duplicateRate(pool) - Fraction of duplicate concepts
- resumeSafetyCheck(config, seed) - Verify replay produces identical state

**Dependencies:** types.ts, matrix.ts, state.ts, src/index.ts
