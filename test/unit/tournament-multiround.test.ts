import { describe, it, expect } from "vitest";
import { createInitialState, reduce } from "../../src/core/reducer.js";
import { serializeStateToQualtricsTask } from "../../src/integration/qualtrics-adapter.js";
import { grcConfig } from "../../src/configs/grc.js";
import { parseConfig } from "../../src/core/config.js";
import type { EngineState } from "../../src/core/types.js";

const config = parseConfig(grcConfig);

// Drive BYO + screening (accept every concept) until the engine leaves SCREENING.
// Accepting everything maximises survivors so the tournament spans multiple rounds,
// and it never triggers a cutoff rule (a must-have needs a single accepted level).
function driveToTournament(seed: string): EngineState {
  let state = createInitialState("grc", "r", config, seed);
  const byo: Record<string, string> = {};
  for (const a of config.study.attributes) {
    if (a.in_byo) byo[a.id] = a.levels[0].id;
  }
  state = reduce(state, { type: "BYO_SUBMITTED", answers: byo }, config);

  let guard = 0;
  while (state.phase === "SCREENING" && guard++ < 50) {
    const seen = new Set(state.screened.map((s) => s.conceptId));
    const batch = state.conceptPool
      .filter((c) => !seen.has(c.id))
      .slice(0, config.study.design.screens_per_concept_batch);
    if (batch.length === 0) break;
    const responses = batch.map((c, i) => ({
      conceptId: c.id,
      possible: true,
      screenIndex: state.screened.length + i,
    }));
    state = reduce(state, { type: "SCREEN_SUBMITTED", responses }, config);
    if (state.phase === "CONFIRM_MUST_HAVE" || state.phase === "CONFIRM_UNACCEPTABLE") {
      state = reduce(state, { type: "RULE_REJECTED" }, config);
    }
  }
  return state;
}

describe("screening with no survivors", () => {
  // A respondent who rejects every concept leaves zero survivors. buildTournament
  // then yields an empty bracket, and serializing a TOURNAMENT phase with no rounds
  // throws (which, unhandled, crashes the server). The engine should end cleanly.
  it("ends at DONE instead of an empty tournament that fails to serialize", () => {
    let state = createInitialState("grc", "r", config, "seed-noneleft");
    const byo: Record<string, string> = {};
    for (const a of config.study.attributes) {
      if (a.in_byo) byo[a.id] = a.levels[0].id;
    }
    state = reduce(state, { type: "BYO_SUBMITTED", answers: byo }, config);

    let guard = 0;
    while (state.phase !== "DONE" && guard++ < 60) {
      if (state.phase === "SCREENING") {
        const seen = new Set(state.screened.map((s) => s.conceptId));
        const batch = state.conceptPool
          .filter((c) => !seen.has(c.id))
          .slice(0, config.study.design.screens_per_concept_batch);
        if (batch.length === 0) break;
        const responses = batch.map((c, i) => ({
          conceptId: c.id,
          possible: false,
          screenIndex: state.screened.length + i,
        }));
        state = reduce(state, { type: "SCREEN_SUBMITTED", responses }, config);
      } else if (state.phase === "CONFIRM_MUST_HAVE" || state.phase === "CONFIRM_UNACCEPTABLE") {
        // Confirm the detected dealbreaker (the real path that reaches zero
        // survivors), then step past the transient REGENERATE phase.
        state = reduce(state, { type: "RULE_CONFIRMED" }, config);
        while (state.phase === "REGENERATE") {
          state = reduce(state, { type: "RULE_CONFIRMED" }, config);
        }
      } else {
        break;
      }
    }

    expect(state.phase).toBe("DONE");
    expect(state.survivingConceptIds).toHaveLength(0);
    // Serializing the terminal state must not throw.
    const task = serializeStateToQualtricsTask(state, config);
    expect(task.done).toBe(true);
  });
});

describe("tournament multi-round concept integrity", () => {
  it("builds a bracket with more than one round when survivors are plentiful", () => {
    const state = driveToTournament("seed-multiround");
    expect(state.phase).toBe("TOURNAMENT");
    expect(state.tournamentRounds.length).toBeGreaterThan(1);
  });

  it("every rendered concept in every tournament round carries real attribute levels", () => {
    let state = driveToTournament("seed-multiround");
    expect(state.phase).toBe("TOURNAMENT");

    let guard = 0;
    while (state.phase === "TOURNAMENT" && guard++ < 100) {
      const task = serializeStateToQualtricsTask(state, config);
      expect(task.taskType).toBe("tournament");
      for (const concept of task.concepts ?? []) {
        const rendered = concept.attributes.map((a) => a.level);
        // A placeholder concept serialises every attribute to the em-dash fallback.
        expect(
          rendered.every((lvl) => lvl !== "—" && lvl !== ""),
          `round has an empty placeholder concept ${concept.id}: ${JSON.stringify(rendered)}`
        ).toBe(true);
      }
      // Pick the first concept of the current matchup and advance.
      const round = state.tournamentRounds[state.currentTournamentRound];
      const activeTask = round.tasks[state.currentTournamentTask];
      state = reduce(
        state,
        {
          type: "TOURNAMENT_TASK_SUBMITTED",
          matchupId: activeTask.concepts.map((c) => c.id).join(","),
          chosenConceptId: activeTask.concepts[0].id,
        },
        config
      );
    }
  });

  it("calibration shows the real tournament champion, not an empty placeholder", () => {
    let state = driveToTournament("seed-multiround");
    let guard = 0;
    while (state.phase === "TOURNAMENT" && guard++ < 100) {
      const round = state.tournamentRounds[state.currentTournamentRound];
      const activeTask = round.tasks[state.currentTournamentTask];
      state = reduce(
        state,
        {
          type: "TOURNAMENT_TASK_SUBMITTED",
          matchupId: activeTask.concepts.map((c) => c.id).join(","),
          chosenConceptId: activeTask.concepts[0].id,
        },
        config
      );
    }
    expect(state.phase).toBe("CALIBRATION");
    const task = serializeStateToQualtricsTask(state, config);
    expect(task.winnerConcept, "calibration winner concept is missing").toBeDefined();
    const levels = (task.winnerConcept?.attributes ?? []).map((a) => a.level);
    expect(levels.length).toBeGreaterThan(0);
    expect(levels.every((lvl) => lvl !== "—" && lvl !== "")).toBe(true);
  });
});
