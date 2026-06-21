import { describe, it, expect } from "vitest";
import {
  generateNearNeighborPool,
  nearNeighborConcept,
  isConceptDuplicate,
} from "../../../src/design/generator.js";
import { Concept, CutoffRule, StudyConfig } from "../../../src/core/types.js";
import { SeededRNG } from "../../../src/core/prng.js";

function makeRNG(seed = "test-seed"): SeededRNG {
  return new SeededRNG(seed);
}

const baseConfig: StudyConfig = {
  study: {
    attributes: [
      {
        id: "brand",
        label: "Brand",
        in_byo: true,
        price_type: "none",
        levels: [
          { id: "nike", label: "Nike" },
          { id: "adidas", label: "Adidas" },
          { id: "puma", label: "Puma" },
        ],
      },
      {
        id: "color",
        label: "Color",
        in_byo: true,
        price_type: "none",
        levels: [
          { id: "red", label: "Red" },
          { id: "blue", label: "Blue" },
          { id: "green", label: "Green" },
        ],
      },
      {
        id: "size",
        label: "Size",
        in_byo: true,
        price_type: "component",
        levels: [
          { id: "small", label: "Small", price_increment: 10 },
          { id: "medium", label: "Medium", price_increment: 20 },
          { id: "large", label: "Large", price_increment: 30 },
        ],
      },
      {
        id: "shipping",
        label: "Shipping",
        in_byo: false,
        price_type: "none",
        levels: [
          { id: "standard", label: "Standard" },
          { id: "express", label: "Express" },
        ],
      },
    ],
    design: {
      T: 6,
      Amin: 1,
      Amax: 2,
      screens_per_concept_batch: 3,
      total_screening_screens: 2,
      price_variation_pct: 0.3,
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
      method: "mnl",
      price_function: "piecewise",
    },
  },
};

const c0: Concept = {
  id: "byo-concept",
  levels: { brand: "nike", color: "red", size: "medium" },
  source: "BYO",
};

describe("isConceptDuplicate", () => {
  it("returns false for empty pool", () => {
    const candidate: Concept = {
      id: "c1",
      levels: { brand: "nike", color: "red" },
      source: "SCREENING",
    };
    expect(isConceptDuplicate(candidate, [])).toBe(false);
  });

  it("returns true when all levels match", () => {
    const pool: Concept[] = [
      {
        id: "c1",
        levels: { brand: "nike", color: "red" },
        source: "SCREENING",
      },
    ];
    const candidate: Concept = {
      id: "c2",
      levels: { brand: "nike", color: "red" },
      source: "SCREENING",
    };
    expect(isConceptDuplicate(candidate, pool)).toBe(true);
  });

  it("returns false when any level differs", () => {
    const pool: Concept[] = [
      {
        id: "c1",
        levels: { brand: "nike", color: "red" },
        source: "SCREENING",
      },
    ];
    const candidate: Concept = {
      id: "c2",
      levels: { brand: "nike", color: "blue" },
      source: "SCREENING",
    };
    expect(isConceptDuplicate(candidate, pool)).toBe(false);
  });

  it("checks against all pool members", () => {
    const pool: Concept[] = [
      {
        id: "c1",
        levels: { brand: "nike", color: "red" },
        source: "SCREENING",
      },
      {
        id: "c2",
        levels: { brand: "adidas", color: "blue" },
        source: "SCREENING",
      },
    ];
    const candidate: Concept = {
      id: "c3",
      levels: { brand: "adidas", color: "blue" },
      source: "SCREENING",
    };
    expect(isConceptDuplicate(candidate, pool)).toBe(true);
  });
});

describe("nearNeighborConcept", () => {
  it("returns a concept with SCREENING source", () => {
    const result = nearNeighborConcept(c0, baseConfig, makeRNG());
    expect(result).not.toBeNull();
    expect(result!.source).toBe("SCREENING");
  });

  it("copies c0 levels as base", () => {
    const result = nearNeighborConcept(c0, baseConfig, makeRNG());
    expect(result!.levels["brand"]).toBeDefined();
    expect(result!.levels["color"]).toBeDefined();
    expect(result!.levels["size"]).toBeDefined();
  });

  it("varies between Amin and Amax attributes from BYO set", () => {
    const configDistinct: StudyConfig = {
      ...baseConfig,
      study: {
        ...baseConfig.study,
        attributes: baseConfig.study.attributes.map((a) => {
          if (a.id === "brand") {
            return { ...a, levels: [{ id: "adidas", label: "Adidas" }, { id: "puma", label: "Puma" }] };
          }
          if (a.id === "color") {
            return { ...a, levels: [{ id: "blue", label: "Blue" }, { id: "green", label: "Green" }] };
          }
          if (a.id === "size") {
            return { ...a, levels: [{ id: "small", label: "Small", price_increment: 10 }, { id: "large", label: "Large", price_increment: 30 }] };
          }
          return a;
        }),
      },
    };
    const c0Distinct: Concept = {
      id: "byo-concept",
      levels: { brand: "nike", color: "red", size: "medium" },
      source: "BYO",
    };

    const rng = makeRNG("variation-test");
    const variedCounts: number[] = [];

    for (let i = 0; i < 50; i++) {
      const result = nearNeighborConcept(c0Distinct, configDistinct, rng);
      if (!result) continue;
      const varied = Object.keys(result.levels).filter(
        (k) => result.levels[k] !== c0Distinct.levels[k]
      ).length;
      variedCounts.push(varied);
    }

    expect(variedCounts.length).toBeGreaterThan(0);
    const minVaried = Math.min(...variedCounts);
    const maxVaried = Math.max(...variedCounts);
    expect(minVaried).toBeGreaterThanOrEqual(configDistinct.study.design.Amin);
    expect(maxVaried).toBeLessThanOrEqual(configDistinct.study.design.Amax);
  });

  it("filters out unacceptable levels", () => {
    const rules: CutoffRule[] = [
      {
        kind: "unacceptable",
        attributeId: "brand",
        levelId: "adidas",
        confirmedAtScreen: 1,
      },
    ];

    for (let i = 0; i < 50; i++) {
      const result = nearNeighborConcept(c0, baseConfig, makeRNG(`seed-${i}`), rules);
      if (result) {
        expect(result.levels["brand"]).not.toBe("adidas");
      }
    }
  });

  it("returns null when all levels of a varied attribute are unacceptable", () => {
    const rules: CutoffRule[] = [
      {
        kind: "unacceptable",
        attributeId: "brand",
        levelId: "nike",
        confirmedAtScreen: 1,
      },
      {
        kind: "unacceptable",
        attributeId: "brand",
        levelId: "adidas",
        confirmedAtScreen: 1,
      },
      {
        kind: "unacceptable",
        attributeId: "brand",
        levelId: "puma",
        confirmedAtScreen: 1,
      },
    ];

    const results: (Concept | null)[] = [];
    for (let i = 0; i < 100; i++) {
      results.push(nearNeighborConcept(c0, baseConfig, makeRNG(`null-test-${i}`), rules));
    }

    const nullCount = results.filter((r) => r === null).length;
    expect(nullCount).toBeGreaterThan(0);
  });

  it("does not mutate c0", () => {
    const original = JSON.parse(JSON.stringify(c0));
    nearNeighborConcept(c0, baseConfig, makeRNG());
    expect(c0).toEqual(original);
  });

  it("only varies in_byo attributes", () => {
    const result = nearNeighborConcept(c0, baseConfig, makeRNG());
    expect(result!.levels["shipping"]).toBeUndefined();
  });
});

describe("generateNearNeighborPool", () => {
  it("generates T concepts", () => {
    const pool = generateNearNeighborPool(c0, [], baseConfig, makeRNG());
    expect(pool.length).toBe(baseConfig.study.design.T);
  });

  it("assigns sequential IDs starting from concept-1", () => {
    const pool = generateNearNeighborPool(c0, [], baseConfig, makeRNG());
    expect(pool[0].id).toBe("concept-1");
    expect(pool[1].id).toBe("concept-2");
    expect(pool[pool.length - 1].id).toBe(`concept-${pool.length}`);
  });

  it("sets source to SCREENING for all concepts", () => {
    const pool = generateNearNeighborPool(c0, [], baseConfig, makeRNG());
    pool.forEach((c) => expect(c.source).toBe("SCREENING"));
  });

  it("produces no duplicates", () => {
    const pool = generateNearNeighborPool(c0, [], baseConfig, makeRNG());
    for (let i = 0; i < pool.length; i++) {
      for (let j = i + 1; j < pool.length; j++) {
        const isDup = Object.keys(pool[i].levels).every(
          (k) => pool[i].levels[k] === pool[j].levels[k]
        );
        expect(isDup).toBe(false);
      }
    }
  });

  it("filters out unacceptable level violations", () => {
    const rules: CutoffRule[] = [
      {
        kind: "unacceptable",
        attributeId: "color",
        levelId: "green",
        confirmedAtScreen: 1,
      },
    ];
    const pool = generateNearNeighborPool(c0, rules, baseConfig, makeRNG());
    pool.forEach((c) => expect(c.levels["color"]).not.toBe("green"));
  });

  it("filters out must-have violations", () => {
    const rules: CutoffRule[] = [
      {
        kind: "mustHave",
        attributeId: "brand",
        levelId: "nike",
        confirmedAtScreen: 1,
      },
    ];
    const pool = generateNearNeighborPool(c0, rules, baseConfig, makeRNG());
    pool.forEach((c) => expect(c.levels["brand"]).toBe("nike"));
  });

  it("computes price for concepts with price_type attributes", () => {
    const pool = generateNearNeighborPool(c0, [], baseConfig, makeRNG());
    pool.forEach((c) => {
      expect(c.price).toBeDefined();
      expect(typeof c.price).toBe("number");
    });
  });

  it("produces deterministic results with same seed", () => {
    const rng1 = makeRNG("deterministic-pool");
    const rng2 = makeRNG("deterministic-pool");
    const pool1 = generateNearNeighborPool(c0, [], baseConfig, rng1);
    const pool2 = generateNearNeighborPool(c0, [], baseConfig, rng2);

    expect(pool1.length).toBe(pool2.length);
    for (let i = 0; i < pool1.length; i++) {
      expect(pool1[i].id).toBe(pool2[i].id);
      expect(pool1[i].levels).toEqual(pool2[i].levels);
      expect(pool1[i].price).toBe(pool2[i].price);
    }
  });

  it("handles empty rules array", () => {
    const pool = generateNearNeighborPool(c0, [], baseConfig, makeRNG());
    expect(pool.length).toBe(baseConfig.study.design.T);
  });

  it("handles multiple rules of different kinds", () => {
    const rules: CutoffRule[] = [
      {
        kind: "unacceptable",
        attributeId: "color",
        levelId: "green",
        confirmedAtScreen: 1,
      },
      {
        kind: "mustHave",
        attributeId: "size",
        levelId: "medium",
        confirmedAtScreen: 2,
      },
    ];
    const pool = generateNearNeighborPool(c0, rules, baseConfig, makeRNG());

    pool.forEach((c) => {
      expect(c.levels["color"]).not.toBe("green");
      expect(c.levels["size"]).toBe("medium");
    });
  });

  it("does not mutate c0", () => {
    const original = JSON.parse(JSON.stringify(c0));
    generateNearNeighborPool(c0, [], baseConfig, makeRNG());
    expect(c0).toEqual(original);
  });
});
