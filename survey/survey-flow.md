# Qualtrics Survey Flow Specification — GRC ACBC

## 1. Embedded Data block (TOP of Survey Flow)

Declare all fields below BEFORE any question block.
Set `acbcEngineUrl` to your deployed engine URL.

| Field | Initial value |
|---|---|
| `acbcEngineUrl` | `https://your-engine-host.com` |
| `acbcSessionId` | (blank) |
| `acbcTaskJson` | (blank) |
| `acbcPhase` | (blank) |
| `acbcIteration` | 0 |
| `acbcDone` | false |
| `acbcChoice` | (blank) |
| `acbcTaskId` | (blank) |
| `acbcTaskType` | (blank) |
| `acbcLastTaskFull` | (blank) |
| `profile_segment` | (blank) |
| `profile_currentProvider` | (blank) |
| `profile_frameworks` | (blank) |
| `profile_deploymentPref` | (blank) |
| `profile_aiComfort` | (blank) |
| `profile_tprmActive` | (blank) |
| `profile_product_area` | (blank) |
| `profile_ttv_importance` | (blank) |
| `QID_segment_recode` | `${q://QIDsegment/SelectedChoicesRecode}` |
| `QID_deployment_recode` | `${q://QIDdeployment/SelectedChoicesRecode}` |
| `QID_ai_comfort_recode` | `${q://QIDaicomfort/SelectedChoicesRecode}` |
| `QID_tprm_recode` | `${q://QIDtprm/SelectedChoicesRecode}` |
| `QID_frameworks_recodes` | `${q://QIDframeworks/SelectedChoicesRecode}` |
| `QID_provider_text` | `${q://QIDprovider/ChoiceTextEntryValue}` |
| `QID_product_area_recode` | `${q://QIDproductarea/SelectedChoicesRecode}` |
| `QID_ttv_importance_recode` | `${q://QIDttv/SelectedChoicesRecode}` |

## 2. Intro / Consent block

Standard intro + consent. Screener knock-outs here (role, company size, active GRC).

## 3. Profile-building block

Questions (in order):
1. **QIDsegment** — "Which best describes your organization?" (single choice, recode values: 1=smb, 2=midmarket, 3=enterprise, 4=large_enterprise)
2. **QIDframeworks** — "Which regulatory frameworks apply?" (multi-select; choices: SOX, ISO 27001, SOC 2, GDPR, DORA, EU AI Act, HIPAA, other)
3. **QIDprovider** — "Which GRC solution do you primarily use today?" (single choice + Other/text entry)
4. **QIDdeployment**: "What are your deployment requirements?" (single choice, recode: 1=shared_saas, 2=tenant_isolated, 3=cmk, 4=on_prem). Note: deployment location and data residency are tested together as a single conjoint attribute (deployment_location, 5 levels), not as a separate data-residency attribute.
5. **QIDaicomfort** — "How comfortable is your organization with AI making compliance decisions autonomously?" (single choice, recode: 1-5 matching ai_autonomy level IDs)
6. **QIDtprm** — "Does your organization actively manage third-party vendor risk?" (yes/no, recode: 1=yes, 2=no)
7. **QIDproductarea**: "Which product area do you primarily evaluate or use?" (single choice: Controls / SOX Testing, Internal Audit, Third-Party Risk (TPRM), Enterprise Risk, Compliance)
8. **QIDttv**: "When choosing a GRC platform, how important is fast time to first value (going live)?" (single choice: Not important, Somewhat important, Important, Critical (must be live in under 90 days)). Note: time-to-value is a profile question (profile_ttv_importance) only, not a conjoint attribute.

Add `profile-builder.js` to the OnSubmit of the last profile question in the block (currently attached to **QIDaicomfort**'s QuestionJS; since all profile questions render on a single page, `addOnPageSubmit` fires once all profile fields on the page, including QIDproductarea and QIDttv, have been answered).

`profile_product_area` and `profile_ttv_importance` are Qualtrics-side profile fields only. They are not conjoint attributes and are not sent in the engine `/init` request body (see Section 4).

## 4. Init Web Service element

Place AFTER the profile block, BEFORE the ACBC Task block.

- Method: POST
- URL: `${e://Field/acbcEngineUrl}/init`
- Body (JSON):
  ```
  {
    "studyId": "grc-q3-2026",
    "respondentId": "${e://Field/ResponseID}",
    "qualtricsResponseId": "${e://Field/ResponseID}",
    "profile": {
      "segment":         "${e://Field/profile_segment}",
      "currentProvider": "${e://Field/profile_currentProvider}",
      "frameworks":      "${e://Field/profile_frameworks}",
      "deploymentPref":  "${e://Field/profile_deploymentPref}",
      "aiComfort":       "${e://Field/profile_aiComfort}",
      "tprmActive":      "${e://Field/profile_tprmActive}"
    }
  }
  ```
- Map response fields to Embedded Data:
  - `sessionId` → `acbcSessionId`
  - `acbcTaskJson` → `acbcTaskJson`
  - `acbcPhase` → `acbcPhase`
  - `acbcIteration` → `acbcIteration`
  - `acbcDone` → `acbcDone`

## 5. ACBC Task block

One question: Multiple Choice (single answer), 1 choice placeholder (JS hides Qualtrics native choices).
Paste `grc-task-template.html` into the question HTML body.
Paste `grc-acbc-task.js` into the question JavaScript editor.

The engine drives the choice tasks from its own config; Qualtrics does not hardcode attribute
lists. For reference, the finalized design has 8 conjoint attributes:

1. `regulatory_framework`
2. `deployment_location` (5 levels; merges the former separate data-residency attribute)
3. `ai_autonomy` (5 levels)
4. `tprm`
5. `connected_risk` (siloed / shared_inventory / unified_core / write_back)
6. `integrations`
7. `annual_price`
8. `pricing_model`

There is no `time_to_value` attribute and no standalone `data_residency` attribute.
Time-to-value is captured as the profile question `profile_ttv_importance` instead
(see Section 3).

**Outside-option wording:** the tournament task's "none" choice keeps the underlying value
`"none"` (matched by the R parsing pipeline) but displays as "None of these. We would keep
our current approach, build it in-house, or use custom GPTs instead." (see `grc-acbc-task.js`,
`renderTournament`).

## 6. Next Web Service element

Place AFTER the ACBC Task block, BEFORE the branch.

- Method: POST
- URL: `${e://Field/acbcEngineUrl}/next`
- Body:
  ```
  {
    "sessionId": "${e://Field/acbcSessionId}",
    "taskId":    "${e://Field/acbcTaskId}",
    "taskType":  "${e://Field/acbcTaskType}",
    "choice":    "${e://Field/acbcChoice}"
  }
  ```
- Map response fields same as Init (overwrites Embedded Data with next task).

## 7. Branch + loop

Add a Branch element after the Next Web Service:

- If `acbcDone = false` → go back to the ACBC Task block (set as a Loop target, OR use a Branch
  that jumps to block 5). Qualtrics does not natively loop to arbitrary blocks; workaround: use
  Loop & Merge on the ACBC Task + Next Web Service pair, with the loop count set to 40 (max tasks)
  and an Early End condition `acbcDone = true`.
- If `acbcDone = true` → continue to the Close-out block.

## 8. Close-out block

Firmographics, follow-up questions, thank-you screen.

## 9. End of survey

Standard end-of-survey redirect or completion code.

---

## Qualtrics quirks to remember

- Piped text (`${e://Field/acbcTaskJson}`) resolves at PAGE LOAD. Do not try to update it with JS
  and expect the same page to re-render. The Web Service writes the NEXT task; the task block
  reads it only when the page reloads.
- Turn off page preloading for the ACBC Task block (Survey Options > Look & Feel > Page transitions
  = None). Preloading has broken custom conjoint JS in the wild.
- The Loop & Merge workaround requires the loop count to be generous. Err high (40+); respondents
  who finish early are caught by the `acbcDone = true` branch.
