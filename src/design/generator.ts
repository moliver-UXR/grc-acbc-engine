import { Concept, CutoffRule, StudyConfig } from "../core/types.js";
import { SeededRNG } from "../core/prng.js";
import { createBalancer, LevelBalancer } from "./balancer.js";
import { computePrice } from "./price.js";
import { isRuleViolated } from "../detection/cutoff.js";

export function generateNearNeighborPool(
  c0: Concept,
  rules: CutoffRule[],
  config: StudyConfig,
  rng: SeededRNG,
): Concept[] {
  const { T, Amin, Amax } = config.study.design;
  const balancer = createBalancer(config.study.attributes, { rng });
  const concepts: Concept[] = [];
  let attempts = 0;
  const maxAttempts = T * 10;

  while (concepts.length < T && attempts < maxAttempts) {
    attempts++;
    const candidate = nearNeighborConcept(c0, config, rng, rules, balancer);
    if (!candidate) continue;

    if (isConceptDuplicate(candidate, concepts)) continue;

    if (violatesProhibitedPair(candidate, config)) continue;

    if (rules.some((rule) => {
      if (rule.kind === "mustHave") {
        return candidate.levels[rule.attributeId] !== rule.levelId;
      }
      return isRuleViolated(candidate, rule);
    })) continue;

    for (const attr of config.study.attributes) {
      const lid = candidate.levels[attr.id];
      if (lid) balancer.record(attr.id, lid);
    }

    candidate.price = computePrice(candidate, config, rng);
    candidate.id = `concept-${concepts.length + 1}`;
    concepts.push(candidate);
  }

  return concepts;
}

export function nearNeighborConcept(
  c0: Concept,
  config: StudyConfig,
  rng: SeededRNG,
  rules?: CutoffRule[],
  balancer?: LevelBalancer,
): Concept | null {
  const { Amin, Amax } = config.study.design;
  const ai = rng.randInt(Amin, Amax);
  const byoAttrs = config.study.attributes.filter((a) => a.in_byo);
  const shuffled = rng.shuffle(byoAttrs);
  const attrsToVary = shuffled.slice(0, Math.min(ai, shuffled.length));

  const candidate: Concept = {
    id: "",
    levels: { ...c0.levels },
    source: "SCREENING",
  };

  for (const attr of attrsToVary) {
    let allowed = attr.levels.map((l) => l.id);

    if (rules) {
      allowed = allowed.filter(
        (lid) =>
          !rules.some(
            (r) =>
              r.kind === "unacceptable" &&
              r.attributeId === attr.id &&
              r.levelId === lid,
          ),
      );
    }

    if (allowed.length === 0) return null;

    const levelBalancer = balancer ?? createBalancer(config.study.attributes, { rng });
    const selected = levelBalancer.selectLevel(allowed);
    candidate.levels[attr.id] = selected;
  }

  // Non-BYO attributes flagged vary_in_screening (e.g. price, pricing model)
  // never appear in the BYO warm-up, so they are not part of attrsToVary
  // above. Give each one an independently randomized level here so it still
  // varies across the screening/tournament concept pool.
  const varyOnlyAttrs = config.study.attributes.filter(
    (a) => !a.in_byo && a.vary_in_screening === true,
  );
  for (const attr of varyOnlyAttrs) {
    candidate.levels[attr.id] = rng.pick(attr.levels).id;
  }

  return candidate;
}

export function isConceptDuplicate(
  candidate: Concept,
  pool: Concept[],
): boolean {
  return pool.some((c) =>
    Object.keys(c.levels).every((k) => c.levels[k] === candidate.levels[k]),
  );
}

/**
 * True if a concept contains any prohibited level combination declared in
 * config.study.design.prohibited_pairs (e.g. on-prem deployment paired with a
 * cloud-region data residency level). Concepts that violate a pair are skipped
 * during pool generation so a contradictory bundle is never shown.
 */
export function violatesProhibitedPair(
  candidate: Concept,
  config: StudyConfig,
): boolean {
  const pairs = config.study.design.prohibited_pairs;
  if (!pairs || pairs.length === 0) return false;
  return pairs.some(
    ([a, b]) =>
      candidate.levels[a.attributeId] === a.levelId &&
      candidate.levels[b.attributeId] === b.levelId,
  );
}
