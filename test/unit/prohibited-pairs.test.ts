import { describe, it, expect } from "vitest";
import { parseConfig } from "../../src/core/config.js";
import {
  violatesProhibitedPair,
  generateNearNeighborPool,
} from "../../src/design/generator.js";
import { SeededRNG } from "../../src/core/prng.js";
import type { Concept } from "../../src/core/types.js";

const synthConfig = {
  study: {
    attributes: [
      {
        id: "deployment",
        label: "Deployment",
        in_byo: true,
        price_type: "none" as const,
        levels: [
          { id: "shared_saas", label: "Shared SaaS" },
          { id: "on_prem", label: "On-prem" },
        ],
      },
      {
        id: "data_residency",
        label: "Data Residency",
        in_byo: true,
        price_type: "none" as const,
        levels: [
          { id: "major_region", label: "Major region" },
          { id: "sovereign", label: "Sovereign" },
        ],
      },
    ],
    design: {
      T: 4,
      Amin: 2,
      Amax: 2,
      screens_per_concept_batch: 2,
      total_screening_screens: 2,
      price_variation_pct: 0,
      price_rounding: 1,
      prohibited_pairs: [
        [
          { attributeId: "deployment", levelId: "on_prem" },
          { attributeId: "data_residency", levelId: "major_region" },
        ],
      ],
    },
    phases: {
      byo: true, screening: true, must_have: true,
      unacceptable: true, tournament: true, calibration: true,
    },
    estimation: { method: "mnl" as const, price_function: "linear" as const },
  },
} as const;

describe("prohibited pairs mechanism", () => {
  const config = parseConfig(synthConfig);

  it("parses a config with prohibited_pairs declared", () => {
    expect(config.study.design.prohibited_pairs).toBeDefined();
    expect(config.study.design.prohibited_pairs!.length).toBe(1);
  });

  it("flags a concept that pairs on-prem with a cloud region", () => {
    const bad: Concept = {
      id: "x",
      levels: { deployment: "on_prem", data_residency: "major_region" },
      source: "SCREENING",
    };
    expect(violatesProhibitedPair(bad, config)).toBe(true);
  });

  it("allows on-prem with a sovereign instance", () => {
    const ok: Concept = {
      id: "x",
      levels: { deployment: "on_prem", data_residency: "sovereign" },
      source: "SCREENING",
    };
    expect(violatesProhibitedPair(ok, config)).toBe(false);
  });

  it("never emits a prohibited pair in a generated pool", () => {
    const c0: Concept = {
      id: "c0",
      levels: Object.fromEntries(
        config.study.attributes.map((a) => [a.id, a.levels[0].id]),
      ),
      source: "BYO",
    };
    const pool = generateNearNeighborPool(c0, [], config, new SeededRNG("42"));
    for (const concept of pool) {
      expect(violatesProhibitedPair(concept, config)).toBe(false);
    }
  });
});
