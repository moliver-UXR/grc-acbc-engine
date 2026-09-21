import { describe, it, expect } from "vitest";
import {
  chunkIntoTournamentGroups,
  buildTournament,
  createInitialState,
  reduce,
} from "../../src/core/reducer.js";
import { serializeStateToQualtricsTask } from "../../src/integration/qualtrics-adapter.js";
import { parseConfig } from "../../src/core/config.js";
import type { Concept, EngineState, StudyConfig, TournamentRound } from "../../src/core/types.js";

// A minimal config whose single attribute has one distinct level per pool
// concept. With a per-level exposure of 1 (below detectCandidateRule's
// minExposure of 3), no must-have or unacceptable rule can ever fire, so a
// SCREEN_SUBMITTED event always runs straight to the screening-complete
// branch regardless of the accept/reject pattern chosen for the test.
function makeSoleSurvivorConfig(calibration: boolean): StudyConfig {
  return parseConfig({
    study: {
      attributes: [
        {
          id: "attr",
          label: "Attr",
          in_byo: true,
          price_type: "none",
          levels: Array.from({ length: 6 }, (_, i) => ({ id: `l${i}`, label: `L${i}` })),
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
        calibration,
      },
      estimation: { method: "mnl", price_function: "linear" },
    },
  });
}

function makePool(): Concept[] {
  return Array.from({ length: 6 }, (_, i) => ({
    id: `concept-${i}`,
    levels: { attr: `l${i}` },
    source: "SCREENING" as const,
  }));
}

describe("chunkIntoTournamentGroups", () => {
  it("returns no groups for zero items", () => {
    expect(chunkIntoTournamentGroups([])).toEqual([]);
  });

  it("returns a single group when 3 or fewer items", () => {
    expect(chunkIntoTournamentGroups([1, 2])).toEqual([[1, 2]]);
    expect(chunkIntoTournamentGroups([1, 2, 3])).toEqual([[1, 2, 3]]);
  });

  it("never produces a group smaller than 2", () => {
    for (const n of [4, 5, 6, 7, 9, 10]) {
      const items = Array.from({ length: n }, (_, i) => i);
      const groups = chunkIntoTournamentGroups(items);
      for (const group of groups) {
        expect(group.length, `n=${n} produced a group of size ${group.length}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("matches the exact required partitions", () => {
    const sizesOf = (n: number) =>
      chunkIntoTournamentGroups(Array.from({ length: n }, (_, i) => i)).map((g) => g.length);
    expect(sizesOf(4)).toEqual([2, 2]);
    expect(sizesOf(5)).toEqual([3, 2]);
    expect(sizesOf(6)).toEqual([3, 3]);
    expect(sizesOf(7)).toEqual([3, 2, 2]);
    expect(sizesOf(9)).toEqual([3, 3, 3]);
    expect(sizesOf(10)).toEqual([3, 3, 2, 2]);
  });
});

describe("buildTournament with odd survivor counts", () => {
  it("never produces a task with fewer than 2 or more than 3 concepts, across all rounds", () => {
    for (const n of [4, 5, 7]) {
      const pool: Concept[] = Array.from({ length: n }, (_, i) => ({
        id: `c${i}`,
        levels: { attr: `l${i}` },
        source: "SCREENING" as const,
      }));
      const rounds = buildTournament(
        pool.map((c) => c.id),
        pool,
        `seed-${n}`
      );
      for (const round of rounds) {
        for (const task of round.tasks) {
          expect(
            task.concepts.length,
            `n=${n} round=${round.round} produced a task with ${task.concepts.length} concepts`
          ).toBeGreaterThanOrEqual(2);
          expect(task.concepts.length).toBeLessThanOrEqual(3);
        }
      }
    }
  });
});

describe("reducer - sole survivor after screening", () => {
  it("transitions to CALIBRATION (not TOURNAMENT) with the survivor as champion when calibration is enabled", () => {
    const config = makeSoleSurvivorConfig(true);
    const pool = makePool();
    let state: EngineState = { ...createInitialState("s", "r", config, "seed"), phase: "SCREENING", conceptPool: pool };
    const responses = pool.map((c, i) => ({ conceptId: c.id, possible: i === 0, screenIndex: i }));
    state = reduce(state, { type: "SCREEN_SUBMITTED", responses }, config);

    expect(state.phase).toBe("CALIBRATION");
    expect(state.survivingConceptIds).toEqual([pool[0].id]);
    expect(state.tournamentRounds).toEqual([]);

    const task = serializeStateToQualtricsTask(state, config);
    expect(task.taskType).toBe("calibration");
    expect(task.winnerConcept?.id).toBe(pool[0].id);
  });

  it("transitions to DONE when calibration is disabled, with no tournament ever built", () => {
    const config = makeSoleSurvivorConfig(false);
    const pool = makePool();
    let state: EngineState = { ...createInitialState("s", "r", config, "seed"), phase: "SCREENING", conceptPool: pool };
    const responses = pool.map((c, i) => ({ conceptId: c.id, possible: i === 0, screenIndex: i }));
    state = reduce(state, { type: "SCREEN_SUBMITTED", responses }, config);

    expect(state.phase).toBe("DONE");
    expect(state.survivingConceptIds).toEqual([pool[0].id]);
    expect(state.tournamentRounds).toEqual([]);
  });

  it("never creates a tournament task with fewer than 2 concepts across any recorded round", () => {
    const config = makeSoleSurvivorConfig(true);
    const pool = makePool();
    let state: EngineState = { ...createInitialState("s", "r", config, "seed"), phase: "SCREENING", conceptPool: pool };
    const responses = pool.map((c, i) => ({ conceptId: c.id, possible: i === 0, screenIndex: i }));
    state = reduce(state, { type: "SCREEN_SUBMITTED", responses }, config);

    for (const round of state.tournamentRounds) {
      for (const task of round.tasks) {
        expect(task.concepts.length).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

// A confirmed dealbreaker sends the engine to REGENERATE, which filters the
// pool down to the concepts that do not carry the invalidated level and
// tries to replace the ones removed. This config gives the replacement
// generator nowhere to go: the only attribute has 2 levels, Amin=Amax=1
// forces every candidate to vary that single attribute, and once the
// dealbreaker level is excluded, the only allowed level is the one the
// surviving concept already carries, so every generated candidate is a
// duplicate of it. Regeneration therefore exhausts down to exactly the one
// concept the respondent accepted, with no unseen concept left to present,
// which is the REGENERATE-exhausted branch (reducer.ts, the branch guarding
// TOURNAMENT entry after "if (!hasUnseen)").
describe("buildTournament with a survivor id absent from the pool", () => {
  it("drops the unresolved id instead of throwing, building tasks only from real concepts", () => {
    const pool: Concept[] = [
      { id: "a", levels: { attr: "l0" }, source: "SCREENING" },
      { id: "b", levels: { attr: "l1" }, source: "SCREENING" },
    ];

    let rounds: TournamentRound[] = [];
    expect(() => {
      rounds = buildTournament(["a", "b", "ghost"], pool, "seed");
    }).not.toThrow();

    const allConceptIds = rounds.flatMap((r) => r.tasks.flatMap((t) => t.concepts.map((c) => c.id)));
    expect(allConceptIds.every((id) => id === "a" || id === "b" || /^winner-r\d+-\d+$/.test(id))).toBe(true);
    expect(allConceptIds).not.toContain("ghost");
  });
});

describe("reducer - finalizeScreening resolves survivors against the pool before branching", () => {
  it("routes to the champion phase (not a sub-2 tournament) when one of two accepted survivors is absent from the pool", () => {
    const config = makeSoleSurvivorConfig(true);
    // Pool only contains concept-0; concept-1 was accepted during screening
    // but then dropped from the pool (e.g. by a later regeneration), so only
    // one of the two "accepted" survivor ids actually resolves.
    const pool: Concept[] = [{ id: "concept-0", levels: { attr: "l0" }, source: "SCREENING" }];
    const screened = [
      { conceptId: "concept-0", possible: true, screenIndex: 0 },
      { conceptId: "concept-1", possible: true, screenIndex: 1 },
    ];
    let state: EngineState = {
      ...createInitialState("s", "r", config, "seed"),
      phase: "SCREENING",
      conceptPool: pool,
      screened,
    };

    state = reduce(state, { type: "SCREEN_SUBMITTED", responses: [] }, config);

    expect(state.phase).toBe("CALIBRATION");
    expect(state.survivingConceptIds).toEqual(["concept-0"]);
    expect(state.tournamentRounds).toEqual([]);
  });
});

describe("reducer - REGENERATE exhausted down to a sole survivor via a confirmed dealbreaker", () => {
  function buildDealbreakerConfig(calibration: boolean): StudyConfig {
    return parseConfig({
      study: {
        attributes: [
          {
            id: "attr",
            label: "Attr",
            in_byo: true,
            price_type: "none",
            levels: [
              { id: "l0", label: "L0" },
              { id: "l1", label: "L1" },
            ],
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
          calibration,
        },
        estimation: { method: "mnl", price_function: "linear" },
      },
    });
  }

  function buildConfirmState(config: StudyConfig): EngineState {
    const byoConcept: Concept = { id: "byo-concept", levels: { attr: "l0" }, source: "BYO" };
    // The survivor carries the level the dealbreaker will not touch; the
    // other five carry the level about to be confirmed unacceptable.
    const survivor: Concept = { id: "concept-survivor", levels: { attr: "l0" }, source: "SCREENING" };
    const rejected: Concept[] = Array.from({ length: 5 }, (_, i) => ({
      id: `concept-rejected-${i}`,
      levels: { attr: "l1" },
      source: "SCREENING" as const,
    }));
    const conceptPool = [survivor, ...rejected];
    const screened = conceptPool.map((c, i) => ({
      conceptId: c.id,
      possible: c.id === survivor.id,
      screenIndex: i,
    }));
    return {
      ...createInitialState("s", "r", config, "seed"),
      phase: "CONFIRM_UNACCEPTABLE",
      byoConcept,
      conceptPool,
      screened,
      candidateRule: { kind: "unacceptable", attributeId: "attr", levelId: "l1", confirmedAtScreen: screened.length },
    };
  }

  it("transitions to CALIBRATION with the sole survivor as champion, never a sub-2 tournament task, when calibration is enabled", () => {
    const config = buildDealbreakerConfig(true);
    let state = buildConfirmState(config);

    // Confirm the dealbreaker: this only records the rule and moves the
    // phase to REGENERATE, it does not run the regenerate logic itself.
    state = reduce(state, { type: "RULE_CONFIRMED" }, config);
    expect(state.phase).toBe("REGENERATE");
    expect(state.confirmedRules).toEqual([
      { kind: "unacceptable", attributeId: "attr", levelId: "l1", confirmedAtScreen: 6 },
    ]);

    // The REGENERATE case does not branch on event type, so any event
    // drives the actual pool-regeneration and exhaustion check.
    state = reduce(state, { type: "RULE_CONFIRMED" }, config);

    expect(state.phase).toBe("CALIBRATION");
    expect(state.survivingConceptIds).toEqual(["concept-survivor"]);
    expect(state.tournamentRounds).toEqual([]);
    for (const round of state.tournamentRounds) {
      for (const task of round.tasks) {
        expect(task.concepts.length).toBeGreaterThanOrEqual(2);
      }
    }

    const task = serializeStateToQualtricsTask(state, config);
    expect(task.taskType).toBe("calibration");
    expect(task.winnerConcept?.id).toBe("concept-survivor");
  });

  it("transitions to DONE with no tournament when calibration is disabled", () => {
    const config = buildDealbreakerConfig(false);
    let state = buildConfirmState(config);

    state = reduce(state, { type: "RULE_CONFIRMED" }, config);
    expect(state.phase).toBe("REGENERATE");

    state = reduce(state, { type: "RULE_CONFIRMED" }, config);

    expect(state.phase).toBe("DONE");
    expect(state.survivingConceptIds).toEqual(["concept-survivor"]);
    expect(state.tournamentRounds).toEqual([]);
  });
});
