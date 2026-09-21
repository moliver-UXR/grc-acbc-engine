import { describe, it, expect } from "vitest";
import { createInitialState, reduce } from "../../src/core/reducer.js";
import { parseConfig } from "../../src/core/config.js";
import type { EngineState, Concept } from "../../src/core/types.js";

// This config makes every generated concept carry color_green (the only
// color level available, screens_per_concept_batch matches total screens),
// so screening evidence for an "unacceptable: color_green" rule accumulates
// at the same moment screening otherwise completes: the exact collision that
// used to loop the engine forever (reject rule, empty SCREENING, same rule
// re-detected, reject rule, ...).
function buildLoopConfig() {
  return parseConfig({
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
          id: "color",
          label: "Color",
          in_byo: true,
          price_type: "none",
          levels: [{ id: "color_green", label: "Green" }],
        },
      ],
      design: {
        T: 6,
        Amin: 1,
        Amax: 1,
        screens_per_concept_batch: 6,
        total_screening_screens: 1,
        price_variation_pct: 0,
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
      estimation: { method: "mnl", price_function: "linear" },
    },
  });
}

function buildLoopState(config: ReturnType<typeof buildLoopConfig>): EngineState {
  const byoConcept: Concept = { id: "byo-concept", levels: { brand: "brand_a", color: "color_green" }, source: "BYO" };
  const pool: Concept[] = Array.from({ length: 6 }, (_, i) => ({
    id: `concept-${i}`,
    levels: { brand: i % 2 === 0 ? "brand_a" : "brand_b", color: "color_green" },
    source: "SCREENING" as const,
  }));
  // All six concepts screened and rejected: enough exposure (>= minExposure
  // of 3) for color_green to be detected as an unacceptable candidate rule,
  // and total_screening_screens * screens_per_concept_batch (1 * 6 = 6) is
  // already met, so screening is simultaneously "complete".
  const screened = pool.map((c, i) => ({ conceptId: c.id, possible: false, screenIndex: i }));
  return {
    ...createInitialState("s", "r", config, "seed"),
    phase: "CONFIRM_UNACCEPTABLE",
    byoConcept,
    conceptPool: pool,
    screened,
    candidateRule: { kind: "unacceptable", attributeId: "color", levelId: "color_green", confirmedAtScreen: screened.length },
  };
}

describe("reducer - screening loop on a late deal-breaker rejection", () => {
  it("does not return to an empty SCREENING task forever; reaches a terminal-ish phase within 3 transitions", () => {
    const config = buildLoopConfig();
    let state = buildLoopState(config);

    state = reduce(state, { type: "RULE_REJECTED" }, config);

    // With the pool exhausted and screening already complete, rejecting the
    // rule must finalize the survivors (here: zero survivors, since every
    // concept was rejected) rather than bounce back to SCREENING.
    expect(["TOURNAMENT", "CALIBRATION", "DONE"]).toContain(state.phase);
    expect(state.phase).not.toBe("CONFIRM_UNACCEPTABLE");
    expect(state.phase).not.toBe("SCREENING");
  });

  it("never re-detects or re-presents a rejected candidate rule", () => {
    const config = buildLoopConfig();
    let state = buildLoopState(config);

    state = reduce(state, { type: "RULE_REJECTED" }, config);
    expect(state.rejectedRules).toEqual([
      { kind: "unacceptable", attributeId: "color", levelId: "color_green", confirmedAtScreen: 6 },
    ]);

    // Simulate the engine being driven again with no new responses (as the
    // old UI would when it has zero unseen concepts to present). The
    // rejected rule must never resurface as a new candidateRule.
    if (state.phase === "SCREENING") {
      state = reduce(state, { type: "SCREEN_SUBMITTED", responses: [] }, config);
    }
    expect(state.candidateRule).toBeNull();
    expect(state.phase).not.toBe("CONFIRM_UNACCEPTABLE");
  });
});

describe("reducer - normal screening is unaffected", () => {
  it("continues screening when unseen concepts remain and no candidate rule is pending", () => {
    const config = parseConfig({
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
              { id: "brand_c", label: "Brand C" },
            ],
          },
        ],
        design: {
          T: 6,
          Amin: 1,
          Amax: 1,
          screens_per_concept_batch: 3,
          total_screening_screens: 2,
          price_variation_pct: 0,
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
        estimation: { method: "mnl", price_function: "linear" },
      },
    });
    let state = createInitialState("study-1", "resp-1", config, "seed-123");
    state = reduce(state, { type: "BYO_SUBMITTED", answers: { brand: "brand_a" } }, config);
    // Only screen half the batch: unseen concepts remain, no candidate rule
    // (responses are a healthy mix, not a uniform accept/reject streak).
    const responses = state.conceptPool.slice(0, 2).map((c, i) => ({
      conceptId: c.id,
      possible: i % 2 === 0,
      screenIndex: 0,
    }));
    state = reduce(state, { type: "SCREEN_SUBMITTED", responses }, config);
    expect(state.phase).toBe("SCREENING");
    expect(state.candidateRule).toBeNull();
    expect(state.screened).toHaveLength(2);
  });
});
