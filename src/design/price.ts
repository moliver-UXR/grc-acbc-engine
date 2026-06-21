import { Concept, StudyConfig } from "../core/types.js";
import { SeededRNG } from "../core/prng.js";

export function basePrice(concept: Concept, config: StudyConfig): number {
  let total = 0;
  for (const attr of config.study.attributes) {
    if (attr.price_type === "none") continue;
    const levelId = concept.levels[attr.id];
    if (!levelId) continue;
    const level = attr.levels.find((l) => l.id === levelId);
    if (level?.price_increment != null) {
      total += level.price_increment;
    }
  }
  return total;
}

export function applyPriceVariation(
  base: number,
  config: StudyConfig,
  rng: SeededRNG,
): number {
  const { price_variation_pct, price_rounding } = config.study.design;
  const factor = 1 + (rng.next() * 2 - 1) * price_variation_pct;
  return Math.round((base * factor) / price_rounding) * price_rounding;
}

export function computePrice(
  concept: Concept,
  config: StudyConfig,
  rng?: SeededRNG,
): number | undefined {
  const hasPrice = config.study.attributes.some(
    (a) => a.price_type !== "none",
  );
  if (!hasPrice) return undefined;

  const base = basePrice(concept, config);
  if (!rng) return base;

  return applyPriceVariation(base, config, rng);
}

/**
 * Encode a price into a piecewise-linear design vector.
 *
 * Given `breakpoints = [b0, b1, ..., bn]` (length n+1, typically 3-5 entries
 * per FR-5), returns an array of n segment values. For each segment i
 * (1-indexed, spanning [b(i-1), bi]):
 *   - price <= b(i-1): 0  (segment not yet entered)
 *   - price >= bi:     bi - b(i-1)  (segment fully saturated)
 *   - otherwise:       price - b(i-1)  (partial segment contribution)
 *
 * Edge cases:
 *   - Empty breakpoints → empty array.
 *   - Single breakpoint → empty array (no segments).
 *   - Price below all breakpoints → all zeros.
 *   - Price above all breakpoints → full segment widths.
 *
 * Breakpoints are assumed to be sorted ascending; unsorted input is rejected
 * with an Error to avoid silent miscoding.
 */
export function piecewisePriceVector(
  price: number,
  breakpoints: number[],
): number[] {
  if (breakpoints.length < 2) return [];
  for (let i = 1; i < breakpoints.length; i++) {
    if (breakpoints[i] <= breakpoints[i - 1]) {
      throw new Error(
        `piecewisePriceVector: breakpoints must be strictly ascending; got [${breakpoints.join(", ")}]`,
      );
    }
  }
  const vector: number[] = [];
  for (let i = 1; i < breakpoints.length; i++) {
    const lower = breakpoints[i - 1];
    const upper = breakpoints[i];
    if (price <= lower) {
      vector.push(0);
    } else if (price >= upper) {
      vector.push(upper - lower);
    } else {
      vector.push(price - lower);
    }
  }
  return vector;
}
