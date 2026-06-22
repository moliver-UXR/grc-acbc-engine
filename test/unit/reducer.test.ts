import { describe, it, expect } from "vitest";
import { createInitialState, reduce } from "../../src/core/reducer.js";
import { parseConfig } from "../../src/core/config.js";
import type { EngineState } from "../../src/core/types.js";
import sampleStudy from "../fixtures/sample-study.json";

const config = parseConfig(sampleStudy);

describe("createInitialState", () => {
  it("creates state with phase BYO", () => {
    const state = createInitialState("study-1", "resp-1", config, "seed-123");
    expect(state.phase).toBe("BYO");
    expect(state.byoConcept).toBeNull();
    expect(state.conceptPool).toEqual([]);
    expect(state.eventVersion).toBe(1);
  });
});

describe("reduce - BYO phase", () => {
  it("transitions to SCREENING after BYO_SUBMITTED", () => {
    const initial = createInitialState("study-1", "resp-1", config, "seed-123");
    const state = reduce(initial, {
      type: "BYO_SUBMITTED",
      answers: { brand: "brand_a", price: "price_low", color: "color_red" },
    }, config);
    expect(state.phase).toBe("SCREENING");
    expect(state.byoConcept).not.toBeNull();
    expect(state.byoConcept?.levels.brand).toBe("brand_a");
    expect(state.conceptPool.length).toBeGreaterThan(0);
  });
});

describe("reduce - SCREENING phase", () => {
  it("accumulates screening responses", () => {
    let state = createInitialState("study-1", "resp-1", config, "seed-123");
    state = reduce(state, {
      type: "BYO_SUBMITTED",
      answers: { brand: "brand_a", price: "price_low", color: "color_red" },
    }, config);
    const conceptId = state.conceptPool[0].id;
    state = reduce(state, {
      type: "SCREEN_SUBMITTED",
      responses: [{ conceptId, possible: true, screenIndex: 0 }],
    }, config);
    expect(state.screened).toHaveLength(1);
    expect(state.screened[0].possible).toBe(true);
  });

  it("transitions to TOURNAMENT when screening complete", () => {
    let state = createInitialState("study-1", "resp-1", config, "seed-123");
    state = reduce(state, {
      type: "BYO_SUBMITTED",
      answers: { brand: "brand_a", price: "price_low", color: "color_red" },
    }, config);
    const responses = state.conceptPool.slice(0, 6).map((c, i) => ({
      conceptId: c.id, possible: i % 2 === 0, screenIndex: Math.floor(i / 3),
    }));
    state = reduce(state, { type: "SCREEN_SUBMITTED", responses }, config);
    expect(state.phase).toBe("TOURNAMENT");
    expect(state.survivingConceptIds.length).toBeGreaterThan(0);
    expect(state.tournamentRounds.length).toBeGreaterThan(0);
  });
});

describe("reduce - CONFIRM phases", () => {
  it("RULE_CONFIRMED adds rule and transitions to REGENERATE", () => {
    const state: EngineState = {
      ...createInitialState("s", "r", config, "seed"),
      phase: "CONFIRM_MUST_HAVE",
      candidateRule: { kind: "mustHave", attributeId: "brand", levelId: "brand_a", confirmedAtScreen: 1 },
    };
    const next = reduce(state, { type: "RULE_CONFIRMED" }, config);
    expect(next.phase).toBe("REGENERATE");
    expect(next.confirmedRules).toHaveLength(1);
    expect(next.candidateRule).toBeNull();
  });

  it("RULE_REJECTED returns to SCREENING", () => {
    const state: EngineState = {
      ...createInitialState("s", "r", config, "seed"),
      phase: "CONFIRM_UNACCEPTABLE",
      candidateRule: { kind: "unacceptable", attributeId: "color", levelId: "color_green", confirmedAtScreen: 1 },
    };
    const next = reduce(state, { type: "RULE_REJECTED" }, config);
    expect(next.phase).toBe("SCREENING");
    expect(next.candidateRule).toBeNull();
  });
});

describe("reduce - TOURNAMENT phase", () => {
  it("records tournament choices", () => {
    let state = createInitialState("study-1", "resp-1", config, "seed-123");
    state = reduce(state, {
      type: "BYO_SUBMITTED",
      answers: { brand: "brand_a", price: "price_low", color: "color_red" },
    }, config);
    const responses = state.conceptPool.slice(0, 6).map((c, i) => ({
      conceptId: c.id, possible: i % 2 === 0, screenIndex: Math.floor(i / 3),
    }));
    state = reduce(state, { type: "SCREEN_SUBMITTED", responses }, config);
    expect(state.phase).toBe("TOURNAMENT");
    expect(state.tournamentRounds.length).toBeGreaterThan(0);
    const firstTask = state.tournamentRounds[0].tasks[0];
    const winnerId = firstTask.concepts[0].id;
    state = reduce(state, {
      type: "TOURNAMENT_TASK_SUBMITTED",
      matchupId: "task-0",
      chosenConceptId: winnerId,
    }, config);
    expect(state.tournamentRounds[0].tasks[0].winnerConceptId).toBe(winnerId);
  });

  it("resolves tie (null chosenConceptId) by coin flip to one of the 3 concepts", () => {
    let state = createInitialState("study-1", "resp-1", config, "seed-123");
    state = reduce(state, {
      type: "BYO_SUBMITTED",
      answers: { brand: "brand_a", price: "price_low", color: "color_red" },
    }, config);
    const responses = state.conceptPool.slice(0, 6).map((c, i) => ({
      conceptId: c.id, possible: i % 2 === 0, screenIndex: Math.floor(i / 3),
    }));
    state = reduce(state, { type: "SCREEN_SUBMITTED", responses }, config);
    expect(state.phase).toBe("TOURNAMENT");
    const firstTask = state.tournamentRounds[0].tasks[0];
    const validIds = firstTask.concepts.map(c => c.id);
    state = reduce(state, {
      type: "TOURNAMENT_TASK_SUBMITTED",
      matchupId: "task-0",
      chosenConceptId: null,
    }, config);
    const winner = state.tournamentRounds[0].tasks[0].winnerConceptId;
    expect(winner).not.toBeNull();
    expect(validIds).toContain(winner);
  });

  it("coin flip tie resolution is deterministic for the same seed", () => {
    const setupTournament = (seed: string): EngineState => {
      let s = createInitialState("study-1", "resp-1", config, seed);
      s = reduce(s, {
        type: "BYO_SUBMITTED",
        answers: { brand: "brand_a", price: "price_low", color: "color_red" },
      }, config);
      const responses = s.conceptPool.slice(0, 6).map((c, i) => ({
        conceptId: c.id, possible: i % 2 === 0, screenIndex: Math.floor(i / 3),
      }));
      s = reduce(s, { type: "SCREEN_SUBMITTED", responses }, config);
      return s;
    };
    const state1 = setupTournament("seed-123");
    const state2 = setupTournament("seed-123");
    const winner1 = reduce(state1, {
      type: "TOURNAMENT_TASK_SUBMITTED",
      matchupId: "task-0",
      chosenConceptId: null,
    }, config).tournamentRounds[0].tasks[0].winnerConceptId;
    const winner2 = reduce(state2, {
      type: "TOURNAMENT_TASK_SUBMITTED",
      matchupId: "task-0",
      chosenConceptId: null,
    }, config).tournamentRounds[0].tasks[0].winnerConceptId;
    expect(winner1).toBe(winner2);
  });
});

describe("reduce - CALIBRATION phase", () => {
  it("transitions to DONE after calibration", () => {
    const state: EngineState = {
      ...createInitialState("s", "r", config, "seed"),
      phase: "CALIBRATION",
    };
    const next = reduce(state, {
      type: "CALIBRATION_SUBMITTED",
      answer: { conceptId: "c1", purchaseIntent: 4 },
    }, config);
    expect(next.phase).toBe("DONE");
    expect(next.calibration?.purchaseIntent).toBe(4);
  });
});

describe("reduce - DONE phase", () => {
  it("returns state unchanged", () => {
    const state: EngineState = {
      ...createInitialState("s", "r", config, "seed"),
      phase: "DONE",
    };
    const next = reduce(state, { type: "RULE_CONFIRMED" }, config);
    expect(next).toEqual(state);
  });
});
