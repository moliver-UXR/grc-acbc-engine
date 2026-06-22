# ACBC Engine

An open-source TypeScript engine for Adaptive Choice-Based Conjoint (ACBC) surveys. It runs the full three-phase respondent workflow, Build Your Own, Screening, and Choice Tournament, and exports a unified design matrix for Multinomial Logit or Hierarchical Bayes estimation. The engine is framework-agnostic and pairs with survey shells such as SurveyJS or OpenSurvey.js.

## What ACBC does

Standard Choice-Based Conjoint (CBC) shows every respondent the same pre-built choice tasks. ACBC adapts the survey to each respondent. It learns the respondent's preferred concept in the BYO phase, generates nearby concepts for possibility screening, detects non-compensatory must-have and unacceptable rules, then runs a customized choice tournament among the surviving concepts. This usually produces stronger individual-level utility estimates than standard CBC for products with five or more attributes.

## Key features

- On-the-fly, respondent-specific design generation using a near-neighbor algorithm
- Pure reducer with an append-only event log for reproducible state
- Deterministic seeded PRNG so the same seed reproduces the same respondent path
- Must-have and unacceptable cutoff detection with automatic replacement-card generation
- Unified effects-coded design matrix across all phases
- Browser-native streaming aggregate MNL for field monitoring
- HB server endpoint contract for server-side estimation
- Robotic respondent harness for design-quality validation
- Zero mandatory framework dependencies

## Installation

```bash
npm install
npm run build
```

## Quick start

```typescript
import { ACBCEngine, MemoryStorage } from "./src/index.js";
import config from "./test/fixtures/sample-study.json";

const engine = new ACBCEngine(
  "study-1",
  "respondent-42",
  config,
  "deterministic-seed",
  new MemoryStorage()
);

engine.start();

engine.submitEvent({
  type: "BYO_SUBMITTED",
  answers: {
    brand: "brand_a",
    price: "price_mid",
    color: "color_red",
  },
});

console.log(engine.getState().phase);
```

## Running tests

```bash
npm test                 # vitest run
npm run typecheck        # tsc --noEmit
```

## Documentation

- [Architecture](ARCHITECTURE.md)
- [API Reference](API.md)
- [Study Configuration](CONFIG.md)
- [Survey Phases](PHASES.md)
- [Estimation](ESTIMATION.md)
- [Validation](VALIDATION.md)
- [Systematic Literature Review Summary](SLR_SUMMARY.md)

## License

MIT. The engine core is framework-agnostic. Optional adapters for SurveyJS (MIT) and OpenSurvey.js (AGPL-3.0) live under `src/integration/` and follow the licensing expectations of their respective platforms.
