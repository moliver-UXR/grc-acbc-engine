# Study Configuration

The engine is driven by a single JSON study configuration. It is validated at runtime with Zod via `parseConfig()`.

## Minimal example

```json
{
  "study": {
    "attributes": [
      {
        "id": "brand",
        "label": "Brand",
        "in_byo": true,
        "price_type": "none",
        "levels": [
          { "id": "brand_a", "label": "Brand A" },
          { "id": "brand_b", "label": "Brand B" },
          { "id": "brand_c", "label": "Brand C" }
        ]
      }
    ],
    "design": {
      "T": 6,
      "Amin": 1,
      "Amax": 2,
      "screens_per_concept_batch": 3,
      "total_screening_screens": 2,
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
      "price_function": "piecewise",
      "piecewise_breakpoints": [100, 200, 300]
    }
  }
}
```

## Full sample study

The fixture at `test/fixtures/sample-study.json` is used throughout the test suite:

```json
{
  "study": {
    "attributes": [
      {
        "id": "brand",
        "label": "Brand",
        "in_byo": true,
        "price_type": "none",
        "levels": [
          { "id": "brand_a", "label": "Brand A" },
          { "id": "brand_b", "label": "Brand B" },
          { "id": "brand_c", "label": "Brand C" }
        ]
      },
      {
        "id": "price",
        "label": "Price",
        "in_byo": true,
        "price_type": "summed",
        "levels": [
          { "id": "price_low", "label": "$100", "price_increment": 100 },
          { "id": "price_mid", "label": "$200", "price_increment": 200 },
          { "id": "price_high", "label": "$300", "price_increment": 300 }
        ]
      },
      {
        "id": "color",
        "label": "Color",
        "in_byo": true,
        "price_type": "none",
        "levels": [
          { "id": "color_red", "label": "Red" },
          { "id": "color_blue", "label": "Blue" },
          { "id": "color_green", "label": "Green" }
        ]
      }
    ],
    "design": {
      "T": 6,
      "Amin": 1,
      "Amax": 2,
      "screens_per_concept_batch": 3,
      "total_screening_screens": 2,
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
      "price_function": "piecewise",
      "piecewise_breakpoints": [100, 200, 300]
    }
  }
}
```

## Schema fields

### `study.attributes`

An array of attributes. Each attribute has:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Machine identifier, used in events and the design matrix. |
| `label` | string | Human-readable label shown to respondents. |
| `in_byo` | boolean | Whether the attribute appears in the Build Your Own phase. |
| `price_type` | `"none"`, `"component"`, `"summed"` | How price is handled. |
| `levels` | array | Each level has `id`, `label`, and optionally `price_increment`. |

### `study.design`

| Field | Type | Description |
|-------|------|-------------|
| `T` | number | Total near-neighbor concepts to generate. |
| `Amin` | number | Minimum number of attributes to vary per concept. |
| `Amax` | number | Maximum number of attributes to vary per concept. |
| `screens_per_concept_batch` | number | Concepts shown per screening screen. |
| `total_screening_screens` | number | Target number of screening screens. |
| `price_variation_pct` | number | Fraction for random price variation, applied as plus-or-minus. |
| `price_rounding` | number | Round price to this unit. |

### `study.phases`

Booleans enabling each phase:

- `byo` — Build Your Own
- `screening` — possibility screening
- `must_have` — must-have rule confirmation
- `unacceptable` — unacceptable rule confirmation
- `tournament` — choice tournament
- `calibration` — purchase-intent calibration

### `study.estimation`

| Field | Type | Description |
|-------|------|-------------|
| `method` | `"hb"`, `"mnl"`, `"monotone_regression"` | Preferred estimation backend. |
| `price_function` | `"linear"`, `"log_linear"`, `"piecewise"` | Price model. |
| `piecewise_breakpoints` | number[] | Required when `price_function` is `"piecewise"`. |

## Loading the config

```typescript
import { ACBCEngine, parseConfig } from "./src/index.js";
import rawConfig from "./study.json";

const config = parseConfig(rawConfig);
const engine = new ACBCEngine("study-1", "r-1", config, "seed");
```

Zod validation reports the offending field when the JSON is malformed, which is useful during study authoring.
