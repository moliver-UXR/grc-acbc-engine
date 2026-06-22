import { describe, it, expect } from "vitest";
import {
  generateRandomUtilities,
  simulateRespondent,
  simulateCohort,
} from "../harness.js";
import sampleStudy from "../fixtures/sample-study.json";
import type { StudyConfig } from "../../src/core/types.js";
import { SeededRNG } from "../../src/core/prng.js";

const baseConfig = sampleStudy as StudyConfig;

const calibrationConfig: StudyConfig = {
  ...baseConfig,
  study: {
    ...baseConfig.study,
    phases: {
      ...baseConfig.study.phases,
      calibration: true,
    },
  },
};

describe("generateRandomUtilities", () => {
  it("produces deterministic utilities keyed by matrix column names", () => {
    const rng = new SeededRNG("test-seed");
    const utilities = generateRandomUtilities(baseConfig, rng);

    expect(utilities["brand_brand_a"]).toBeTypeOf("number");
    expect(utilities["brand_brand_b"]).toBeTypeOf("number");
    expect(utilities["color_color_red"]).toBeTypeOf("number");
    expect(utilities["color_color_blue"]).toBeTypeOf("number");
    expect(utilities["price"]).toBeTypeOf("number");

    // Reference levels are omitted from the effects-coded matrix.
    expect(utilities["brand_brand_c"]).toBeUndefined();
    expect(utilities["color_color_green"]).toBeUndefined();
  });

  it("returns the same utilities for the same seed", () => {
    const a = generateRandomUtilities(baseConfig, new SeededRNG("seed-a"));
    const b = generateRandomUtilities(baseConfig, new SeededRNG("seed-a"));
    expect(a).toEqual(b);
  });

  it("returns different utilities for different seeds", () => {
    const a = generateRandomUtilities(baseConfig, new SeededRNG("seed-a"));
    const b = generateRandomUtilities(baseConfig, new SeededRNG("seed-b"));
    expect(a).not.toEqual(b);
  });
});

describe("simulateRespondent", () => {
  it("reaches DONE phase for a single respondent", () => {
    const run = simulateRespondent("study-1", "resp-1", baseConfig, {
      seed: "harness-test",
    });

    expect(run.studyId).toBe("study-1");
    expect(run.respondentId).toBe("resp-1");
    expect(run.finalState.phase).toBe("DONE");
    expect(run.eventLog.events.length).toBeGreaterThan(0);
    expect(Object.keys(run.trueUtilities).length).toBeGreaterThan(0);
  });

  it("is deterministic when the same seed is reused", () => {
    const runA = simulateRespondent("study-1", "resp-1", baseConfig, {
      seed: "deterministic-seed",
    });
    const runB = simulateRespondent("study-1", "resp-1", baseConfig, {
      seed: "deterministic-seed",
    });

    expect(runA.finalState.phase).toBe(runB.finalState.phase);
    expect(runA.finalState.screened.length).toBe(runB.finalState.screened.length);
    expect(runA.finalState.tournamentRounds.length).toBe(
      runB.finalState.tournamentRounds.length,
    );
    expect(runA.trueUtilities).toEqual(runB.trueUtilities);
  });

  it("reaches DONE when calibration phase is enabled", () => {
    const run = simulateRespondent("study-1", "resp-2", calibrationConfig, {
      seed: "calibration-test",
    });

    expect(run.finalState.phase).toBe("DONE");
    expect(run.finalState.calibration).not.toBeNull();
    expect(run.finalState.calibration!.purchaseIntent).toBeGreaterThanOrEqual(1);
    expect(run.finalState.calibration!.purchaseIntent).toBeLessThanOrEqual(5);
  });
});

describe("simulateCohort", () => {
  it("produces valid final states for a cohort of 10 respondents", () => {
    const report = simulateCohort(baseConfig, 10, { seed: "cohort-test" });

    expect(report.runs).toHaveLength(10);
    expect(report.runs.every((r) => r.finalState.phase === "DONE")).toBe(true);
    expect(report.summary.avgScreeningResponses).toBeGreaterThan(0);
    expect(report.summary.avgTournamentTasks).toBeGreaterThanOrEqual(0);
  });

  it("produces per-respondent study and respondent ids", () => {
    const report = simulateCohort(baseConfig, 3, { seed: "ids-test" });

    report.runs.forEach((run, i) => {
      expect(run.respondentId).toBe(`robotic-${i}`);
      expect(run.studyId).toBe("cohort-study");
    });
  });
});
