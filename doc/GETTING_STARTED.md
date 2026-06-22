# Getting Started Guide

> A step-by-step guide for novice programmers to set up, understand, and run the ACBC Engine.

---

## Prerequisites

Before you begin, make sure you have:

- **Node.js 18 or later** — [Download from nodejs.org](https://nodejs.org/)
- **npm** (comes with Node.js) — verify with 
pm --version
- A **code editor** — VS Code is recommended

### Verify Your Setup

Open a terminal (PowerShell on Windows, Terminal on Mac/Linux) and run:

`ash
node --version   # Should show v18.x.x or higher
npm --version    # Should show 9.x.x or higher
`

---

## Step 1: Navigate to the Project

`ash
cd "F:\Documents\OpenCode\Adaptive Conjoint Analysis (ACBC)"
`

---

## Step 2: Install Dependencies

`ash
npm install
`

This downloads two types of packages:
- **Dependencies** (runtime): zod — used to validate configuration files
- **Dev Dependencies** (development only): 	ypescript, itest, 	sx, @types/node

After installation, you will see a 
ode_modules/ folder and a package-lock.json file.

---

## Step 3: Understand the Project Structure

`
src/                    ← The engine source code (what you will modify)
├── index.ts            ← Main entry point — exports ACBCEngine
├── core/               ← State machine, types, events, config validation
├── design/             ← Concept generation algorithms
├── detection/          ← Pattern detection (must-haves, deal-breakers)
├── estimation/         ← Statistical estimation (MNL, HB interface)
└── integration/        ← Survey shell adapters (SurveyJS)

test/                   ← Tests and validation tools
├── unit/               ← Unit tests for each module
├── integration/        ← End-to-end pipeline tests
├── harness.ts          ← Robotic respondent simulator
└── diagnostics.ts      ← Design quality checks

doc/                    ← Detailed documentation
scripts/                ← CLI tools (robotic-run.ts)
`

---

## Step 4: Run the Tests

`ash
npm test
`

You should see output like:
`
✓ test/unit/config.test.ts (5 tests)
✓ test/unit/design/generator.test.ts (4 tests)
✓ test/unit/detection/cutoff.test.ts (6 tests)
...
Test Files  15 passed (15)
Tests       89 passed (89)
`

If all tests pass, your environment is set up correctly.

---

## Step 5: Build the Project

`ash
npm run build
`

This compiles TypeScript (.ts files) into JavaScript (.js files) in the dist/ folder. The compiled code is what runs in production.

---

## Step 6: Run the Robotic QA Simulation

`ash
npx tsx scripts/robotic-run.ts --respondents 10 --seed demo
`

This simulates 10 robotic respondents going through the full survey and prints quality metrics:

`
Cohort: 10 respondents
Avg screening responses: 6.00
Avg tournament tasks: 3.20
D-efficiency: 1.234567
Duplicate rate: 0.0000
Level balance: [...]
Resume safety: true
MNL utilities: {...}
`

### What These Metrics Mean

| Metric | What It Measures | Good Value |
|--------|-----------------|------------|
| **D-efficiency** | Design matrix quality | > 0 (higher is better) |
| **Duplicate rate** | How many concepts are identical | 0.0 (no duplicates) |
| **Level balance** | How evenly levels appear | Small deviations |
| **Resume safety** | Can state be replayed identically? | 	rue |

---

## Step 7: Write Your First Study Configuration

Create a file called my-study.json:

`json
{
  "study": {
    "attributes": [
      {
        "id": "brand",
        "label": "Brand",
        "in_byo": true,
        "price_type": "none",
        "levels": [
          { "id": "nike", "label": "Nike" },
          { "id": "adidas", "label": "Adidas" },
          { "id": "puma", "label": "Puma" }
        ]
      },
      {
        "id": "size",
        "label": "Shoe Size",
        "in_byo": true,
        "price_type": "none",
        "levels": [
          { "id": "9", "label": "US 9" },
          { "id": "10", "label": "US 10" },
          { "id": "11", "label": "US 11" }
        ]
      },
      {
        "id": "color",
        "label": "Color",
        "in_byo": true,
        "price_type": "none",
        "levels": [
          { "id": "black", "label": "Black" },
          { "id": "white", "label": "White" },
          { "id": "red", "label": "Red" }
        ]
      }
    ],
    "design": {
      "T": 12,
      "Amin": 1,
      "Amax": 2,
      "screens_per_concept_batch": 4,
      "total_screening_screens": 3,
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
      "price_function": "linear"
    }
  }
}
`

---

## Step 8: Run the Engine Programmatically

Create a file called un-study.ts:

`	ypescript
import { ACBCEngine, MemoryStorage } from "./src/index.js";
import { readFileSync } from "node:fs";

// Load your study configuration
const config = JSON.parse(readFileSync("./my-study.json", "utf-8"));

// Create the engine
const engine = new ACBCEngine(
  "shoe-study",
  "respondent-001",
  config,
  "my-seed-123",
  new MemoryStorage()
);

// Start the survey
engine.start();
console.log("Phase:", engine.getState().phase); // "BYO"

// Submit BYO choices
engine.submitEvent({
  type: "BYO_SUBMITTED",
  answers: { brand: "nike", size: "10", color: "black" },
});
console.log("Phase:", engine.getState().phase); // "SCREENING"

// Submit screening responses
const pool = engine.getState().conceptPool;
const responses = pool.slice(0, 4).map((concept, i) => ({
  conceptId: concept.id,
  possible: i % 2 === 0, // Alternate possible/not possible
  screenIndex: i,
}));

engine.submitEvent({
  type: "SCREEN_SUBMITTED",
  responses,
});
console.log("Phase:", engine.getState().phase);

// Continue until DONE...
`

Run it:
`ash
npx tsx run-study.ts
`

---

## Step 9: Understand the Event-Driven Architecture

The engine uses an **event-driven** pattern. Think of it like a board game:

1. **The board** = EngineState (current game state)
2. **The rules** = educe() function (how moves change the board)
3. **A move** = EngineEvent (what the player did)
4. **The move history** = EventLog (record of all moves)

You never change the board directly. You always submit a move, and the rules update the board.

`
State ──[event]──▶ reduce() ──▶ New State
  │                                │
  └────── persisted in log ────────┘
`

This design gives you:
- **Reproducibility:** Same events = same result, every time
- **Auditability:** Complete history of what happened
- **Resume safety:** Replay the log to recover from a crash

---

## Step 10: Explore the Code

### Start with the Types
Open src/core/types.ts. This file defines every data structure. Read it top to bottom — it is the dictionary of the entire project.

### Follow the Reducer
Open src/core/reducer.ts. This is the state machine. Each case in the switch statement handles one phase. Follow what happens when an event arrives.

### Trace a Concept's Journey
1. generator.ts creates concepts near C0
2. cutoff.ts detects patterns in screening responses
3. eplacement.ts regenerates invalidated concepts
4. matrix.ts encodes everything into a design matrix
5. mnl.ts estimates utilities from the matrix

---

## Common Tasks

### Type-Check Without Building
`ash
npm run typecheck
`

### Run a Single Test File
`ash
npx vitest run test/unit/design/generator.test.ts
`

### Run Tests in Watch Mode (re-runs on file change)
`ash
npx vitest
`

### Check for TypeScript Errors
`ash
npx tsc --noEmit
`

---

## Troubleshooting

### "Cannot find module" errors
Run 
pm install again. The 
ode_modules/ folder may be corrupted.

### Tests fail after editing code
Run 
pm run typecheck first. TypeScript errors often cause test failures.

### "Module not found" when running tsx scripts
Make sure you are in the project root directory.

### Import errors in your own code
The project uses ESM imports (.js extension in imports, even for .ts files):
`	ypescript
// Correct
import { ACBCEngine } from "./src/index.js";

// Wrong (missing .js extension)
import { ACBCEngine } from "./src/index";
`

---

## Next Steps

1. Read the main [README.md](../README.md) for architecture overview
2. Read [doc/PHASES.md](PHASES.md) for detailed phase behavior
3. Read [doc/CONFIG.md](CONFIG.md) for configuration options
4. Read [doc/ESTIMATION.md](ESTIMATION.md) for statistical estimation
5. Read [doc/API.md](API.md) for the complete API reference
