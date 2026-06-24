# API Contract: Qualtrics ↔ ACBC Engine

Base URL: stored in Qualtrics Embedded Data field `acbcEngineUrl`.

---

## POST /init

Called by Qualtrics Web Service after the profile-building block.

### Request body

```json
{
  "studyId": "grc-q3-2026",
  "respondentId": "${e://Field/ResponseID}",
  "qualtricsResponseId": "${e://Field/ResponseID}",
  "profile": {
    "segment": "${e://Field/profile_segment}",
    "currentProvider": "${e://Field/profile_currentProvider}",
    "frameworks": "${e://Field/profile_frameworks}",
    "deploymentPref": "${e://Field/profile_deploymentPref}",
    "aiComfort": "${e://Field/profile_aiComfort}",
    "tprmActive": "${e://Field/profile_tprmActive}"
  }
}
```

### Response — mapped to Embedded Data

| Response field | Embedded Data field | Type |
|---|---|---|
| `sessionId` | `acbcSessionId` | string |
| `acbcTaskJson` | `acbcTaskJson` | JSON string |
| `acbcPhase` | `acbcPhase` | string |
| `acbcIteration` | `acbcIteration` | string |
| `acbcDone` | `acbcDone` | "true" / "false" |

---

## POST /next

Called by Qualtrics Web Service after each ACBC task page.

### Request body

```json
{
  "sessionId": "${e://Field/acbcSessionId}",
  "taskId": "${e://Field/acbcTaskId}",
  "taskType": "${e://Field/acbcTaskType}",
  "choice": "${e://Field/acbcChoice}"
}
```

`acbcChoice` is a JSON-string-encoded `Record<string, string>`.
Format varies by taskType — see below.

### Choice shapes by task type

**byo:** `{ "regulatory_framework": "multi", "deployment": "tenant_isolated", ... }`

**screening:** `{ "concept-abc123": "possible", "concept-def456": "not-possible", ... }`

**confirm:** `{ "confirm_decision": "confirm" }` or `{ "confirm_decision": "reject" }`

**tournament:** `{ "tournament_choice": "concept-abc123" }` (or `"none"`)

**calibration:** `{ "purchase_intent": "4" }` (1-5 scale)

### Response

Same fields as `/init` response.

---

## QualtricsTask schema (acbcTaskJson)

```typescript
{
  taskId: string;
  taskType: "byo" | "screening" | "confirm" | "tournament" | "calibration";
  phase: string;
  iteration: number;
  prompt: string;
  done: boolean;

  // BYO only
  attributes?: Array<{
    id: string;
    label: string;
    levels: Array<{ id: string; label: string }>;
  }>;

  // Screening + tournament
  concepts?: Array<{
    id: string;
    attributes: Array<{ id: string; label: string; level: string; levelId: string }>;
  }>;

  // Tournament only
  grayedAttributes?: string[];

  // Confirm only
  candidateRule?: {
    kind: "mustHave" | "unacceptable";
    attributeId: string;
    attributeLabel: string;
    levelId: string;
    levelLabel: string;
  };

  // Calibration only
  winnerConcept?: { id: string; attributes: [...] };
}
```
