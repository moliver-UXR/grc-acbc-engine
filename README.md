# GRC ACBC Instrument — Qualtrics Survey

Qualtrics survey files for the AuditBoard GRC buyer-preference ACBC study (UX1-275).

The engine that drives adaptive task generation lives at
[moliver-UXR/grc-acbc-engine](https://github.com/moliver-UXR/grc-acbc-engine).
Qualtrics is a dumb renderer; this repo holds the rendering JS, HTML templates,
the Survey Flow specification, and the generated QSF file.

## GRC deliverable files

These are the actual study assets. Everything needed to field the GRC ACBC survey lives here (also mirrored into [`repos/acbc-engine/survey/`](https://github.com/moliver-UXR/grc-acbc-engine) as the deployed copy).

| File | Purpose |
|---|---|
| `grc-task-template.html` | HTML table injected into the Qualtrics ACBC Task question |
| `grc-acbc-task.js` | OnLoad + OnSubmit JS for the ACBC Task question |
| `profile-builder.js` | OnSubmit JS for the last profile-building question |
| `embedded-data-spec.md` | All Qualtrics Embedded Data fields |
| `survey-flow.md` | Qualtrics Survey Flow layout (blocks, web services, branches) |
| `api-contract.md` | JSON contract between Qualtrics and the engine API |
| `grc-acbc-survey.qsf` | Complete Qualtrics Survey Format file (import-ready) |
| `gen_qsf.py` | Python generator script (re-run after editing source assets) |

## Template / reference material — NOT part of the GRC deliverable

This repo started as a fork of Timothy Leeper's political-science conjoint survey example. These files are the original template, kept for reference and attribution only. They are generic (not GRC-specific) and are not imported, deployed, or fielded:

| File | What it is |
|---|---|
| `conjoint.qsf` | Original Leeper example QSF (political conjoint, not GRC) |
| `leeper-original/` | Original Leeper source: `conjoint.js`, `example.html`, `template.html` |
| `example.png`, `look-and-feel.png` | Screenshots from the original example |

## Setup

1. Deploy the engine server (see [engine repo README](https://github.com/moliver-UXR/grc-acbc-engine)).
2. Import `grc-acbc-survey.qsf` into Qualtrics.
3. Set the `acbcEngineUrl` Embedded Data field to your deployed engine URL.
4. Update QID recode expressions in Embedded Data to match real Qualtrics QIDs.
5. Set Survey Options: Look & Feel / Page Transitions = None (ACBC task block).
6. Test using fielding-guide.md Step 3a before going live.
