# GRC ACBC Instrument — Qualtrics Survey

Qualtrics survey files for the AuditBoard GRC buyer-preference ACBC study (UX1-275).

The engine that drives adaptive task generation lives at
[moliver28/Adaptive-Choice-Based-Conjoint-ACBC-Engine](https://github.com/moliver28/Adaptive-Choice-Based-Conjoint-ACBC-Engine).
Qualtrics is a dumb renderer; this repo holds the rendering JS, HTML templates,
and the Survey Flow specification.

## Files

| File | Purpose |
|---|---|
| `grc-task-template.html` | HTML table injected into the Qualtrics ACBC Task question |
| `grc-acbc-task.js` | OnLoad + OnSubmit JS for the ACBC Task question |
| `profile-builder.js` | OnSubmit JS for the last profile-building question |
| `embedded-data-spec.md` | All Qualtrics Embedded Data fields |
| `survey-flow.md` | Qualtrics Survey Flow layout (blocks, web services, branches) |
| `api-contract.md` | JSON contract between Qualtrics and the engine API |
| `leeper-original/` | Original Leeper political conjoint (reference) |

## Setup

1. Deploy the engine server (see engine repo README).
2. Import this survey into Qualtrics via the `.qsf` file (not yet committed; use `survey-flow.md` to build manually).
3. Set the `acbcEngineUrl` Embedded Data field to your deployed engine URL.
