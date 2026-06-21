import { describe, it, expect } from "vitest";
import { computePrice, basePrice, applyPriceVariation } from "../../../src/design/price.js";
import { Concept, StudyConfig } from "../../../src/core/types.js";
import { SeededRNG } from "../../../src/core/prng.js";

const configWithSummed: StudyConfig = {
  study: {
    attributes: [
      {
        id: "brand",
        label: "Brand",
        in_byo: true,
        price_type: "none",
        levels: [
          { id: "brand_a", label: "Brand A" },
          { id: "brand_b", label: "Brand B" },
        ],
      },
      {
        id: "price",
        label: "Price",
        in_byo: true,
        price_type: "summed",
        levels: [
          { id: "price_low", label: "$100", price_increment: 100 },
          { id: "price_mid", label: "$200", price_increment: 200 },
          { id: "price_high", label: "$300", price_increment: 300 },
        ],
      },
      {
        id: "color",
        label: "Color",
        in_byo: true,
        price_type: "none",
        levels: [
          { id: "color_red", label: "Red" },
          { id: "color_blue", label: "Blue" },
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
      piecewise_breakpoints: [100, 200, 300],
    },
  },
};

const configWithComponent: StudyConfig = {
  study: {
    attributes: [
      {
        id: "storage",
        label: "Storage",
        in_byo: true,
        price_type: "component",
        levels: [
          { id: "64gb", label: "64GB", price_increment: 50 },
          { id: "128gb", label: "128GB", price_increment: 100 },
        ],
      },
      {
        id: "ram",
        label: "RAM",
        in_byo: true,
        price_type: "component",
        levels: [
          { id: "8gb", label: "8GB", price_increment: 30 },
          { id: "16gb", label: "16GB", price_increment: 60 },
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
      price_rounding: 5,
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

const configNoPrice: StudyConfig = {
  study: {
    attributes: [
      {
        id: "brand",
        label: "Brand",
        in_byo: true,
        price_type: "none",
        levels: [
          { id: "brand_a", label: "Brand A" },
          { id: "brand_b", label: "Brand B" },
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

const concept: Concept = {
  id: "c1",
  levels: { brand: "brand_a", price: "price_mid", color: "color_red" },
  source: "SCREENING",
};

const conceptComponent: Concept = {
  id: "c2",
  levels: { storage: "128gb", ram: "16gb" },
  source: "SCREENING",
};

describe("basePrice", () => {
  it("returns summed price increment for summed price_type", () => {
    expect(basePrice(concept, configWithSummed)).toBe(200);
  });

  it("sums increments across multiple component attributes", () => {
    expect(basePrice(conceptComponent, configWithComponent)).toBe(160);
  });

  it("returns 0 when all attributes are price_type none", () => {
    const noPriceConcept: Concept = {
      id: "c3",
      levels: { brand: "brand_a" },
      source: "SCREENING",
    };
    expect(basePrice(noPriceConcept, configNoPrice)).toBe(0);
  });

  it("does not mutate the concept", () => {
    const original = JSON.parse(JSON.stringify(concept));
    basePrice(concept, configWithSummed);
    expect(concept).toEqual(original);
  });
});

describe("applyPriceVariation", () => {
  it("applies variation within configured range", () => {
    const rng = new SeededRNG("test-seed-1");
    const base = 200;
    const result = applyPriceVariation(base, configWithSummed, rng);
    const min = Math.round(base * (1 - 0.3));
    const max = Math.round(base * (1 + 0.3));
    expect(result).toBeGreaterThanOrEqual(min);
    expect(result).toBeLessThanOrEqual(max);
  });

  it("rounds to configured price_rounding", () => {
    const rng = new SeededRNG("test-seed-2");
    const result = applyPriceVariation(160, configWithComponent, rng);
    expect(result % 5).toBe(0);
  });

  it("produces deterministic results with same seed", () => {
    const rng1 = new SeededRNG("deterministic");
    const rng2 = new SeededRNG("deterministic");
    const r1 = applyPriceVariation(200, configWithSummed, rng1);
    const r2 = applyPriceVariation(200, configWithSummed, rng2);
    expect(r1).toBe(r2);
  });
});

describe("computePrice", () => {
  it("returns undefined when all attributes have price_type none", () => {
    const noPriceConcept: Concept = {
      id: "c3",
      levels: { brand: "brand_a" },
      source: "SCREENING",
    };
    expect(computePrice(noPriceConcept, configNoPrice)).toBeUndefined();
  });

  it("returns base price without rng", () => {
    expect(computePrice(concept, configWithSummed)).toBe(200);
  });

  it("returns varied price with rng", () => {
    const rng = new SeededRNG("variation-test");
    const result = computePrice(concept, configWithSummed, rng);
    expect(result).toBeDefined();
    expect(typeof result).toBe("number");
  });

  it("does not mutate the concept", () => {
    const original = JSON.parse(JSON.stringify(concept));
    const rng = new SeededRNG("mutation-check");
    computePrice(concept, configWithSummed, rng);
    expect(concept).toEqual(original);
  });

  it("handles component price type correctly", () => {
    expect(computePrice(conceptComponent, configWithComponent)).toBe(160);
  });

  it("handles component price with variation", () => {
    const rng = new SeededRNG("component-var");
    const result = computePrice(conceptComponent, configWithComponent, rng);
    expect(result).toBeDefined();
    expect(result).toBeGreaterThanOrEqual(Math.round(160 * 0.7 / 5) * 5);
    expect(result).toBeLessThanOrEqual(Math.round(160 * 1.3 / 5) * 5);
  });
});
