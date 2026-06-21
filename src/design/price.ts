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
