# Systematic Literature Review Summary

This is a concise summary of the findings in `ACBC_SLR_AdaptiveEngine_Requirements.md`, which informed every architectural decision in the engine.

## Core finding

Adaptive Choice-Based Conjoint (ACBC) outperforms traditional CBC on realistic holdout tasks, especially for products with five or more attributes. It does this by combining non-compensatory screening logic with compensatory choice tasks and estimating individual-level part-worth utilities via Hierarchical Bayes (HB).

## Research branches

The review organized the literature into six branches:

1. **CBC Foundations and Limitations** — standard CBC suffers from cognitive burden and assumes fully compensatory preferences.
2. **ACBC Three-Phase Architecture** — BYO configurator, possibility screening, and choice tournament.
3. **Utility Estimation and HB Modeling** — effects coding, task-specific scale factors, and None threshold calibration.
4. **Non-Compensatory Preference Behavior** — consideration-set theory and conjunctive screening rules.
5. **Open-Source Survey Engineering** — no mature open-source JavaScript ACBC engine exists.
6. **Agentic Preference Learning** — emerging Bayesian and LLM-driven frameworks that formalize adaptive questioning.

## Why the three phases work together

ACBC is structurally a sequential Bayesian preference elicitation system. The three phases are coded into a single unified design matrix and estimated jointly:

- **BYO** contributes K binary tasks, one per non-price attribute.
- **Screening** contributes T binary decisions against a None threshold.
- **Tournament** contributes multinomial choice tasks built from surviving concepts.

Each phase carries a different information density and error scale. Partial estimation, such as using only tournament data, degrades individual-level precision.

## Key design implications

- **Design generation is on-the-fly and per respondent**, not pre-study offline.
- **Price should be modeled as continuous**, preferably piecewise linear with 3-5 breakpoints, not as a regular discrete attribute.
- **Non-compensatory rules** (must-have / unacceptable) are detected from screening responses and used to regenerate the concept pool.
- **Near-neighbor designs** trade D-efficiency for ecological validity. This is empirically justified and must be documented.

## Implementation gap

No mature open-source JavaScript library implements full ACBC mechanics natively. Commercial implementations are tightly coupled to Sawtooth Software's Lighthouse Studio. This engine fills that gap while remaining compatible with SurveyJS and OpenSurvey.js shells.

## Emerging trends

- LLM digital twins as synthetic respondents for pre-study calibration
- Conversational ACBC mediated by AI agents
- Adaptive design metrics moving from static D-efficiency to Bayesian Expected Information Gain

## References

See `ACBC_SLR_AdaptiveEngine_Requirements.md` for the full systematic literature review, including the semantic tree diagram, cross-path analysis, functional requirements FR-1 through FR-7, and non-functional requirements.
