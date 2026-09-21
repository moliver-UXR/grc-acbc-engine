import { describe, it, expect, beforeEach } from "vitest";
import { replaceInvalidatedConcepts, regeneratePool } from "../../../src/design/replacement.js";
import { Concept, CutoffRule, StudyConfig } from "../../../src/core/types.js";
import { SeededRNG } from "../../../src/core/prng.js";
import { isRuleViolated } from "../../../src/detection/cutoff.js";

function makeConfig(): StudyConfig {
  return {
    study: {
      attributes: [
        {
          id: "brand",
          label: "Brand",
          levels: [
            { id: "brand-a", label: "Brand A" },
            { id: "brand-b", label: "Brand B" },
            { id: "brand-c", label: "Brand C" },
          ],
          in_byo: true,
          price_type: "none",
        },
        {
          id: "color",
          label: "Color",
          levels: [
            { id: "red", label: "Red" },
            { id: "blue", label: "Blue" },
            { id: "green", label: "Green" },
          ],
          in_byo: true,
          price_type: "none",
        },
        {
          id: "size",
          label: "Size",
          levels: [
            { id: "small", label: "Small" },
            { id: "medium", label: "Medium" },
            { id: "large", label: "Large" },
          ],
          in_byo: true,
          price_type: "component",
        },
      ],
      design: {
        T: 6,
        Amin: 1,
        Amax: 2,
        screens_per_concept_batch: 3,
        total_screening_screens: 12,
        price_variation_pct: 0.1,
        price_rounding: 1,
      },
      phases: {
        byo: true,
        screening: true,
        must_have: true,
        unacceptable: true,
        tournament: true,
        calibration: false,
      },
      estimation: {
        method: "hb",
        price_function: "linear",
      },
    },
  };
}

function makeC0(): Concept {
  return {
    id: "c0",
    levels: { brand: "brand-a", color: "red", size: "medium" },
    source: "BYO",
  };
}

function makePool(c0: Concept, count: number): Concept[] {
  const pool: Concept[] = [];
  for (let i = 0; i < count; i++) {
    pool.push({
      id: `concept-${i + 1}`,
      levels: { ...c0.levels },
      source: "SCREENING",
    });
  }
  return pool;
}

describe("replaceInvalidatedConcepts", () => {
  let config: StudyConfig;
  let c0: Concept;
  let rng: SeededRNG;

  beforeEach(() => {
    config = makeConfig();
    c0 = makeC0();
    rng = new SeededRNG("test-seed-replacement");
  });

  it("returns unchanged pool when no rules are violated", () => {
    const pool = makePool(c0, 4);
    const rules: CutoffRule[] = [];

    const result = replaceInvalidatedConcepts(pool, rules, c0, config, rng);

    expect(result).toHaveLength(4);
    expect(result.every((c) => c.source === "SCREENING")).toBe(true);
  });

  it("removes concepts that violate unacceptable rules", () => {
    const pool: Concept[] = [
      { id: "c1", levels: { brand: "brand-a", color: "red", size: "small" }, source: "SCREENING" },
      { id: "c2", levels: { brand: "brand-b", color: "red", size: "medium" }, source: "SCREENING" },
      { id: "c3", levels: { brand: "brand-c", color: "blue", size: "large" }, source: "SCREENING" },
    ];

    const rules: CutoffRule[] = [
      { kind: "unacceptable", attributeId: "brand", levelId: "brand-a", confirmedAtScreen: 3 },
    ];

    const result = replaceInvalidatedConcepts(pool, rules, c0, config, rng);

    expect(result).toHaveLength(3);
    expect(result.find((c) => c.id === "c1")).toBeUndefined();
    expect(result.find((c) => c.source === "REPLACEMENT")).toBeDefined();
  });

  it("keeps pool size stable after replacement", () => {
    const pool: Concept[] = [
      { id: "c1", levels: { brand: "brand-a", color: "red", size: "small" }, source: "SCREENING" },
      { id: "c2", levels: { brand: "brand-a", color: "blue", size: "medium" }, source: "SCREENING" },
      { id: "c3", levels: { brand: "brand-c", color: "green", size: "large" }, source: "SCREENING" },
      { id: "c4", levels: { brand: "brand-b", color: "red", size: "small" }, source: "SCREENING" },
    ];

    const rules: CutoffRule[] = [
      { kind: "unacceptable", attributeId: "brand", levelId: "brand-a", confirmedAtScreen: 4 },
    ];

    const result = replaceInvalidatedConcepts(pool, rules, c0, config, rng);

    expect(result).toHaveLength(4);
  });

  it("replacement concepts have source REPLACEMENT", () => {
    const pool: Concept[] = [
      { id: "c1", levels: { brand: "brand-a", color: "red", size: "small" }, source: "SCREENING" },
      { id: "c2", levels: { brand: "brand-b", color: "blue", size: "medium" }, source: "SCREENING" },
    ];

    const rules: CutoffRule[] = [
      { kind: "unacceptable", attributeId: "brand", levelId: "brand-a", confirmedAtScreen: 2 },
    ];

    const result = replaceInvalidatedConcepts(pool, rules, c0, config, rng);

    const replacement = result.find((c) => c.source === "REPLACEMENT");
    expect(replacement).toBeDefined();
  });

  it("replacement concepts do not violate the rules", () => {
    const pool: Concept[] = [
      { id: "c1", levels: { brand: "brand-a", color: "red", size: "small" }, source: "SCREENING" },
      { id: "c2", levels: { brand: "brand-b", color: "blue", size: "medium" }, source: "SCREENING" },
      { id: "c3", levels: { brand: "brand-c", color: "green", size: "large" }, source: "SCREENING" },
    ];

    const rules: CutoffRule[] = [
      { kind: "unacceptable", attributeId: "brand", levelId: "brand-a", confirmedAtScreen: 3 },
    ];

    const result = replaceInvalidatedConcepts(pool, rules, c0, config, rng);

    for (const concept of result) {
      for (const rule of rules) {
        expect(concept.levels[rule.attributeId]).not.toBe(rule.levelId);
      }
    }
  });

  it("handles multiple rules simultaneously", () => {
    const pool: Concept[] = [
      { id: "c1", levels: { brand: "brand-a", color: "red", size: "small" }, source: "SCREENING" },
      { id: "c2", levels: { brand: "brand-b", color: "red", size: "medium" }, source: "SCREENING" },
      { id: "c3", levels: { brand: "brand-c", color: "blue", size: "large" }, source: "SCREENING" },
    ];

    const rules: CutoffRule[] = [
      { kind: "unacceptable", attributeId: "brand", levelId: "brand-a", confirmedAtScreen: 3 },
      { kind: "unacceptable", attributeId: "color", levelId: "red", confirmedAtScreen: 3 },
    ];

    const result = replaceInvalidatedConcepts(pool, rules, c0, config, rng);

    expect(result).toHaveLength(3);
    const violatedConcepts = result.filter((concept) =>
      rules.some((rule) => concept.levels[rule.attributeId] === rule.levelId),
    );
    expect(violatedConcepts).toHaveLength(0);
  });

  it("filters concepts using isRuleViolated semantics (unacceptable rules)", () => {
    const pool: Concept[] = [
      { id: "c1", levels: { brand: "brand-a", color: "blue", size: "small" }, source: "SCREENING" },
      { id: "c2", levels: { brand: "brand-b", color: "red", size: "medium" }, source: "SCREENING" },
    ];

    const rules: CutoffRule[] = [
      { kind: "unacceptable", attributeId: "brand", levelId: "brand-a", confirmedAtScreen: 2 },
    ];

    const result = replaceInvalidatedConcepts(pool, rules, c0, config, rng);

    expect(result).toHaveLength(2);
    const brandAConcepts = result.filter((c) => c.levels["brand"] === "brand-a");
    expect(brandAConcepts).toHaveLength(0);
  });

  it("returns fewer concepts when replacement fails after max attempts", () => {
    const constrainedConfig: StudyConfig = {
      ...config,
      study: {
        ...config.study,
        attributes: [
          {
            id: "brand",
            label: "Brand",
            levels: [{ id: "brand-a", label: "Brand A" }],
            in_byo: true,
            price_type: "none",
          },
        ],
        design: {
          ...config.study.design,
          Amin: 0,
          Amax: 0,
        },
      },
    };

    const c0Single: Concept = {
      id: "c0",
      levels: { brand: "brand-a" },
      source: "BYO",
    };

    const pool: Concept[] = [
      { id: "c1", levels: { brand: "brand-a" }, source: "SCREENING" },
    ];

    const rules: CutoffRule[] = [
      { kind: "unacceptable", attributeId: "brand", levelId: "brand-a", confirmedAtScreen: 1 },
    ];

    const result = replaceInvalidatedConcepts(pool, rules, c0Single, constrainedConfig, rng);

    expect(result).toHaveLength(0);
  });
});

describe("regeneratePool", () => {
  let config: StudyConfig;
  let c0: Concept;
  let rng: SeededRNG;

  beforeEach(() => {
    config = makeConfig();
    c0 = makeC0();
    rng = new SeededRNG("test-seed-regenerate");
  });

  it("is an alias for replaceInvalidatedConcepts", () => {
    const pool: Concept[] = [
      { id: "c1", levels: { brand: "brand-a", color: "red", size: "small" }, source: "SCREENING" },
      { id: "c2", levels: { brand: "brand-b", color: "blue", size: "medium" }, source: "SCREENING" },
    ];

    const rules: CutoffRule[] = [
      { kind: "unacceptable", attributeId: "brand", levelId: "brand-a", confirmedAtScreen: 2 },
    ];

    const resultReplace = replaceInvalidatedConcepts(pool, rules, c0, config, new SeededRNG("test-seed-regenerate"));
    const resultRegenerate = regeneratePool(pool, rules, c0, config, new SeededRNG("test-seed-regenerate"));

    expect(resultRegenerate).toHaveLength(resultReplace.length);
    expect(resultRegenerate.every((c) => c.source === "REPLACEMENT" || c.source === "SCREENING")).toBe(true);
  });

  it("maintains pool size for REGENERATE phase", () => {
    const pool: Concept[] = [
      { id: "c1", levels: { brand: "brand-a", color: "red", size: "small" }, source: "SCREENING" },
      { id: "c2", levels: { brand: "brand-a", color: "blue", size: "medium" }, source: "SCREENING" },
      { id: "c3", levels: { brand: "brand-c", color: "green", size: "large" }, source: "SCREENING" },
      { id: "c4", levels: { brand: "brand-b", color: "red", size: "small" }, source: "SCREENING" },
      { id: "c5", levels: { brand: "brand-b", color: "blue", size: "medium" }, source: "SCREENING" },
      { id: "c6", levels: { brand: "brand-c", color: "green", size: "large" }, source: "SCREENING" },
    ];

    const rules: CutoffRule[] = [
      { kind: "unacceptable", attributeId: "brand", levelId: "brand-a", confirmedAtScreen: 6 },
    ];

    const result = regeneratePool(pool, rules, c0, config, rng);

    expect(result).toHaveLength(6);
  });

  it("produces unique replacement IDs across two sequential regenerations, even when the second regeneration removes some of the first batch's replacements (fuzzed across many seeds)", () => {
    // The collision depends on how many concepts survive each filtering round,
    // which depends on which random levels landed where. Fuzz across many
    // seeds so we reliably hit a shrinking-pool scenario (the plan's fuzz
    // description puts the defect rate at ~16% of respondents for 2+ confirmed
    // rules, so a few dozen seeds is enough to expose it against buggy code).
    for (let seed = 0; seed < 60; seed++) {
      const pool: Concept[] = [
        { id: "c1", levels: { brand: "brand-a", color: "red", size: "small" }, source: "SCREENING" },
        { id: "c2", levels: { brand: "brand-a", color: "blue", size: "medium" }, source: "SCREENING" },
        { id: "c3", levels: { brand: "brand-a", color: "green", size: "large" }, source: "SCREENING" },
        { id: "c4", levels: { brand: "brand-b", color: "red", size: "small" }, source: "SCREENING" },
      ];

      const firstRules: CutoffRule[] = [
        { kind: "unacceptable", attributeId: "brand", levelId: "brand-a", confirmedAtScreen: 4 },
      ];

      const localRng = new SeededRNG(`fuzz-seed-${seed}`);
      const afterFirst = regeneratePool(pool, firstRules, c0, config, localRng);

      // Second regeneration: additionally invalidate color=blue, which knocks
      // out some of the first batch's replacements and forces a second round
      // of replacement minting on a shrunken pool.
      const secondRules: CutoffRule[] = [
        ...firstRules,
        { kind: "unacceptable", attributeId: "color", levelId: "blue", confirmedAtScreen: 5 },
      ];

      const afterSecond = regeneratePool(afterFirst, secondRules, c0, config, localRng);

      const allIds = afterSecond.map((c) => c.id);
      expect(new Set(allIds).size, `seed ${seed} produced duplicate IDs: ${allIds.join(", ")}`).toBe(allIds.length);
    }
  });

  it("never reuses a replacement-N number while a live concept still holds it (fuzzed across many seeds)", () => {
    for (let seed = 0; seed < 60; seed++) {
      const pool: Concept[] = [
        { id: "c1", levels: { brand: "brand-a", color: "red", size: "small" }, source: "SCREENING" },
        { id: "c2", levels: { brand: "brand-a", color: "blue", size: "medium" }, source: "SCREENING" },
        { id: "c3", levels: { brand: "brand-a", color: "green", size: "large" }, source: "SCREENING" },
      ];

      const firstRules: CutoffRule[] = [
        { kind: "unacceptable", attributeId: "brand", levelId: "brand-a", confirmedAtScreen: 3 },
      ];

      const localRng = new SeededRNG(`fuzz-seed-b-${seed}`);
      const afterFirst = regeneratePool(pool, firstRules, c0, config, localRng);

      // Second round invalidates color=green, forcing more replacements. Any
      // newly minted replacement-N must not collide with a surviving one.
      const secondRules: CutoffRule[] = [
        ...firstRules,
        { kind: "unacceptable", attributeId: "color", levelId: "green", confirmedAtScreen: 4 },
      ];

      // Only concepts that don't violate the *new* rule are actually eligible
      // to survive round 2 unchanged; those violating it get filtered out and
      // their number is legitimately eligible for reuse.
      const survivingReplacementIds = new Set(
        afterFirst
          .filter((c) => c.source === "REPLACEMENT")
          .filter((c) => !secondRules.some((rule) => isRuleViolated(c, rule)))
          .map((c) => c.id),
      );

      const afterSecond = regeneratePool(afterFirst, secondRules, c0, config, localRng);

      const stillSurviving = afterSecond.filter((c) => survivingReplacementIds.has(c.id));
      // Every concept sharing an ID with a first-round survivor must be that
      // exact concept (same levels), not a newly minted duplicate-numbered one.
      for (const concept of stillSurviving) {
        const original = afterFirst.find((c) => c.id === concept.id);
        expect(concept.levels, `seed ${seed}: id ${concept.id} reused for a different concept`).toEqual(original?.levels);
      }

      const allIds = afterSecond.map((c) => c.id);
      expect(new Set(allIds).size, `seed ${seed} produced duplicate IDs: ${allIds.join(", ")}`).toBe(allIds.length);
    }
  });

  it("is deterministic: same seed and same rule sequence yield identical replacement IDs across two independent runs", () => {
    const pool: Concept[] = [
      { id: "c1", levels: { brand: "brand-a", color: "red", size: "small" }, source: "SCREENING" },
      { id: "c2", levels: { brand: "brand-a", color: "blue", size: "medium" }, source: "SCREENING" },
      { id: "c3", levels: { brand: "brand-b", color: "red", size: "large" }, source: "SCREENING" },
    ];

    const firstRules: CutoffRule[] = [
      { kind: "unacceptable", attributeId: "brand", levelId: "brand-a", confirmedAtScreen: 3 },
    ];
    const secondRules: CutoffRule[] = [
      ...firstRules,
      { kind: "unacceptable", attributeId: "color", levelId: "blue", confirmedAtScreen: 4 },
    ];

    function runSequence(seed: string): string[] {
      const localRng = new SeededRNG(seed);
      const afterFirst = regeneratePool(pool, firstRules, c0, config, localRng);
      const afterSecond = regeneratePool(afterFirst, secondRules, c0, config, localRng);
      return afterSecond.map((c) => c.id);
    }

    const runA = runSequence("determinism-seed");
    const runB = runSequence("determinism-seed");

    expect(runA).toEqual(runB);
  });
});
