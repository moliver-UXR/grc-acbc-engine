# Embedded Data Specification — GRC ACBC Survey

All fields must be declared in the Embedded Data element at the TOP of Survey Flow
before any JS writes them (Qualtrics requirement).

## Profile fields (written by profile-builder.js or Survey Flow recodes)

| Field | Type | Source | Example |
|---|---|---|---|
| `profile_segment` | string | QID_segment recode | "midmarket" |
| `profile_currentProvider` | string | QID_provider choice text | "ServiceNow" |
| `profile_frameworks` | JSON array string | QID_frameworks selected choices | `["SOX","ISO27001"]` |
| `profile_deploymentPref` | string | QID_deployment recode | "tenant_isolated" |
| `profile_aiComfort` | string | QID_ai_comfort recode | "ai_executes_approved" |
| `profile_tprmActive` | string | QID_tprm recode | "yes" |
| `profile_product_area` | string | QID_product_area recode | "internal_audit" |
| `profile_ttv_importance` | string | QID_ttv_importance recode | "critical_under_90_days" |

`profile_product_area` and `profile_ttv_importance` are Qualtrics-side profile fields only.
They are not conjoint attributes and are not included in the engine `/init` request body.

## ACBC session fields (written by Web Service elements)

| Field | Type | Source | Description |
|---|---|---|---|
| `acbcEngineUrl` | string | Static (set in Embedded Data block) | `https://your-engine-host.com` |
| `acbcSessionId` | string | /init response | Engine session identifier |
| `acbcTaskJson` | string | /init or /next response | Current task as JSON string |
| `acbcPhase` | string | /init or /next response | Engine phase (BYO, SCREENING, …) |
| `acbcIteration` | string | /init or /next response | Screening concepts seen so far |
| `acbcDone` | string | /init or /next response | "true" when complete |

## ACBC task capture fields (written by grc-acbc-task.js OnSubmit)

| Field | Type | Source | Description |
|---|---|---|---|
| `acbcChoice` | JSON string | grc-acbc-task.js | Respondent's choice for the current task |
| `acbcTaskId` | string | grc-acbc-task.js | Task ID (matches taskId in acbcTaskJson) |
| `acbcTaskType` | string | grc-acbc-task.js | byo / screening / confirm / tournament / calibration |
| `acbcLastTaskFull` | JSON string | grc-acbc-task.js | Full task JSON shown (provenance) |
