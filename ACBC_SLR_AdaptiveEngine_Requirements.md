# Adaptive Choice-Based Conjoint (ACBC): Systematic Literature Review & Adaptive Engine Requirements for OpenSurvey.js

---

## Executive Summary

Adaptive Choice-Based Conjoint (ACBC) represents the most information-rich stated-preference methodology available for quantifying individual respondent utilities in complex multi-attribute choice environments. This systematic literature review maps the semantic landscape of ACBC — from its theoretical foundations in choice modeling to its algorithmic mechanics and psychometric properties — and synthesizes these findings into a concrete set of functional and technical requirements for an adaptive engine capable of powering an OpenSurvey.js JavaScript survey application.

The central finding is that ACBC outperforms traditional CBC in predicting realistic consumer decisions, particularly for complex products with five or more attributes, by combining non-compensatory screening logic with compensatory choice tasks and estimating individual-level part-worth utilities via Hierarchical Bayes (HB). Translating this into a JavaScript engine requires real-time, on-the-fly design generation, stateful preference tracking across three sequential phases, and either client-side or server-side HB approximation.

---

## Phase 1: Root Analysis & Initial Branching

### Topic Decomposition

The core topic decomposes into four interlocking research domains:

1. **Preference elicitation methodology** — the theoretical basis for why and how humans reveal preferences under bounded cognition
2. **Adaptive survey mechanics** — the algorithmic logic governing BYO, Screening, and Choice Tournament phases
3. **Statistical estimation** — Hierarchical Bayes, Multinomial Logit (MNL), and Latent Class methods for part-worth recovery
4. **Survey software engineering** — JavaScript-based survey libraries, real-time state management, and adaptive branching logic

### Primary Branches (Level 1)

| Branch | Semantic Relationship to Root | Research Density |
|--------|-------------------------------|-----------------|
| L1-A: CBC Foundations & Limitations | Historical precursor; defines what ACBC solves | High — foundational literature |
| L1-B: ACBC Three-Phase Architecture | Core mechanics; the engine specification | High — Sawtooth technical papers |
| L1-C: Utility Estimation & HB Modeling | Statistical backbone; defines output quality | High — econometrics/HCI overlap |
| L1-D: Non-Compensatory Preference Behavior | Cognitive science basis for screening logic | Medium — behavioral decision theory |
| L1-E: Open-Source Survey Engineering | Implementation substrate; JavaScript survey libs | Medium — emerging/fragmented |
| L1-F: Agentic Preference Learning | Emerging framework; AI-adaptive questioning theory | Emerging — 2025-2026 literature |

---

## Phase 2: Tree-of-Thought Expansion

### Semantic Term Diagram

```
ACBC ADAPTIVE ENGINE FOR OPENSURVEY.JS
│
├─ * L1-A: CBC Foundations & Limitations (high-value)
│  ├─ L2-A1: Choice Task Cognitive Burden
│  │  ├─ L3-A1a: Respondent Heuristic Shortcuts (12-15s/task avg.)
│  │  └─ L3-A1b: Non-Compensatory Cutoff Rules ←→ L2-B2
│  ├─ L2-A2: Design Efficiency (D-optimality, orthogonality)
│  │  └─ L3-A2a: Minimal Overlap Designs & Information Paradox
│  └─ L2-A3: Individual vs. Aggregate Estimation limits in CBC
│
├─ * L1-B: ACBC Three-Phase Architecture (high-value) #boundary
│  ├─ * L2-B1: BYO (Build Your Own) Configurator Phase
│  │  ├─ L3-B1a: Near-Neighbor Concept Generation Algorithm
│  │  └─ L3-B1b: Summed Price Mechanism & Continuous Price Modeling
│  ├─ * L2-B2: Screening Phase & Must-Have/Unacceptable Logic ←→ L3-A1b
│  │  ├─ L3-B2a: Hypothesis-Driven Cutoff Detection
│  │  └─ L3-B2b: Replacement Card Generation
│  └─ * L2-B3: Choice Tournament (CBC-style Triples)
│     ├─ L3-B3a: Tournament Bracket Logic (t/2 rounds)
│     └─ L3-B3b: Tied-Attribute Graying (UX simplification)
│
├─ * L1-C: Utility Estimation & HB Modeling (high-value)
│  ├─ * L2-C1: Hierarchical Bayes Part-Worth Recovery
│  │  ├─ L3-C1a: Task-Specific Scale Factors (Otter's Method)
│  │  └─ L3-C1b: Effects Coding & Design Matrix Construction
│  ├─ L2-C2: Multinomial Logit (MNL) & Maximum Likelihood
│  │  └─ L3-C2a: Aggregate vs. Individual Level Analysis
│  └─ L2-C3: None Threshold Calibration
│     └─ L3-C3a: Calibration Concepts Section (purchase intent Likert)
│
├─ L1-D: Non-Compensatory Preference Behavior #boundary
│  ├─ L2-D1: Consideration Set Formation Theory
│  │  └─ L3-D1a: 85% of CBC Choices Explained by ≤4 Attribute Levels
│  ├─ L2-D2: Bounded Rationality & Information Processing
│  └─ ^ L2-D3: Conjoint Analysis as Preference Space Exploration ←→ L1-F
│
├─ L1-E: Open-Source Survey Engineering #boundary
│  ├─ L2-E1: JavaScript Survey Libraries (SurveyJS, OpenSurvey)
│  │  ├─ L3-E1a: Dynamic Flow & Conditional Branching APIs
│  │  └─ L3-E1b: Real-Time State Persistence & Session Management
│  ├─ ^ L2-E2: R Shiny & Open-Source Adaptive Conjoint Implementations
│  └─ L2-E3: Custom HTML/CSS Conjoint within Commercial Platforms
│
└─ ^ L1-F: Agentic Preference Learning (emerging) ←→ L2-D3
   ├─ ^ L2-F1: Solicit-Then-Suggest Framework (2026)
   │  ├─ L3-F1a: Bayesian Posterior Updating via Kalman Filter
   │  └─ L3-F1b: Solicitation Depth vs. Assortment Breadth Trade-off
   ├─ ^ L2-F2: LLM-Powered Conjoint Simulation
   └─ ^ L2-F3: Water-Filling Optimal Query Sequencing

LEGEND:
* = High-value, research-dense node
^ = Emerging research direction
# = Boundary concept bridging distinct domains
←→ = Significant cross-connection between branches
```

---

## Phase 3: Cross-Path Analysis

### Semantic Clusters

**Cluster 1: Cognitive-Algorithmic Bridge**
Nodes L3-A1a (heuristic shortcuts), L3-A1b (non-compensatory rules), and L2-B2 (screening phase) converge to form the theoretical justification for ACBC's phased design. The empirical finding that 85% of CBC responses can be explained by respondents attending to at most four attribute levels directly motivates the must-have/unacceptable detection logic in the screening phase.

**Cluster 2: Real-Time Estimation**
Nodes L2-C1 (HB estimation), L3-F1a (Kalman filtering), and L3-B1a (near-neighbor generation) share a Bayesian inference backbone. The emerging agentic literature formalizes what ACBC practitioners have implemented heuristically: sequential posterior updates driven by observed choice behavior. The Kalman gain equation governing agentic preference learning directly maps to the HB upper-model covariance update in ACBC.

**Cluster 3: JS Implementation Gap**
Nodes L2-E1 through L2-E3 cluster around a notable absence: no mature, open-source JavaScript library implements full ACBC mechanics natively. This is the primary engineering gap motivating this engine specification.

### Unexpected Connections

A 2026 arXiv paper on agentic purchasing (Cao & Hu) provides a formal mathematical foundation for why ACBC works: solicitation depth (adaptive questions) reduces mismatch at O(1/m) while assortment breadth reduces it at only O(k^{-2/d}). This rate asymmetry formally justifies ACBC's investment in respondent-specific adaptive questioning over larger choice sets.

---

## Phase 4: Synthesis & Key Insights

### Structural Insights

- ACBC is structurally a **sequential Bayesian preference elicitation system** coded as a unified choice dataset and estimated jointly as a single MNL/HB model across all three phases
- The three phases contribute different information densities: BYO contributes K tasks (one per attribute), Screening contributes T binary comparisons against a None threshold, and the Tournament contributes t/2 choice tasks
- Typical ACBC studies span **5-12 attributes with 2-6 levels each**, though the system supports up to 100 attributes and 250 levels
- ACBC consistently **outperforms CBC on realistic holdout tasks** (tournament-style customized holdouts), though parity on standard minimal-overlap holdouts reflects shared methodology artifacts

### Gaps & Opportunities

- No open-source JavaScript ACBC engine exists; commercial implementations are tightly coupled to Sawtooth Software's Lighthouse Studio
- **Task-Specific Scale Factor HB** (Otter's Method) requires n≥300 respondents for stable differential scale estimates; lightweight JS approximations need testing
- The interaction between ACBC's screening pruning and statistical efficiency under small samples (n<50) remains underexplored
- Integration of LLM-based preference signal extraction with conjoint utility estimation is nascent

### Cross-Disciplinary Connections

- **Behavioral economics**: ACBC's design directly operationalizes consideration set theory and Gilbride/Hauser work on conjunctive screening rules
- **HCI**: The BYO configurator phase functions as a mental model alignment step, reducing cognitive distance between survey and real purchase behavior
- **Agentic AI**: The solicit-then-suggest framework provides formal theoretical grounding; water-filling solicitation policy maps to ACBC's attribute-by-attribute adaptive focus
- **Information theory**: Optimal query direction selection (maximizing posterior variance reduction) provides a formal criterion for replacement card generation

### Emerging Trends

- LLM digital twins as synthetic conjoint respondents (arXiv 2025), enabling pre-study calibration of ACBC designs
- Conversational ACBC replacing structured questionnaires as AI agents mediate the BYO and screening interactions
- Adaptive design quality metrics moving from D-efficiency (static) to Bayesian Expected Information Gain (dynamic)

### Methodological Observations

- ACBC's "near-neighbor" design algorithm trades D-efficiency for ecological validity; this is justified empirically but requires explicit documentation in any JS implementation
- The three sections must be estimated jointly using a unified effects-coded design matrix; partial estimation (e.g., only tournament data) degrades individual-level precision
- Price modeling should default to **piecewise linear** (3-5 breakpoints) rather than linear or log-linear for most product categories

---

## Adaptive Engine Requirements Specification

### Functional Requirements

#### FR-1: Phase Architecture

The engine MUST implement the following sequential phases as a configurable state machine:

| Phase | ID | Required | Description |
|-------|----|----------|-------------|
| Build Your Own (BYO) | PH-1 | Yes (default) | Attribute-level configurator seeding C₀ |
| Screening | PH-2 | Yes (default) | Binary possibility screening with None threshold |
| Must-Have Detection | PH-2a | Conditional | Triggered after ≥2 screening screens if pattern detected |
| Unacceptable Detection | PH-2b | Conditional | Triggered after pattern of systematic avoidance |
| Replacement Card Generation | PH-2c | Conditional | Fires when confirmed cutoffs prune planned concepts |
| Choice Tournament | PH-3 | Yes (default) | Bracket elimination in triples |
| Calibration | PH-4 | Optional | Purchase intent Likert for None threshold |

#### FR-2: Design Generation (On-the-Fly)

The engine MUST generate respondent-specific concept pools at survey runtime using the near-neighbor algorithm:

- **Input**: C₀ (BYO vector), T (total concepts to generate), Amin, Amax, price variation range
- **Algorithm steps**: Random Ai selection ∈ [Amin, Amax] → random attribute selection → non-BYO level assignment → prohibited-pair/duplicate check → D-efficiency improvement via relabeling/swapping
- **Level balance**: Maintain per-attribute counts arrays; weight selection probability inversely to current count deficit
- **Default parameters**: Amin=2, Amax=4 for 8-9 attribute studies; scale with attribute count
- **Replacement cards**: When cutoff confirmed, filter planned concepts against rule, regenerate pruned count with attribute fixed at confirmed level

#### FR-3: Screening Logic

- Present 3-5 concepts per screen; target 7-9 total screens
- Each concept receives binary "possibility / not a possibility" response
- After each screen, scan response history for systematic level avoidance (candidate unacceptable) or exclusive selection (candidate must-have)
- Threshold for pattern detection: ≥3 consistent responses favoring or avoiding a single level
- Must-have confirmation: present after ≥2 unacceptable screens; allow only one cutoff rule per screen
- All subsequently generated concepts must satisfy all confirmed cutoff rules

#### FR-4: Tournament Logic

- Present surviving concepts (those marked "possibility") in triples
- Number of rounds = floor(t/2) where t = number of surviving concepts
- Winners advance to next round; ties resolved by coin flip or None option
- Gray (visually suppress) attribute columns where all three concepts share the same level
- Track full response sequence for inclusion in estimation design matrix

#### FR-5: Price Handling

- Support discrete price levels (standard attribute) OR summed/continuous price
- Summed price: base price + sum of component level prices ± random variation (default ±30%)
- Price variation rounding: configurable (nearest $1, $5, $10, $0.01, etc.)
- Price estimation models: Linear, Log-Linear, Piecewise (recommended; 3-5 breakpoints)

#### FR-6: Estimation Interface

- Export a unified `.CHO`-compatible design matrix encoding all three phases with effects coding
- BYO tasks: K binary choice tasks (K = non-price attributes)
- Screening tasks: T binary decisions with None threshold dummy variable
- Tournament tasks: standard multinomial choice format
- Support direct HB estimation call (server-side) or streaming MNL aggregate estimation (client-side)
- Output: part-worth utility vector per respondent, attribute importance scores, None threshold utility

#### FR-7: Survey Configuration Schema

```json
{
  "study": {
    "attributes": [
      {
        "id": "string",
        "label": "string",
        "levels": [{"id": "string", "label": "string", "price_increment": 0}],
        "in_byo": true,
        "price_type": "none | component | summed"
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
      "method": "hb | mnl | monotone_regression",
      "price_function": "linear | log_linear | piecewise",
      "piecewise_breakpoints": [100, 200, 300]
    }
  }
}
```

### Non-Functional Requirements

| Requirement | Specification |
|-------------|--------------|
| **Latency** | Design generation per concept < 50ms in browser (JS); < 10ms server-side |
| **Concurrency** | Server-side design generation must support ≥100 simultaneous respondents |
| **State persistence** | Full phase state (C₀, concept pool, screening responses, cutoffs, tournament bracket) must survive page refresh via sessionStorage or server session |
| **Accessibility** | BYO configurator and screening cards must meet WCAG 2.1 AA; grayed attributes must use aria-disabled + visual indicator |
| **Compatibility** | Vanilla JS ES2022+; zero mandatory framework dependencies; optional SurveyJS plugin adapter |
| **Extensibility** | Plugin API for custom BYO renderers (sliders, cards, dropdowns), custom estimation backends, and custom scoring functions |
| **Estimation output** | Part-worth utilities normalized to zero-sum effects coding; importance scores as range/(sum of ranges) × 100 |
| **Validation** | Built-in test design module: simulate N robotic random respondents, compute per-respondent D-efficiency and aggregate standard errors |

### Integration Architecture for OpenSurvey.js

```
┌────────────────────────────────────────────────────────────────┐
│                    ACBC Engine (acbc-engine.js)                 │
│                                                                  │
│  ┌──────────┐  ┌───────────────┐  ┌─────────────────────────┐  │
│  │  Config  │  │ Design Generator│  │   Phase State Machine   │  │
│  │  Parser  │  │ (near-neighbor) │  │  BYO→Screen→Tournament  │  │
│  └──────────┘  └───────────────┘  └─────────────────────────┘  │
│                         │                        │              │
│                         ▼                        ▼              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Response Collector & Pattern Detector        │   │
│  │     (cutoff hypothesis detection, must-have triggers)    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │               Design Matrix Builder (.CHO)                │   │
│  │         (effects coding, scale factors, None col)         │   │
│  └──────────────────────────────────────────────────────────┘   │
│                    │                      │                      │
│                    ▼                      ▼                      │
│  ┌─────────────────────┐   ┌──────────────────────────────┐    │
│  │ Browser MNL Estimator│   │  HB Server Endpoint (optional) │   │
│  │  (streaming aggregate│   │  (R/Python/WASM HB runtime)   │   │
│  │   logit, real-time)  │   └──────────────────────────────┘   │
│  └─────────────────────┘                                        │
└────────────────────────────────────────────────────────────────┘
         │                                         │
         ▼                                         ▼
┌──────────────────┐                   ┌────────────────────┐
│  OpenSurvey.js   │                   │  Part-Worth Output  │
│  Survey Shell    │                   │  (utilities, import-│
│  (question render│                   │   ance, WTP, None)  │
│  flow, progress) │                   └────────────────────┘
└──────────────────┘
```

---

## Appendix: ACBC vs. CBC Comparative Profile

| Dimension | Standard CBC | ACBC |
|-----------|-------------|------|
| Attributes supported | 4-7 practical limit | 5-12 recommended; 100 max |
| Respondent engagement | Repetitive, low engagement | High; BYO + relevance-focused |
| Non-compensatory capture | Poor (design assumes compensatory) | Explicit must-have/unacceptable elicitation |
| Design generation | Pre-study offline | On-the-fly, per respondent |
| Individual-level estimation | Requires large n (HB) | Strong even at small n |
| Holdout prediction (realistic) | Baseline | Consistently superior |
| Survey length | 15-20 min (12+ tasks) | 20-30 min (3 phases) |
| Price handling | Discrete levels only | Summed continuous + component prices |
| Open-source JS implementation | Partial (SurveyJS conjoint plugins) | None (gap this engine fills) |
