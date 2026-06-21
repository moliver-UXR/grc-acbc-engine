import { describe, it, expect, beforeEach } from "vitest";
import { replaceInvalidatedConcepts, regeneratePool } from "../../../src/design/replacement.js";
import { Concept, CutoffRule, StudyConfig } from "../../../src/core/types.js";
import { SeededRNG } from "../../../src/core/prng.js";

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
});
