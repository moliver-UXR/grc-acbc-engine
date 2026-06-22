# Estimation

The ACBC engine unifies data from all phases into one design matrix and estimates part-worth utilities. All three phases contribute jointly. Partial estimation degrades individual-level precision.

## The unified effects-coded design matrix

`buildDesignMatrix(state, config)` returns rows in this deterministic order:

1. BYO rows (one per non-price BYO attribute)
2. Screening rows (one per screened concept)
3. Tournament rows (three rows per task)
4. Calibration row (when present)

### Effects coding

For an attribute with `L` levels, effects coding produces `L - 1` columns. Level `i` (with `i < L - 1`) gets a 1 in column `i` and 0 elsewhere. The last level is aliased as -1 in every column.

```typescript
import { effectsCode } from "./src/estimation/matrix.js";

effectsCode(0, 3); // [1, 0]
effectsCode(1, 3); // [0, 1]
effectsCode(2, 3); // [-1, -1]
```

This makes the coefficients sum to zero within each attribute, so utilities are normalized in the standard conjoint way.

### Header columns

For the sample study (`brand`, `price`, `color`), the header looks like:

```
brand_brand_a, brand_brand_b,
price,
none_threshold,
task_id,
phase
```

`color_red` and `color_blue` appear similarly. The omitted reference levels are `brand_c` and `color_green`.

### Row encoding

```typescript
import { buildDesignMatrix } from "./src/estimation/matrix.js";

const matrix = buildDesignMatrix(state, config);

for (const row of matrix.rows) {
  console.log(row.taskId, row.phase, row.response, row.values);
}
```

- BYO rows encode the full C0 concept and have `response = 1`.
- Screening rows have `none_threshold = 1` and `response = 1` if the concept was marked possible, otherwise `0`.
- Tournament rows have `response = 1` for the chosen concept and `0` for the two losers.
- Calibration rows have `response = purchaseIntent`.

### Helper functions

`src/estimation/matrix.js` also exports helpers used by the matrix builder:

```typescript
import { encodeAttributeLevels, getConceptPrice } from "./src/estimation/matrix.js";

const codes = encodeAttributeLevels(concept, config);
const price = getConceptPrice(concept, config);
```

## Streaming MNL

`StreamingMNL` is a browser-native aggregate logit estimator. It is useful for field monitoring and quick diagnostics, but it is not a substitute for Hierarchical Bayes.

```typescript
import { StreamingMNL } from "./src/estimation/mnl.js";

const mnl = new StreamingMNL({ columns: matrix.header });
for (const row of matrix.rows) {
  mnl.update(row);
}
const result = mnl.estimate();
console.log(result.utilities);
```

The estimator:

- Treats BYO and Screening rows as binary Bernoulli observations.
- Groups Tournament rows by `taskId` and models them with softmax.
- Ignores Calibration rows.
- Runs gradient ascent until convergence or `maxIterations`.

Options include `learningRate`, `maxIterations`, `convergenceThreshold`, and `columns`.

## Hierarchical Bayes (server-side)

The engine provides an HB endpoint contract in `src/estimation/hb-interface.ts`:

```typescript
import {
  serializeMatrix,
  buildHBRequest,
  parseHBResult,
} from "./src/estimation/hb-interface.js";

const payload = serializeMatrix(matrix);
const request = buildHBRequest(matrix, { chains: 4, iterations: 2000 });

// Send request to an R/Python/Stan HB service.
const result = parseHBResult(serverResponse, matrix);
console.log(result.respondentUtilities);
console.log(result.attributeImportance);
console.log(result.noneUtility);
```

`parseHBResult` also computes attribute importance scores as `(attribute range) / (sum of ranges) × 100`. Discrete attributes reconstruct the omitted reference level as the negative sum of the explicit effects-coded utilities. The continuous price attribute uses `|β_price| × (max_price − min_price)` observed in the matrix rows.

## Piecewise price encoding

For piecewise-linear price models, `src/design/price.js` exports `piecewisePriceVector`:

```typescript
import { piecewisePriceVector } from "./src/design/price.js";

piecewisePriceVector(150, [100, 200, 300]); // [50, 0]
piecewisePriceVector(250, [100, 200, 300]); // [100, 50]
```

This function is separate from the design matrix builder because the current matrix uses a single continuous `price` column. Studies that need explicit piecewise columns can post-process the price value with this vector.

## MNL vs HB

| Concern | Streaming MNL | Hierarchical Bayes |
|---------|---------------|-------------------|
| Location | Browser | Server |
| Level | Aggregate | Individual plus population |
| Use case | Monitoring, diagnostics | Final analysis, WTP, segmentation |
| Calibration rows | Ignored | Can be used |
| Scale factors | Single | Task-specific via Otter's method |

For publication-quality utilities, use HB. Use MNL only as a quick health check during fielding.
