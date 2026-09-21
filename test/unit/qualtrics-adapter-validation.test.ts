import { describe, it, expect, beforeEach } from "vitest";
import { ACBCEngine, MemoryStorage } from "../../src/index.js";
import type { EngineState } from "../../src/core/types.js";
import { grcConfig } from "../../src/configs/grc.js";
import {
  serializeStateToQualtricsTask,
  buildEngineEventFromChoice,
} from "../../src/integration/qualtrics-adapter.js";

/**
 * F18: buildEngineEventFromChoice must validate untrusted respondent input
 * (arbitrary client JSON) rather than fabricating defaults or silently
 * coercing malformed values. Every malformed/missing/wrong-type case below
 * must throw, never return a fabricated EngineEvent.
 */

function advanceToScreening(engine: ACBCEngine): void {
  const byoTask = serializeStateToQualtricsTask(engine.getState(), engine.getConfig());
  const byoChoices: Record<string, string> = {};
  for (const attr of byoTask.attributes!) {
    byoChoices[attr.id] = attr.levels[0].id;
  }
  engine.submitEvent({ type: "BYO_SUBMITTED", answers: byoChoices });
}

function makeEngine(runId: string, seed: string): ACBCEngine {
  const engine = new ACBCEngine("grc-test", runId, grcConfig, seed, new MemoryStorage());
  engine.start();
  return engine;
}

// Fabricates a CALIBRATION-phase state directly so we can unit-test the
// CALIBRATION branch without driving a whole respondent journey through
// screening/tournament (which is exercised elsewhere and is slow/flaky to
// steer deterministically toward CALIBRATION for every seed).
function calibrationState(conceptId: string): EngineState {
  const engine = makeEngine("grc-test", "seed-calibration-fixture");
  const state = engine.getState();
  return {
    ...state,
    phase: "CALIBRATION",
    survivingConceptIds: [conceptId],
    tournamentRounds: [],
    currentTournamentRound: 0,
    currentTournamentTask: 0,
  } as EngineState;
}

describe("buildEngineEventFromChoice — F18 input validation", () => {
  describe("CALIBRATION", () => {
    it("throws when purchase_intent is missing (does not fabricate intent 3)", () => {
      const state = calibrationState("concept-a");
      expect(() => buildEngineEventFromChoice(state, "calibration-0", {})).toThrow();
    });

    it("throws when purchase_intent is non-numeric", () => {
      const state = calibrationState("concept-a");
      expect(() =>
        buildEngineEventFromChoice(state, "calibration-0", { purchase_intent: "not-a-number" })
      ).toThrow();
    });

    it("throws when purchase_intent is out of range (0)", () => {
      const state = calibrationState("concept-a");
      expect(() =>
        buildEngineEventFromChoice(state, "calibration-0", { purchase_intent: "0" })
      ).toThrow();
    });

    it("throws when purchase_intent is out of range (6)", () => {
      const state = calibrationState("concept-a");
      expect(() =>
        buildEngineEventFromChoice(state, "calibration-0", { purchase_intent: "6" })
      ).toThrow();
    });

    it("throws when purchase_intent is a non-integer number", () => {
      const state = calibrationState("concept-a");
      expect(() =>
        buildEngineEventFromChoice(state, "calibration-0", { purchase_intent: "3.5" })
      ).toThrow();
    });

    it("accepts a valid purchase_intent (1-5) and returns the correct event unchanged", () => {
      const state = calibrationState("concept-a");
      const event = buildEngineEventFromChoice(state, "calibration-0", { purchase_intent: "4" });
      expect(event).toEqual({
        type: "CALIBRATION_SUBMITTED",
        answer: { conceptId: "concept-a", purchaseIntent: 4 },
      });
    });

    it("throws when purchase_intent is a boolean (Number(true) === 1 must not pass)", () => {
      const state = calibrationState("concept-a");
      expect(() =>
        buildEngineEventFromChoice(
          state,
          "calibration-0",
          { purchase_intent: true } as unknown as Record<string, string>
        )
      ).toThrow();
    });

    it("throws when purchase_intent is an array (Number([\"3\"]) === 3 must not pass)", () => {
      const state = calibrationState("concept-a");
      expect(() =>
        buildEngineEventFromChoice(
          state,
          "calibration-0",
          { purchase_intent: ["3"] } as unknown as Record<string, string>
        )
      ).toThrow();
    });

    it("throws when purchase_intent is a bare number, not a string (client always sends a string)", () => {
      const state = calibrationState("concept-a");
      expect(() =>
        buildEngineEventFromChoice(
          state,
          "calibration-0",
          { purchase_intent: 3 } as unknown as Record<string, string>
        )
      ).toThrow();
    });
  });

  describe("CONFIRM_MUST_HAVE / CONFIRM_UNACCEPTABLE", () => {
    function confirmState(phase: "CONFIRM_MUST_HAVE" | "CONFIRM_UNACCEPTABLE"): EngineState {
      const engine = makeEngine("grc-test", "seed-confirm-fixture");
      return { ...engine.getState(), phase } as EngineState;
    }

    it("throws when confirm_decision is missing (does not silently reject)", () => {
      const state = confirmState("CONFIRM_MUST_HAVE");
      expect(() => buildEngineEventFromChoice(state, "confirm-mustHave-x", {})).toThrow();
    });

    it("throws when confirm_decision is an unrecognized string", () => {
      const state = confirmState("CONFIRM_MUST_HAVE");
      expect(() =>
        buildEngineEventFromChoice(state, "confirm-mustHave-x", { confirm_decision: "maybe" })
      ).toThrow();
    });

    it("accepts 'confirm' and returns RULE_CONFIRMED unchanged", () => {
      const state = confirmState("CONFIRM_MUST_HAVE");
      const event = buildEngineEventFromChoice(state, "confirm-mustHave-x", {
        confirm_decision: "confirm",
      });
      expect(event).toEqual({ type: "RULE_CONFIRMED" });
    });

    it("accepts 'reject' and returns RULE_REJECTED unchanged", () => {
      const state = confirmState("CONFIRM_UNACCEPTABLE");
      const event = buildEngineEventFromChoice(state, "confirm-unacceptable-x", {
        confirm_decision: "reject",
      });
      expect(event).toEqual({ type: "RULE_REJECTED" });
    });
  });

  describe("SCREENING", () => {
    let engine: ACBCEngine;

    beforeEach(() => {
      engine = makeEngine("grc-test", "seed-screening-fixture");
      advanceToScreening(engine);
    });

    it("throws when choice is not an object (array)", () => {
      const state = engine.getState();
      expect(() =>
        buildEngineEventFromChoice(state, "screen-0", ["possible"] as unknown as Record<string, string>)
      ).toThrow();
    });

    it("throws when choice is null", () => {
      const state = engine.getState();
      expect(() =>
        buildEngineEventFromChoice(state, "screen-0", null as unknown as Record<string, string>)
      ).toThrow();
    });

    it("throws when a screening value is out of enum (not 'possible' or 'not-possible')", () => {
      const state = engine.getState();
      const task = serializeStateToQualtricsTask(state, engine.getConfig());
      const conceptId = task.concepts![0].id;
      expect(() =>
        buildEngineEventFromChoice(state, task.taskId, { [conceptId]: "maybe" })
      ).toThrow();
    });

    it("accepts a fully valid screening batch and returns SCREEN_SUBMITTED unchanged", () => {
      const state = engine.getState();
      const task = serializeStateToQualtricsTask(state, engine.getConfig());
      const conceptIds = task.concepts!.map((c) => c.id);
      const choices: Record<string, string> = {};
      for (const id of conceptIds) choices[id] = "possible";
      const event = buildEngineEventFromChoice(state, task.taskId, choices);
      expect(event.type).toBe("SCREEN_SUBMITTED");
      expect(event).toEqual({
        type: "SCREEN_SUBMITTED",
        responses: conceptIds.map((conceptId, i) => ({
          conceptId,
          possible: true,
          screenIndex: state.screened.length + i,
        })),
      });
    });

    it("accepts a mix of 'possible' and 'not-possible' and returns the correct event unchanged", () => {
      const state = engine.getState();
      const task = serializeStateToQualtricsTask(state, engine.getConfig());
      const conceptIds = task.concepts!.map((c) => c.id);
      const choices: Record<string, string> = {};
      conceptIds.forEach((id, i) => {
        choices[id] = i % 2 === 0 ? "possible" : "not-possible";
      });
      const event = buildEngineEventFromChoice(state, task.taskId, choices);
      expect(event).toEqual({
        type: "SCREEN_SUBMITTED",
        responses: conceptIds.map((conceptId, i) => ({
          conceptId,
          possible: i % 2 === 0,
          screenIndex: state.screened.length + i,
        })),
      });
    });
  });

  describe("TOURNAMENT", () => {
    it("throws when tournament_choice is missing", () => {
      const engine = makeEngine("grc-test", "seed-tournament-fixture");
      const state = { ...engine.getState(), phase: "TOURNAMENT" } as EngineState;
      expect(() => buildEngineEventFromChoice(state, "tournament-r0-t0", {})).toThrow();
    });

    it("throws when tournament_choice is an empty string", () => {
      const engine = makeEngine("grc-test", "seed-tournament-fixture");
      const state = { ...engine.getState(), phase: "TOURNAMENT" } as EngineState;
      expect(() =>
        buildEngineEventFromChoice(state, "tournament-r0-t0", { tournament_choice: "" })
      ).toThrow();
    });

    it("accepts a valid tournament_choice and returns the correct event unchanged", () => {
      const engine = makeEngine("grc-test", "seed-tournament-fixture");
      const state = { ...engine.getState(), phase: "TOURNAMENT" } as EngineState;
      const event = buildEngineEventFromChoice(state, "tournament-r0-t0", {
        tournament_choice: "concept-b",
      });
      expect(event).toEqual({
        type: "TOURNAMENT_TASK_SUBMITTED",
        matchupId: "tournament-r0-t0",
        chosenConceptId: "concept-b",
      });
    });
  });

  describe("BYO", () => {
    it("throws when choice is not an object", () => {
      const engine = makeEngine("grc-test", "seed-byo-fixture");
      const state = engine.getState();
      expect(() =>
        buildEngineEventFromChoice(state, "byo-0", "not-an-object" as unknown as Record<string, string>)
      ).toThrow();
    });

    it("accepts a valid BYO choice object and returns the correct event unchanged", () => {
      const engine = makeEngine("grc-test", "seed-byo-fixture");
      const state = engine.getState();
      const task = serializeStateToQualtricsTask(state, engine.getConfig());
      const choices: Record<string, string> = {};
      for (const attr of task.attributes!) {
        choices[attr.id] = attr.levels[0].id;
      }
      const event = buildEngineEventFromChoice(state, "byo-0", choices);
      expect(event).toEqual({ type: "BYO_SUBMITTED", answers: choices });
    });
  });
});
