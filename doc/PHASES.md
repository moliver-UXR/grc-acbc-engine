# Survey Phases

ACBC is a sequential state machine. The respondent moves through phases in order, and each phase contributes a different kind of preference information to the final estimation model. All phases are estimated jointly from a single design matrix.

## Phase overview

| Phase | Input | Output |
|-------|-------|--------|
| BYO (Build Your Own) | Attribute-level selections | Seed concept C0 |
| Screening | Possibility decisions per concept | Survivors plus candidate cutoff rules |
| Confirm Rules | Respondent confirms or rejects detected rules | Confirmed must-have / unacceptable rules |
| Regenerate | Rules invalidate planned concepts | Replacement concept pool |
| Tournament | Triple choice tasks | Winning concept sequence |
| Calibration | Purchase intent Likert | None threshold anchor |

## BYO: Build Your Own

The respondent configures their ideal product by choosing one level for every `in_byo` attribute. The resulting concept C0 seeds the rest of the survey.

```typescript
engine.submitEvent({
  type: "BYO_SUBMITTED",
  answers: {
    brand: "brand_a",
    price: "price_mid",
    color: "color_red",
  },
});
```

BYO serves two purposes. It engages the respondent with a realistic configurator, and it gives the engine a respondent-specific anchor from which to generate near-neighbor concepts.

## Screening

The engine generates `T` near-neighbor concepts by varying `Amin` to `Amax` attributes away from C0. Concepts are shown in batches of `screens_per_concept_batch`. The respondent marks each one as "a possibility" or "not a possibility."

```typescript
engine.submitEvent({
  type: "SCREEN_SUBMITTED",
  responses: [
    { conceptId: "concept-1", possible: true, screenIndex: 0 },
    { conceptId: "concept-2", possible: false, screenIndex: 1 },
  ],
});
```

Each screening response becomes a binary observation in the design matrix with a `none_threshold` column set to 1. Screening ends when `total_screening_screens * screens_per_concept_batch` responses have been collected.

## Must-have and unacceptable detection

After enough screens, the engine scans the response history for systematic patterns:

- **Must-have**: a level is always chosen when shown, and no other level of that attribute has been accepted.
- **Unacceptable**: a level is always rejected when shown.

The default exposure threshold is three consistent responses. When a pattern is detected, the engine enters a confirmation phase and asks the respondent to confirm or reject the rule.

```typescript
engine.submitEvent({ type: "RULE_CONFIRMED" });
// or
engine.submitEvent({ type: "RULE_REJECTED" });
```

Confirmed rules constrain all later concept generation and replacement.

## Regenerate

If a confirmed rule invalidates planned concepts, the engine enters `REGENERATE`, filters the concept pool, and fills it back to size `T` with replacement concepts that satisfy every confirmed rule. This phase is transparent to the respondent and advances automatically on the next screening event.

```typescript
engine.submitEvent({ type: "SCREEN_SUBMITTED", responses: [] });
```

## Tournament

Surviving concepts, those marked possible, compete in triples. The bracket is built by shuffling survivors and grouping them into triples. Winners advance to the next round until one winner remains. The respondent picks the preferred concept in each triple. Ties are resolved by a deterministic coin flip seeded per matchup.

```typescript
engine.submitEvent({
  type: "TOURNAMENT_TASK_SUBMITTED",
  matchupId: "r0-t0",
  chosenConceptId: "concept-3",
});
```

The UI may gray out attribute columns where all three concepts share the same level, reducing cognitive load.

## Calibration

Optional phase. The respondent rates purchase intent for a calibration concept on a 1-5 Likert scale. This anchors the None threshold utility.

```typescript
engine.submitEvent({
  type: "CALIBRATION_SUBMITTED",
  answer: { conceptId: "concept-1", purchaseIntent: 4 },
});
```

## Phase transitions

The reducer advances phases automatically based on state:

```
BYO
  -> SCREENING
       -> CONFIRM_MUST_HAVE / CONFIRM_UNACCEPTABLE
       -> REGENERATE
       -> TOURNAMENT
            -> CALIBRATION (optional)
                 -> DONE
```

Each transition is deterministic and reproducible given the same seed and event history.
