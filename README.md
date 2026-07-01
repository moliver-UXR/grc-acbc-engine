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

```bash
# Clone or navigate to the project
cd \"Adaptive Conjoint Analysis (ACBC)\"

# Install dependencies
npm install

# Build TypeScript to JavaScript
npm run build

# Run tests
npm test
```

### Minimal Usage

```typescript
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
```

### Run the Robotic QA Script

The project includes a CLI tool that simulates respondents and prints quality diagnostics:

```bash
npx tsx scripts/robotic-run.ts --respondents 50 --seed qa-run
```

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
├── survey/                      # GRC ACBC Qualtrics instrument (UX1-275) — deployed copy
│   ├── grc-task-template.html  # HTML containers for 5 task types
│   ├── grc-acbc-task.js        # OnLoad renderer + OnSubmit capture
│   ├── profile-builder.js      # Screener answers → Embedded Data
│   ├── embedded-data-spec.md   # All Qualtrics Embedded Data fields
│   ├── survey-flow.md          # 9-section Survey Flow specification
│   └── api-contract.md         # /init and /next JSON contract
│
├── reference/
│   └── qualtrics-fork/          # Original Qualtrics-side dev repo (moliver-UXR/conjoint-example,
│                                 # now archived), merged in via git subtree for provenance.
│                                 # Includes the Leeper political-conjoint template this instrument
│                                 # forked from (leeper-original/, conjoint.qsf). survey/ above is
│                                 # the current, deployed copy — this directory is historical only.
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

The source is organized into a small set of top-level areas:

- `src/core/` - state machine, domain types, events, config validation, event-log persistence, and deterministic PRNG
- `src/design/` - near-neighbor concept generation, level balancing, replacement cards, and price handling
- `src/detection/` - must-have and unacceptable cutoff rule detection
- `src/estimation/` - effects-coded design matrix builder, streaming MNL estimator, and HB server contract
- `src/integration/` - optional survey shell adapters (currently SurveyJS)
- `test/` - unit tests, integration tests, robotic respondent harness, and diagnostic checks
- `scripts/` - CLI tooling such as the robotic QA runner
- `doc/` - detailed architecture, API, config, and validation guides

See [doc/MODULES.md](doc/MODULES.md) for a file-by-file deep dive.

---

## Configuration Guide

### Study Configuration Schema

The engine is driven entirely by a JSON configuration. Here is the complete schema:

```json
{
  "study": {
    "attributes": [
      {
        "id": "brand",
        "label": "Brand",
        "in_byo": true,
        "price_type": "none",
        "levels": [
          { "id": "apple", "label": "Apple" },
          { "id": "dell", "label": "Dell" }
        ]
      }
    ],
    "design": {
      "T": 20,
      "Amin": 2,
      "Amax": 4,
      "screens_per_concept_batch": 4,
      "total_screening_screens": 8,
      "price_variation_pct": 0.3,
      "price_rounding": 1
    },
    "phases": {
      "byo": true,
      "screening": true,
      "must_have": true,
      "unacceptable": true,
      "tournament": true,
      "calibration": false
    },
    "estimation": {
      "method": "mnl",
      "price_function": "piecewise",
      "piecewise_breakpoints": [100, 200, 300]
    }
  }
}
```

See [doc/CONFIG.md](doc/CONFIG.md) for field descriptions and parameter tuning guidelines.

---

## Testing & Validation

### Unit Tests

```bash
npm test
```

Tests cover config validation, design generation, cutoff detection, matrix building, MNL estimation, state management, and the SurveyJS adapter.

### Integration Tests

`test/integration/full-pipeline.test.ts` runs a complete respondent through all phases and verifies:

- The survey reaches DONE phase
- The design matrix contains rows from all three phases
- MNL estimation produces finite utilities
- HB serialization works correctly
- Resume safety (replay produces identical state)

### Robotic Respondent Harness

Simulates respondents with known true utilities to validate design quality:

```bash
npx tsx scripts/robotic-run.ts --respondents 50 --seed qa-run
```

### Diagnostic Metrics

- **D-efficiency:** det(X'X)^(1/p) - measures design matrix quality (higher is better)
- **Level balance:** How evenly each attribute level appears
- **Duplicate rate:** Fraction of exact duplicate concepts (should be near zero)
- **Resume safety:** Replay produces byte-identical state

---

## Integration with Survey Shells

The engine is **framework-agnostic**. It exposes state snapshots and accepts events. Survey shells are thin renderers.

### Integration Pattern

```
Survey Shell                    ACBC Engine
┌─────────────┐                 ┌─────────────┐
│  Render UI  │◄── getState() ──│  EngineState│
│  Capture    │                 │             │
│  Input      │── submitEvent()─▶│  Reducer    │
│             │◄── newState ────│             │
└─────────────┘                 └─────────────┘
```

### SurveyJS Adapter

The included `surveyjs-adapter.ts` provides:

- `renderACBCSurvey(survey, engine, options)` - builds a complete survey
- `injectACBCStyles(cssPrefix)` - injects default CSS
- `onStateChange(survey, callback)` - registers a state change listener

### Building Your Own Adapter

Use the `ACBCEngine` class directly:

```typescript
import { ACBCEngine, MemoryStorage } from "./src/index.js";

const engine = new ACBCEngine(
  "study-1",
  "respondent-1",
  config,
  "seed",
  new MemoryStorage()
);

engine.start();

// Render UI from engine.getState()
// On user input, submit events:
engine.submitEvent({
  type: "BYO_SUBMITTED",
  answers: { brand: "apple", ram: "16gb" },
});

// Latest state is returned by submitEvent or via listeners
engine.on("stateChange", (state) => {
  console.log(state.phase);
});
```

Then render UI based on `state.phase` and submit events on user input.

---

## Estimation

### After the Survey: Building the Design Matrix

```typescript
import { buildDesignMatrix } from "./src/estimation/matrix.js";

const matrix = buildDesignMatrix(engine.getState(), config);
// matrix.header → column definitions
// matrix.rows → one row per choice observation
// matrix.metadata → respondent and study info
```

### Quick Check: Streaming MNL (Browser)

```typescript
import { StreamingMNL } from "./src/estimation/mnl.js";

const mnl = new StreamingMNL({
  learningRate: 0.05,
  maxIterations: 1000,
  convergenceThreshold: 1e-6,
  columns: matrix.header,
});

for (const row of matrix.rows) {
  mnl.update(row);
}

const result = mnl.estimate();
console.log(result.utilities);     // Part-worth utilities
console.log(result.converged);     // Did gradient ascent converge?
console.log(result.logLikelihood); // Model fit
```

### Production: Hierarchical Bayes (Server)

```typescript
import { serializeMatrix, parseHBResult } from "./src/estimation/hb-interface.js";

// Serialize for server
const payload = serializeMatrix(matrix, {
  chains: 4,
  iterations: 10000,
  burnIn: 2000,
});

// Send to your R/Python/Stan HB service
const response = await fetch("/api/hb-estimate", {
  method: "POST",
  body: JSON.stringify(payload),
});

// Parse results
const result = parseHBResult(await response.json(), matrix);
console.log(result.respondentUtilities); // Individual part-worths
console.log(result.attributeImportance); // Importance scores (%)
console.log(result.noneUtility);         // None threshold
```

---

## Development Workflow

### Commands

| Command | Description |
|---------|-------------|
| `npm install` | Install dependencies |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run typecheck` | Type-check without emitting |
| `npm test` | Run all tests with vitest |
| `npx tsx scripts/robotic-run.ts` | Run robotic QA simulation |

### Practical Example: Validate a New Study Config

```bash
# 1. Add your config to a JSON file
cp test/fixtures/sample-study.json my-study.json

# 2. Type-check the project
npm run typecheck

# 3. Run a small robotic cohort against your config
npx tsx scripts/robotic-run.ts --respondents 10 --seed my-study-test

# 4. Run the test suite before committing
npm test
```

---

## Glossary

| Term | Definition |
|------|-----------|
| **ACBC** | Adaptive Choice-Based Conjoint - a personalized preference survey method |
| **CBC** | Choice-Based Conjoint - the standard (non-adaptive) version |
| **Attribute** | A product feature (e.g., Brand, Color, Price) |
| **Level** | A specific value of an attribute (e.g., "Red" is a level of Color) |
| **Concept** | A complete product configuration (one level per attribute) |
| **C0** | The respondent's ideal concept from the BYO phase |
| **Utility / Part-worth** | A numerical value representing how much a respondent values a level |
| **Effects Coding** | A statistical encoding where coefficients sum to zero within each attribute |
| **Near-Neighbor** | A concept generated by varying a few attributes from C0 |
| **Must-have** | A level the respondent will not accept alternatives to |
| **Unacceptable** | A level the respondent will never accept |
| **Cutoff Rule** | A must-have or unacceptable constraint |
| **Design Matrix** | A numerical table encoding all choice observations for estimation |
| **MNL** | Multinomial Logit - a statistical model for choice data |
| **HB** | Hierarchical Bayes - a more powerful estimation method for individual utilities |
| **D-efficiency** | A measure of design matrix quality (higher = better) |
| **Reducer** | A pure function that transforms state given an event |
| **Event Log** | An append-only record of all events, enabling replay |

---

## GRC ACBC Study (UX1-275)

This repo includes a complete Qualtrics instrument for the AuditBoard GRC buyer-preference ACBC study. Qualtrics acts as a dumb renderer; the engine runs as an external REST service.

**Engine additions:**
- `src/configs/grc.ts` — 8-attribute GRC config (regulatory coverage, deployment, AI autonomy, TPRM, time-to-value, integrations, annual price, pricing model)
- `src/integration/qualtrics-adapter.ts` — serializes `EngineState` to flat `QualtricsTask` JSON and deserializes Qualtrics choices back to `EngineEvent`
- `src/server.ts` — Node http server with `POST /init` and `POST /next`; run with `node --import tsx src/server.ts` or `PORT=3000 tsx src/server.ts`

### Running the server locally

**Requirements:** Node 18+ (for `crypto.randomUUID` and native `fetch` in tests). No database needed — sessions are in-memory (sufficient for a fielding run; restarting the server clears all sessions).

```bash
cd /path/to/grc-acbc-engine
npm install
npx tsx src/server.ts           # listens on port 3000 by default
PORT=8080 npx tsx src/server.ts # custom port
```

The server logs session activity to stdout with `[init]`, `[next]`, and `[error]` prefixes, making it straightforward to trace a respondent's path through the study.

### Testing with curl

```bash
# Initialize a session (returns the BYO task and a sessionId)
curl -s -X POST http://localhost:3000/init \
  -H "Content-Type: application/json" \
  -d '{"studyId":"grc-q3-2026","respondentId":"test-001","profile":{}}' | jq .

# The response shape:
# {
#   "sessionId": "<uuid>",
#   "acbcTaskJson": "<JSON string — parse this to get the task object>",
#   "acbcPhase": "BYO",
#   "acbcIteration": "0",
#   "acbcDone": "false"
# }

# Advance the session with a BYO answer (use the sessionId from /init)
curl -s -X POST http://localhost:3000/next \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "<sessionId from above>",
    "taskId": "byo-0",
    "taskType": "byo",
    "choice": {
      "regulatory_coverage": "full_suite",
      "deployment": "tenant_isolated",
      "ai_autonomy": "ai_suggests",
      "tprm": "advanced",
      "time_to_value": "90_days",
      "integrations": "broad",
      "annual_price": "tier_2",
      "pricing_model": "per_user"
    }
  }' | jq .
```

### Qualtrics setup

1. Deploy the server (e.g., via `fly deploy` or an EC2 instance) and copy the base URL into an `acbcEngineUrl` Embedded Data field in your Qualtrics survey.
2. Paste `survey/grc-task-template.html` into the ACBC Task question body.
3. Paste `survey/grc-acbc-task.js` into the question's JavaScript editor.
4. Follow `survey/survey-flow.md` for the complete 9-section Survey Flow wiring (Web Service calls, branch logic, Embedded Data fields).
5. See `survey/api-contract.md` for the full `/init` and `/next` JSON contract, including every field the server reads and writes.

---

## Roadmap / Future Work

- Real HB runtime (Python/R/Stan/WASM)
- Performance benchmarks and latency optimization
- OpenSurvey adapter
- Framework examples (React, Vue, Svelte)
- fast-check property-based tests
- Automated accessibility audit
- Plugin API for custom storage/scoring/renderers

---

## Further Reading

- [ACBC_SLR_AdaptiveEngine_Requirements.md](ACBC_SLR_AdaptiveEngine_Requirements.md) - The canonical specification with systematic literature review findings
- [doc/ARCHITECTURE.md](doc/ARCHITECTURE.md) - Detailed layered architecture
- [doc/API.md](doc/API.md) - Complete public API reference
- [doc/CONFIG.md](doc/CONFIG.md) - Configuration schema guide
- [doc/PHASES.md](doc/PHASES.md) - Survey phase details
- [doc/ESTIMATION.md](doc/ESTIMATION.md) - Estimation methods
- [doc/VALIDATION.md](doc/VALIDATION.md) - Testing and validation

---

*Built with TypeScript. Licensed under MIT. Copyright 2026 Michael Oliver.*