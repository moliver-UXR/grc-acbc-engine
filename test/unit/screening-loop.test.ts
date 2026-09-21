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

// F5: the pool can run out of unseen concepts before screened.length reaches
// the completion target (total_screening_screens * screens_per_concept_batch).
// With no candidate rule pending, the normal SCREENING path used to return
// `{ ...state, screened }` unconditionally, stranding the respondent on an
// empty SCREENING task forever. This mirrors the RULE_REJECTED (:257) and
// REGENERATE (:273) guards, but for the fourth site at :234.
function buildExhaustionConfig() {
  return parseConfig({
    study: {
      attributes: [
        {
          id: "brand",
          label: "Brand",
          in_byo: true,
          price_type: "none",
          // 16 distinct levels, one per pool concept, so every level's
          // exposure stays at 1 (below detectCandidateRule's minExposure of
          // 3) no matter how responses are mixed: no candidate rule can ever
          // fire, isolating this test to the pool-exhaustion guard alone.
          levels: Array.from({ length: 16 }, (_, i) => ({ id: `brand_${i}`, label: `Brand ${i}` })),
        },
      ],
      design: {
        T: 6,
        Amin: 1,
        Amax: 1,
        screens_per_concept_batch: 6,
        total_screening_screens: 3, // completion target = 18, above the 16-concept pool
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

function buildExhaustionState(config: ReturnType<typeof buildExhaustionConfig>): EngineState {
  const byoConcept: Concept = { id: "byo-concept", levels: { brand: "brand_0" }, source: "BYO" };
  const pool: Concept[] = Array.from({ length: 16 }, (_, i) => ({
    id: `concept-${i}`,
    levels: { brand: `brand_${i}` },
    source: "SCREENING" as const,
  }));
  // Screen the first 12 of 16 concepts, mixing accept/reject. 12 is below the
  // 18-screen completion target and below the pool size, so this is a normal,
  // unremarkable mid-screening state.
  const screened = pool.slice(0, 12).map((c, i) => ({ conceptId: c.id, possible: i % 2 === 0, screenIndex: i }));
  return {
    ...createInitialState("s", "r", config, "seed"),
    phase: "SCREENING",
    byoConcept,
    conceptPool: pool,
    screened,
  };
}

describe("reducer - SCREENING must not dead-end on an exhausted pool", () => {
  it("finalizes forward when the last unseen concept is screened before the completion target", () => {
    const config = buildExhaustionConfig();
    let state = buildExhaustionState(config);

    // Screen the remaining 4 concepts (12..15): screened.length becomes 16,
    // still below the 18-screen completion target, but the pool now has no
    // unseen concept left.
    const responses = state.conceptPool.slice(12).map((c, i) => ({
      conceptId: c.id,
      possible: i % 2 === 0,
      screenIndex: 12 + i,
    }));
    state = reduce(state, { type: "SCREEN_SUBMITTED", responses }, config);

    expect(state.screened).toHaveLength(16);
    expect(state.candidateRule).toBeNull();
    // Must not be stranded back in SCREENING with nothing left to present.
    expect(["TOURNAMENT", "CALIBRATION", "DONE"]).toContain(state.phase);
    expect(state.phase).not.toBe("SCREENING");
  });

  it("does not finalize while unseen concepts remain (regression guard)", () => {
    const config = buildExhaustionConfig();
    let state = buildExhaustionState(config);

    // Screen only 2 of the remaining 4: unseen concepts (2 of them) still
    // remain in the pool, so screening must continue normally.
    const responses = state.conceptPool.slice(12, 14).map((c, i) => ({
      conceptId: c.id,
      possible: i % 2 === 0,
      screenIndex: 12 + i,
    }));
    state = reduce(state, { type: "SCREEN_SUBMITTED", responses }, config);

    expect(state.phase).toBe("SCREENING");
    expect(state.screened).toHaveLength(14);
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
