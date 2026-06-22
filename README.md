# ACBC Engine — Adaptive Choice-Based Conjoint Analysis

> An open-source TypeScript engine that runs adaptive preference surveys, learning what each respondent values and generating personalized choice tasks in real time.

**License:** MIT | **Language:** TypeScript (ES2022+, ESM) | **Dependencies:** Zod (config validation only)

---

## Table of Contents

1. [What Is Conjoint Analysis?](#what-is-conjoint-analysis)
2. [What Makes ACBC Different?](#what-makes-acbc-different)
3. [The Three-Phase Survey](#the-three-phase-survey)
4. [Quick Start](#quick-start)
5. [Project Structure](#project-structure)
6. [Architecture Overview](#architecture-overview)
7. [Core Concepts](#core-concepts)
8. [Data Flow](#data-flow)
9. [Module Reference](#module-reference)
10. [Configuration Guide](#configuration-guide)
11. [Testing & Validation](#testing--validation)
12. [Integration with Survey Shells](#integration-with-survey-shells)
13. [Estimation](#estimation)
14. [Development Workflow](#development-workflow)
15. [Glossary](#glossary)

---

## What Is Conjoint Analysis?

Conjoint analysis is a statistical technique used in market research to understand how people make trade-offs when choosing between products with multiple features (called **attributes**).

**Example:** Imagine you are buying a laptop. You care about:
- **Brand** (Apple, Dell, Lenovo)
- **Screen Size** (13\", 15\", 17\")
- **RAM** (8GB, 16GB, 32GB)
- **Price** (\, \, \)

You cannot have the best of everything at the lowest price. Conjoint analysis presents you with several product combinations and asks you to choose. From your choices, it calculates how much you value each feature — these values are called **utilities** or **part-worths**.

### Standard CBC (Choice-Based Conjoint)

In traditional CBC, every respondent sees the **same pre-built set of choice tasks**. This works but has limitations:
- Wastes time showing irrelevant options
- Cannot detect \"must-have\" or \"deal-breaker\" preferences
- Requires many respondents for accurate individual-level estimates

---

## What Makes ACBC Different?

**Adaptive** Choice-Based Conjoint (ACBC) personalizes the survey for each respondent:

| Feature | Standard CBC | ACBC |
|---------|-------------|------|
| Design | Same for everyone | Generated per respondent |
| Must-hates/must-haves | Not detected | Explicitly identified |
| Engagement | Repetitive | Interactive configurator |
| Individual precision | Needs large sample | Strong even with few respondents |
| Survey length | 15-20 min | 20-30 min (3 phases) |

ACBC works by:
1. **Learning** your ideal product first (Build Your Own phase)
2. **Screening** nearby concepts to find your deal-breakers
3. **Running a tournament** among the products you actually care about

This produces much more accurate individual preference estimates than standard CBC.

---

## The Three-Phase Survey

### Phase 1: Build Your Own (BYO)
The respondent configures their ideal product by selecting one option for each attribute. This creates a **seed concept (C0)** that anchors the rest of the survey.

`
You: \"I want Brand A, 16GB RAM, 15\" screen, \\"
Engine: Creates C0 = {brand: A, ram: 16GB, screen: 15\", price: 1200}
`

### Phase 2: Screening
The engine generates ~20 product concepts that are **similar to C0** (varying 2-4 attributes at a time). The respondent sees them in groups of 3-5 and marks each as **\"Possible\"** or **\"Not Possible.\"**

During screening, the engine detects patterns:
- **Must-have:** \"Every time Brand A appeared, I said Possible. I never accepted Brand B.\"
- **Unacceptable:** \"Every time 8GB RAM appeared, I said Not Possible.\"

When a pattern is detected, the respondent confirms it, and the engine regenerates concepts that respect these rules.

### Phase 3: Choice Tournament
The concepts marked \"Possible\" compete in a bracket-style tournament, shown in groups of 3. The respondent picks their favorite in each matchup. Attributes that are the same across all three options are grayed out to reduce cognitive load.

`
Round 1: [Concept 1 vs Concept 3 vs Concept 7] → Concept 3 wins
Round 2: [Concept 3 vs Concept 5 vs Concept 12] → Concept 5 wins
...continues until one winner remains
`

### Optional: Calibration
A final question asks: \"How likely are you to buy this product?\" on a 1-5 scale. This calibrates the \"None\" (buy nothing) threshold.

---

## Quick Start

### Prerequisites
- **Node.js** 18+ (for ESM support)
- **npm** or any compatible package manager

### Install and Build

`ash
# Clone or navigate to the project
cd \"Adaptive Conjoint Analysis (ACBC)\"

# Install dependencies
npm install

# Build TypeScript to JavaScript
npm run build

# Run tests
npm test
`

### Minimal Usage

`	ypescript
import { ACBCEngine, MemoryStorage } from \"./src/index.js\";

// 1. Define your study configuration
const config = {
  study: {
    attributes: [
      {
        id: \"brand\",
        label: \"Brand\",
        in_byo: true,
        price_type: \"none\",
        levels: [
          { id: \"apple\", label: \"Apple\" },
          { id: \"dell\", label: \"Dell\" },
          { id: \"lenovo\", label: \"Lenovo\" },
        ],
      },
      {
        id: \"ram\",
        label: \"RAM\",
        in_byo: true,
        price_type: \"none\",
        levels: [
          { id: \"8gb\", label: \"8GB\" },
          { id: \"16gb\", label: \"16GB\" },
          { id: \"32gb\", label: \"32GB\" },
        ],
      },
    ],
    design: {
      T: 12,                    // Generate 12 screening concepts
      Amin: 2,                  // Vary at least 2 attributes per concept
      Amax: 4,                  // Vary at most 4 attributes per concept
      screens_per_concept_batch: 4,
      total_screening_screens: 3,
      price_variation_pct: 0.3,
      price_rounding: 1,
    },
    phases: {
      byo: true,
      screening: true,
      must_have: true,
      unacceptable: true,
      tournament: true,
      calibration: false,
    },
    estimation: {
      method: \"mnl\",
      price_function: \"linear\",
    },
  },
};

// 2. Create the engine
const engine = new ACBCEngine(
  \"laptop-study\",       // study ID
  \"respondent-001\",     // respondent ID
  config,                // study configuration
  \"seed-abc123\",       // deterministic seed
  new MemoryStorage()    // in-memory storage (use SessionStorage in browser)
);

// 3. Start the survey
engine.start();
console.log(engine.getState().phase); // \"BYO\"

// 4. Submit the respondent's BYO choices
engine.submitEvent({
  type: \"BYO_SUBMITTED\",
  answers: { brand: \"apple\", ram: \"16gb\" },
});
console.log(engine.getState().phase); // \"SCREENING\"

// 5. Continue submitting events for each phase...
// The engine advances through phases automatically.
`

### Run the Robotic QA Script

The project includes a CLI tool that simulates respondents and prints quality diagnostics:

`ash
npx tsx scripts/robotic-run.ts --respondents 50 --seed qa-run
`

Output includes D-efficiency, duplicate rate, level balance, resume safety, and MNL utilities.

---

## Project Structure

`
Adaptive Conjoint Analysis (ACBC)/
├── README.md                    # This file — comprehensive documentation
├── package.json                 # Dependencies and scripts
├── tsconfig.json                # TypeScript compiler settings
├── vitest.config.ts             # Test framework configuration
├── LICENSE                      # MIT License
│
├── src/                         # Source code (the engine)
│   ├── index.ts                 # Public API entry point (ACBCEngine class)
│   │
│   ├── core/                    # Core engine — state machine, types, events
│   │   ├── types.ts             # Domain types: StudyConfig, EngineState, Concept, etc.
│   │   ├── events.ts            # Event types (BYO_SUBMITTED, SCREEN_SUBMITTED, etc.)
│   │   ├── config.ts            # Zod validation for study configuration
│   │   ├── reducer.ts           # Pure state machine: reduce(state, event) → newState
│   │   ├── state.ts             # Event log persistence and replay
│   │   └── prng.ts              # Deterministic seeded random number generator
│   │
│   ├── design/                  # Concept generation algorithms
│   │   ├── generator.ts         # Near-neighbor concept pool generation
│   │   ├── balancer.ts          # Level-balance weighting (fair attribute distribution)
│   │   ├── replacement.ts       # Regenerate concepts invalidated by cutoff rules
│   │   └── price.ts             # Price calculation and piecewise encoding
│   │
│   ├── detection/               # Pattern detection in screening responses
│   │   └── cutoff.ts            # Must-have / unacceptable rule detection
│   │
│   ├── estimation/              # Statistical estimation
│   │   ├── matrix.ts            # Unified effects-coded design matrix builder
│   │   ├── mnl.ts               # Browser-native Multinomial Logit estimator
│   │   └── hb-interface.ts      # Server-side Hierarchical Bayes endpoint contract
│   │
│   └── integration/             # Survey shell adapters
│       └── surveyjs-adapter.ts  # SurveyJS rendering adapter
│
├── test/                        # Tests and validation tools
│   ├── fixtures/
│   │   └── sample-study.json    # Example study configuration
│   ├── unit/                    # Unit tests for each module
│   ├── integration/             # End-to-end pipeline tests
│   ├── harness.ts               # Robotic respondent simulator
│   └── diagnostics.ts           # Design quality checks (D-efficiency, balance, etc.)
│
├── scripts/
│   └── robotic-run.ts           # CLI: simulate cohort + print diagnostics
│
├── doc/                         # Detailed documentation
│   ├── README.md                # Doc index
│   ├── ARCHITECTURE.md          # Layered architecture
│   ├── API.md                   # Public API reference
│   ├── CONFIG.md                # Configuration schema guide
│   ├── PHASES.md                # Survey phase details
│   ├── ESTIMATION.md            # Estimation methods
│   ├── VALIDATION.md            # Testing and validation
│   └── SLR_SUMMARY.md           # Systematic Literature Review summary
│
└── demo/
    └── index.html               # Browser demo page
`

---

## Architecture Overview

The engine follows a **layered architecture** with strict separation of concerns:

`
┌─────────────────────────────────────────────────────────┐
│                    Survey Shell (SurveyJS)               │
│  Renders UI, captures user input, sends events to engine │
└────────────────────────┬────────────────────────────────┘
                         │ EngineEvent payloads
                         ▼
┌─────────────────────────────────────────────────────────┐
│                   ACBCEngine (Facade)                    │
│  Constructor, submitEvent(), getState(), event listeners │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│              Pure Reducer + Append-Only Event Log        │
│  reduce(state, event, config) → newState (deterministic) │
└──────┬──────────┬───────────┬──────────────┬────────────┘
       │          │           │              │
       ▼          ▼           ▼              ▼
  ┌────────┐ ┌────────┐ ┌──────────┐ ┌──────────────┐
  │ Design │ │Cutoff  │ │Replace-  │ │ Tournament   │
  │Generator│Detector │ mentGen   │ │ Builder      │
  └────────┘ └────────┘ └──────────┘ └──────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│              Design Matrix Builder (FR-6)                │
│  Effects-coded matrix unifying all three phases          │
└──────────┬───────────────────────────┬──────────────────┘
           │                           │
           ▼                           ▼
  ┌─────────────────┐      ┌────────────────────────┐
  │ Streaming MNL   │      │ HB Server Endpoint     │
  │ (browser, diag) │      │ (R/Python/WASM, final) │
  └─────────────────┘      └────────────────────────┘
`

### Three Architectural Principles

1. **Design generation is on-the-fly, per respondent.** Unlike standard CBC which pre-builds choice tasks, ACBC generates concepts at survey runtime using the near-neighbor algorithm seeded by the respondent's BYO ideal concept.

2. **All three phases are one estimation model.** BYO, Screening, and Tournament data are coded into a single unified effects-coded design matrix and estimated jointly. Partial estimation degrades precision.

3. **Price is continuous, not discrete.** Price is modeled as piecewise linear (3-5 breakpoints) or summed component prices, not as a regular discrete attribute.

---

## Core Concepts

### Concept
A **concept** is a product configuration — a specific combination of attribute levels. For example:
`json
{
  \"id\": \"concept-1\",
  \"levels\": { \"brand\": \"apple\", \"ram\": \"16gb\", \"screen\": \"15in\" },
  \"price\": 1299,
  \"source\": \"SCREENING\"
}
`

### C0 (Seed Concept)
The respondent's ideal product from the BYO phase. All screening concepts are generated as \"near neighbors\" of C0.

### Cutoff Rule
A non-compensatory preference rule detected during screening:
- **Must-have:** \"I will only accept products with Brand A.\"
- **Unacceptable:** \"I will never accept products with 8GB RAM.\"

### Event
All state changes happen through **events**. The engine never mutates state directly. Events include:
- BYO_SUBMITTED — respondent chose their ideal product
- SCREEN_SUBMITTED — respondent marked concepts as possible/not possible
- RULE_CONFIRMED / RULE_REJECTED — respondent confirmed or rejected a detected rule
- TOURNAMENT_TASK_SUBMITTED — respondent chose a winner from a triple
- CALIBRATION_SUBMITTED — respondent rated purchase intent

### EngineState
The complete snapshot of a respondent's survey progress at any point in time. Contains:
- Current phase
- BYO concept (C0)
- Concept pool
- Screening responses
- Confirmed cutoff rules
- Tournament bracket state
- Calibration answer

### Event Log
An append-only record of every event submitted. Can be **replayed** through the reducer to reconstruct the exact same state — this enables page refresh survival and deterministic testing.

---

## Data Flow

Here is the complete data flow for a single respondent:

`
1. INITIALIZATION
   StudyConfig (JSON) ──parseConfig()──▶ validated config
   ACBCEngine(studyId, respondentId, config, seed, storage)
   └──▶ EngineState { phase: \"BYO\", ... }

2. BYO PHASE
   User selects: { brand: \"apple\", ram: \"16gb\" }
   ──BYO_SUBMITTED event──▶ reducer
   └──▶ Build C0 concept
   └──▶ Generate near-neighbor concept pool (T concepts)
   └──▶ Phase → SCREENING

3. SCREENING PHASE (repeated for each batch)
   User marks concepts: [{ conceptId: \"c1\", possible: true }, ...]
   ──SCREEN_SUBMITTED event──▶ reducer
   └──▶ Append to screened[]
   └──▶ detectCandidateRule() scans for patterns
   └──▶ If pattern found → Phase → CONFIRM_MUST_HAVE or CONFIRM_UNACCEPTABLE
   └──▶ If screening complete → Build tournament bracket → Phase → TOURNAMENT

4. RULE CONFIRMATION (conditional)
   User confirms or rejects detected rule
   ──RULE_CONFIRMED event──▶ reducer
   └──▶ Add to confirmedRules[]
   └──▶ Phase → REGENERATE
   ──REGENERATE──▶ regeneratePool() fills invalidated slots
   └──▶ Phase → SCREENING (resume)

5. TOURNAMENT PHASE (repeated for each task)
   User picks winner from triple
   ──TOURNAMENT_TASK_SUBMITTED event──▶ reducer
   └──▶ Record winnerConceptId
   └──▶ Advance to next task or next round
   └──▶ When all rounds complete → Phase → CALIBRATION or DONE

6. CALIBRATION (optional)
   User rates purchase intent: 1-5
   ──CALIBRATION_SUBMITTED event──▶ reducer
   └──▶ Store calibration answer
   └──▶ Phase → DONE

7. ESTIMATION (post-survey)
   buildDesignMatrix(finalState, config)
   └──▶ Unified effects-coded matrix with rows from all phases
   └──▶ StreamingMNL.estimate() → aggregate utilities (browser)
   └──▶ serializeMatrix() → send to HB server → individual utilities
`

---

## Module Reference

### src/core/ — The Engine Core

#### 	ypes.ts — Domain Types
Defines every data structure the engine uses:
- **Phase** — Union type: \"BYO\" | \"SCREENING\" | \"CONFIRM_MUST_HAVE\" | ... | \"DONE\"
- **StudyConfig** — The study configuration schema (attributes, design params, phases, estimation)
- **EngineState** — Complete respondent state snapshot
- **Concept** — A product configuration with levels and optional price
- **CutoffRule** — A must-have or unacceptable rule
- **ScreeningResponse** — One concept's possible/not-possible answer
- **TournamentRound** / **TournamentTask** — Bracket structure

#### events.ts — Event System
Defines the discriminated union of all events the engine accepts:
- BYO_SUBMITTED — carries nswers: Record<string, string>
- SCREEN_SUBMITTED — carries esponses: ScreeningResponse[]
- RULE_CONFIRMED / RULE_REJECTED — no payload
- TOURNAMENT_TASK_SUBMITTED — carries matchupId and chosenConceptId
- CALIBRATION_SUBMITTED — carries nswer: CalibrationAnswer

Each event has a corresponding Zod schema for runtime validation.

#### config.ts — Configuration Validation
Uses Zod to validate the study JSON at runtime:
- parseConfig(json) — throws ConfigError on invalid input
- safeParseConfig(json) — returns { success, data } or { success, error }

#### educer.ts — Pure State Machine
The heart of the engine. A pure function:
`	ypescript
reduce(state: EngineState, event: EngineEvent, config: StudyConfig): EngineState
`
- Takes the current state and an event
- Returns a **new** state (never mutates the old one)
- Handles phase transitions automatically
- Calls design generation, cutoff detection, and tournament building as needed

#### state.ts — Event Log Persistence
Manages the append-only event log:
- **EventLog** — stores initial state + array of persisted events
- **EventStorage** — interface with load(), save(), clear()
- **MemoryStorage** — in-memory implementation (for tests)
- **SessionStorage** — browser sessionStorage adapter (survives page refresh)
- **eplay(log, config)** — replays all events through the reducer to reconstruct state

#### prng.ts — Deterministic Random Number Generator
Uses the **sfc32** algorithm seeded from a string:
- 
ext() — returns a float in [0, 1)
- andInt(min, max) — returns an integer in [min, max]
- shuffle(array) — Fisher-Yates shuffle
- pick(array) — random element selection

**Why deterministic?** The same seed + same event sequence = same final state. This enables reproducible testing and QA.

---

### src/design/ — Concept Generation

#### generator.ts — Near-Neighbor Algorithm
Generates T concepts near C0:
1. Pick a random number of attributes to vary (Amin to Amax)
2. Randomly select which attributes to vary
3. For each varied attribute, pick a new level (respecting cutoff rules)
4. Check for duplicates
5. Compute price with random variation
6. Repeat until T unique concepts are generated

#### alancer.ts — Level Balance
Tracks how often each level appears and weights selection to favor underrepresented levels. This ensures the design matrix is well-balanced for estimation.

#### eplacement.ts — Replacement Card Generation
When a confirmed cutoff rule invalidates existing concepts, this module:
1. Filters out invalid concepts
2. Generates replacement concepts that satisfy all confirmed rules
3. Maintains the target pool size T

#### price.ts — Price Handling
- asePrice(concept, config) — sums price_increment values
- pplyPriceVariation(base, config, rng) — applies ±variation% with rounding
- computePrice(concept, config, rng) — combines base + variation
- piecewisePriceVector(price, breakpoints) — encodes price for piecewise-linear models

---

### src/detection/ — Pattern Detection

#### cutoff.ts — Cutoff Rule Detection
Builds an **exposure table** tracking how often each attribute level was shown and whether it was accepted or rejected:
- **Unacceptable detection:** A level is rejected 100% of the time (minimum 3 exposures)
- **Must-have detection:** A level is accepted 100% of the time AND no other level of that attribute was ever accepted

---

### src/estimation/ — Statistical Estimation

#### matrix.ts — Design Matrix Builder
Builds a unified effects-coded design matrix from the final EngineState:
- **Effects coding:** For L levels, creates L-1 columns. The last level is aliased as -1.
- **Rows:** BYO rows → Screening rows → Tournament rows → Calibration row
- **Columns:** effect columns + price + none_threshold + task_id + phase

#### mnl.ts — Streaming Multinomial Logit
A browser-native aggregate estimator using gradient ascent:
- Binary (Bernoulli) likelihood for BYO and Screening rows
- Softmax likelihood for Tournament rows
- Useful for field monitoring, not a substitute for HB

#### hb-interface.ts — Hierarchical Bayes Contract
Defines the wire format for sending data to a server-side HB estimator:
- serializeMatrix(matrix) — converts DesignMatrix to JSON payload
- parseHBResult(response, matrix) — validates and parses server response
- computeAttributeImportance() — derives importance scores from utilities

---

### src/integration/ — Survey Shell Adapters

#### surveyjs-adapter.ts — SurveyJS Integration
A ~1400-line adapter that:
- Builds SurveyJS pages for each phase
- Renders concept cards, tournament tables, and calibration questions
- Captures user input and submits events to the engine
- Injects CSS for styling
- Handles reactive re-rendering on state changes

**Key principle:** The adapter never mutates engine state. All changes flow through engine.submitEvent().

---

## Configuration Guide

### Study Configuration Schema

The engine is driven entirely by a JSON configuration. Here is the complete schema:

`json
{
  \"study\": {
    \"attributes\": [
      {
        \"id\": \"brand\",              // Machine identifier
        \"label\": \"Brand\",            // Display label
        \"in_byo\": true,               // Show in Build Your Own phase
        \"price_type\": \"none\",        // \"none\" | \"component\" | \"summed\"
        \"levels\": [                   // Available options
          { \"id\": \"apple\", \"label\": \"Apple\" },
          { \"id\": \"dell\", \"label\": \"Dell\" }
        ]
      }
    ],
    \"design\": {
      \"T\": 20,                        // Total screening concepts to generate
      \"Amin\": 2,                      // Min attributes to vary per concept
      \"Amax\": 4,                      // Max attributes to vary per concept
      \"screens_per_concept_batch\": 4, // Concepts per screening screen
      \"total_screening_screens\": 8,   // Total screening screens
      \"price_variation_pct\": 0.3,     // ±30% price variation
      \"price_rounding\": 1             // Round to nearest 
    },
    \"phases\": {
      \"byo\": true,                    // Enable Build Your Own
      \"screening\": true,              // Enable Screening
      \"must_have\": true,              // Enable must-have detection
      \"unacceptable\": true,           // Enable unacceptable detection
      \"tournament\": true,             // Enable Choice Tournament
      \"calibration\": false            // Enable Calibration (optional)
    },
    \"estimation\": {
      \"method\": \"mnl\",              // \"hb\" | \"mnl\" | \"monotone_regression\"
      \"price_function\": \"piecewise\", // \"linear\" | \"log_linear\" | \"piecewise\"
      \"piecewise_breakpoints\": [100, 200, 300] // For piecewise pricing
    }
  }
}
`

### Parameter Guidelines

| Parameter | Typical Value | Notes |
|-----------|--------------|-------|
| T | 15-25 | More concepts = more screening data but longer survey |
| Amin | 2 | Minimum variation for near-neighbor generation |
| Amax | 4 | For 8-9 attribute studies; scale with attribute count |
| screens_per_concept_batch | 3-5 | Concepts shown per screen |
| 	otal_screening_screens | 7-9 | Target number of screening screens |
| price_variation_pct | 0.3 | ±30% around base price |

---

## Testing & Validation

### Unit Tests
`ash
npm test
`
Tests cover every module: config validation, design generation, cutoff detection, matrix building, MNL estimation, state management, and the SurveyJS adapter.

### Integration Tests
	est/integration/full-pipeline.test.ts runs a complete respondent through all phases and verifies:
- The survey reaches DONE phase
- The design matrix contains rows from all three phases
- MNL estimation produces finite utilities
- HB serialization works correctly
- Resume safety (replay produces identical state)

### Robotic Respondent Harness
Simulates respondents with known true utilities to validate design quality:

`ash
npx tsx scripts/robotic-run.ts --respondents 50 --seed qa-run
`

### Diagnostic Metrics
- **D-efficiency:** det(X'X)^(1/p) — measures design matrix quality (higher is better)
- **Level balance:** How evenly each attribute level appears
- **Duplicate rate:** Fraction of exact duplicate concepts (should be near zero)
- **Resume safety:** Replay produces byte-identical state

---

## Integration with Survey Shells

The engine is **framework-agnostic**. It exposes state snapshots and accepts events. Survey shells are thin renderers.

### Integration Pattern

`
Survey Shell                    ACBC Engine
┌─────────────┐                 ┌─────────────┐
│  Render UI  │◄── getState() ──│  EngineState│
│  Capture    │                 │             │
│  Input      │── submitEvent()─▶│  Reducer    │
│             │◄── newState ────│             │
└─────────────┘                 └─────────────┘
`

### SurveyJS Adapter
The included surveyjs-adapter.ts provides:
- enderACBCSurvey(survey, engine, options) — builds complete survey
- injectACBCStyles(cssPrefix) — injects default CSS
- onStateChange(survey, callback) — register state change listener

### Building Your Own Adapter
Implement the ACBCEngine interface:
`	ypescript
interface ACBCEngine {
  getState(): EngineState;
  submitEvent(event: EngineEvent): EngineState;
  getConfig(): StudyConfig;
}
`

Then render UI based on state.phase and submit events on user input.

---

## Estimation

### After the Survey: Building the Design Matrix

`	ypescript
import { buildDesignMatrix } from \"./src/estimation/matrix.js\";

const matrix = buildDesignMatrix(engine.getState(), config);
// matrix.header → column definitions
// matrix.rows → one row per choice observation
// matrix.metadata → respondent and study info
`

### Quick Check: Streaming MNL (Browser)

`	ypescript
import { StreamingMNL } from \"./src/estimation/mnl.js\";

const mnl = new StreamingMNL({ columns: matrix.header });
for (const row of matrix.rows) {
  mnl.update(row);
}
const result = mnl.estimate();
console.log(result.utilities);    // Part-worth utilities
console.log(result.converged);    // Did gradient ascent converge?
console.log(result.logLikelihood); // Model fit
`

### Production: Hierarchical Bayes (Server)

`	ypescript
import { serializeMatrix, parseHBResult } from \"./src/estimation/hb-interface.js\";

// Serialize for server
const payload = serializeMatrix(matrix, {
  chains: 4,
  iterations: 10000,
  burnIn: 2000,
});

// Send to your R/Python/Stan HB service
const response = await fetch(\"/api/hb-estimate\", {
  method: \"POST\",
  body: JSON.stringify(payload),
});

// Parse results
const result = parseHBResult(await response.json(), matrix);
console.log(result.respondentUtilities); // Individual part-worths
console.log(result.attributeImportance); // Importance scores (%)
console.log(result.noneUtility);         // None threshold
`

---

## Development Workflow

### Commands

| Command | Description |
|---------|-------------|
| 
pm install | Install dependencies |
| 
pm run build | Compile TypeScript to dist/ |
| 
pm run typecheck | Type-check without emitting |
| 
pm test | Run all tests with vitest |
| 
px tsx scripts/robotic-run.ts | Run robotic QA simulation |

### Adding a New Attribute Type

1. Update StudyConfig in 	ypes.ts if needed
2. Update Zod schema in config.ts
3. Update the reducer in educer.ts if phase behavior changes
4. Update the design matrix builder in matrix.ts
5. Add unit tests

### Adding a New Phase

1. Add the phase to the Phase type in 	ypes.ts
2. Add a new event type in events.ts
3. Add a case in the educe() function in educer.ts
4. Update the SurveyJS adapter to render the new phase
5. Update the design matrix builder to emit rows for the new phase
6. Add tests

---

## Glossary

| Term | Definition |
|------|-----------|
| **ACBC** | Adaptive Choice-Based Conjoint — a personalized preference survey method |
| **CBC** | Choice-Based Conjoint — the standard (non-adaptive) version |
| **Attribute** | A product feature (e.g., Brand, Color, Price) |
| **Level** | A specific value of an attribute (e.g., \"Red\" is a level of Color) |
| **Concept** | A complete product configuration (one level per attribute) |
| **C0** | The respondent's ideal concept from the BYO phase |
| **Utility / Part-worth** | A numerical value representing how much a respondent values a level |
| **Effects Coding** | A statistical encoding where coefficients sum to zero within each attribute |
| **Near-Neighbor** | A concept generated by varying a few attributes from C0 |
| **Must-have** | A level the respondent will not accept alternatives to |
| **Unacceptable** | A level the respondent will never accept |
| **Cutoff Rule** | A must-have or unacceptable constraint |
| **Design Matrix** | A numerical table encoding all choice observations for estimation |
| **MNL** | Multinomial Logit — a statistical model for choice data |
| **HB** | Hierarchical Bayes — a more powerful estimation method for individual utilities |
| **D-efficiency** | A measure of design matrix quality (higher = better) |
| **Reducer** | A pure function that transforms state given an event |
| **Event Log** | An append-only record of all events, enabling replay |

---

## Further Reading

- [ACBC_SLR_AdaptiveEngine_Requirements.md](ACBC_SLR_AdaptiveEngine_Requirements.md) — The canonical specification with systematic literature review findings
- [doc/ARCHITECTURE.md](doc/ARCHITECTURE.md) — Detailed layered architecture
- [doc/API.md](doc/API.md) — Complete public API reference
- [doc/CONFIG.md](doc/CONFIG.md) — Configuration schema guide
- [doc/PHASES.md](doc/PHASES.md) — Survey phase details
- [doc/ESTIMATION.md](doc/ESTIMATION.md) — Estimation methods
- [doc/VALIDATION.md](doc/VALIDATION.md) — Testing and validation

---

*Built with TypeScript. Licensed under MIT. Copyright 2026 Michael Oliver.*
