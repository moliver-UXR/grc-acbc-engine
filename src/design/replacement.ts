import { Concept, CutoffRule, StudyConfig } from "../core/types.js";
import { SeededRNG } from "../core/prng.js";
import { nearNeighborConcept, isConceptDuplicate } from "./generator.js";
import { isRuleViolated } from "../detection/cutoff.js";

export function replaceInvalidatedConcepts(
  pool: Concept[],
  rules: CutoffRule[],
  c0: Concept,
  config: StudyConfig,
  rng: SeededRNG,
): Concept[] {
  const originalSize = pool.length;

  const valid = pool.filter(
    (concept) => !rules.some((rule) => isRuleViolated(concept, rule)),
  );

  const removedCount = originalSize - valid.length;

  for (let i = 0; i < removedCount; i++) {
    const replacement = tryGenerateReplacement(
      c0,
      rules,
      config,
      rng,
      valid,
    );
    if (replacement) {
      valid.push(replacement);
    }
  }

  return valid;
}

export function regeneratePool(
  pool: Concept[],
  rules: CutoffRule[],
  c0: Concept,
  config: StudyConfig,
  rng: SeededRNG,
): Concept[] {
  return replaceInvalidatedConcepts(pool, rules, c0, config, rng);
}

function tryGenerateReplacement(
  c0: Concept,
  rules: CutoffRule[],
  config: StudyConfig,
  rng: SeededRNG,
  existingPool: Concept[],
): Concept | null {
  const maxAttempts = 50;

  for (let i = 0; i < maxAttempts; i++) {
    const candidate = nearNeighborConcept(c0, config, rng, rules);
    if (!candidate) continue;

    if (isConceptDuplicate(candidate, existingPool)) continue;

    if (rules.some((rule) => isRuleViolated(candidate, rule))) continue;

    candidate.source = "REPLACEMENT";
    candidate.id = `replacement-${existingPool.length + 1}`;

    return candidate;
  }

  return null;
}
