import { describe, it, expect } from "vitest";
import {
  computeDEfficiency,
  levelBalance,
  duplicateRate,
  resumeSafetyCheck,
  type BalanceReport,
} from "../diagnostics.js";
import { buildDesignMatrix } from "../../src/estimation/matrix.js";
import type { Concept, EngineState, StudyConfig } from "../../src/core/types.js";
import sampleStudy from "../fixtures/sample-study.json";

const testConfig: StudyConfig = {
  ...sampleStudy,
  study: {
    ...sampleStudy.study,
    phases: {
      ...sampleStudy.study.phases,
      must_have: false,
      unacceptable: false,
    },
  },
};

function makeConcept(
  id: string,
  brand: string,
  price: string,
  color: string,
): Concept {
  return { id, levels: { brand, price, color }, source: "SCREENING" };
}

function makeState(): EngineState {
  return {
    respondentId: "resp-1",
    studyId: "study-1",
    phase: "DONE",
    rngSeed: "seed",
    byoConcept: makeConcept("c0", "brand_a", "price_low", "color_red"),
    conceptPool: [
      makeConcept("c1", "brand_a", "price_mid", "color_blue"),
      makeConcept("c2", "brand_b", "price_low", "color_green"),
      makeConcept("c3", "brand_c", "price_high", "color_red"),
    ],
    screened: [
      { conceptId: "c1", possible: true, screenIndex: 0 },
      { conceptId: "c2", possible: false, screenIndex: 1 },
      { conceptId: "c3", possible: true, screenIndex: 2 },
    ],
    candidateRule: null,
    confirmedRules: [],
    survivingConceptIds: ["c1", "c3"],
    tournamentRounds: [
      {
        round: 1,
        tasks: [
          {
            concepts: [
              makeConcept("c1", "brand_a", "price_mid", "color_blue"),
              makeConcept("c2", "brand_b", "price_low", "color_green"),
              makeConcept("c3", "brand_c", "price_high", "color_red"),
            ],
            grayedAttributes: [],
            winnerConceptId: "c1",
          },
        ],
      },
    ],
    currentTournamentRound: 1,
    currentTournamentTask: 0,
    calibration: null,
    eventVersion: 1,
  };
}

describe("computeDEfficiency", () => {
  it("returns a finite, non-negative D-criterion for any design matrix", () => {
    const matrix = buildDesignMatrix(makeState(), testConfig);
    const d = computeDEfficiency(matrix);
    expect(d).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(d)).toBe(true);
  });

  it("returns a positive D-criterion for a full-rank design", () => {
    const matrix = {
      header: [
        { name: "a1", type: "effect" as const, coding: "effects" as const },
        { name: "a2", type: "effect" as const, coding: "effects" as const },
      ],
      rows: [
        { taskId: "t1", phase: "BYO" as const, values: [1, 0], response: 1 },
        { taskId: "t2", phase: "BYO" as const, values: [0, 1], response: 1 },
      ],
      metadata: {
        respondentId: "r",
        studyId: "s",
        totalTasks: 2,
        attributeCount: 1,
      },
    };
    expect(computeDEfficiency(matrix)).toBeCloseTo(1, 10);
  });

  it("returns 0 for an empty design matrix", () => {
    const matrix = {
      header: [],
      rows: [],
      metadata: {
        respondentId: "r",
        studyId: "s",
        totalTasks: 0,
        attributeCount: 0,
      },
    };
    expect(computeDEfficiency(matrix)).toBe(0);
  });

  it("ignores task_id and phase columns when computing the criterion", () => {
    const matrix = buildDesignMatrix(makeState(), testConfig);
    const withMetadata = computeDEfficiency(matrix);

    const stripped: typeof matrix = {
      ...matrix,
      header: matrix.header.filter(
        (c) => c.type !== "task_id" && c.type !== "phase",
      ),
      rows: matrix.rows.map((r) => ({
        ...r,
        values: r.values.filter(
          (_, i) =>
            matrix.header[i].type !== "task_id" &&
            matrix.header[i].type !== "phase",
        ),
      })),
    };

    expect(computeDEfficiency(stripped)).toBeCloseTo(withMetadata, 10);
  });
});

describe("levelBalance", () => {
  it("reports expected counts and deviations for each level", () => {
    const pool = [
      makeConcept("c1", "brand_a", "price_low", "color_red"),
      makeConcept("c2", "brand_a", "price_mid", "color_blue"),
      makeConcept("c3", "brand_b", "price_high", "color_green"),
      makeConcept("c4", "brand_c", "price_low", "color_red"),
    ];
    const reports = levelBalance(pool, testConfig);

    const brand = reports.find((r) => r.attributeId === "brand")!;
    expect(brand.levels["brand_a"].count).toBe(2);
    expect(brand.levels["brand_a"].expected).toBe(4 / 3);
    expect(brand.levels["brand_a"].deviation).toBeCloseTo(2 - 4 / 3, 10);

    const color = reports.find((r) => r.attributeId === "color")!;
    expect(color.levels["color_red"].count).toBe(2);
    expect(color.levels["color_blue"].count).toBe(1);
    expect(color.levels["color_green"].count).toBe(1);
  });

  it("returns zero counts for an empty pool", () => {
    const reports = levelBalance([], testConfig);
    for (const report of reports) {
      for (const level of Object.values(report.levels)) {
        expect(level.count).toBe(0);
        expect(level.deviation).toBeCloseTo(-level.expected, 10);
      }
    }
  });
});

describe("duplicateRate", () => {
  it("returns 0 when all concepts are unique", () => {
    const pool = [
      makeConcept("c1", "brand_a", "price_low", "color_red"),
      makeConcept("c2", "brand_b", "price_mid", "color_blue"),
      makeConcept("c3", "brand_c", "price_high", "color_green"),
    ];
    expect(duplicateRate(pool)).toBe(0);
  });

  it("returns the fraction of duplicate concepts", () => {
    const pool = [
      makeConcept("c1", "brand_a", "price_low", "color_red"),
      makeConcept("c2", "brand_a", "price_low", "color_red"),
      makeConcept("c3", "brand_b", "price_mid", "color_blue"),
    ];
    expect(duplicateRate(pool)).toBe(1 / 3);
  });

  it("returns 0 for an empty pool", () => {
    expect(duplicateRate([])).toBe(0);
  });
});

describe("resumeSafetyCheck", () => {
  it("replays a simulated respondent and matches the live engine state", () => {
    expect(resumeSafetyCheck(testConfig, "resume-seed-1")).toBe(true);
  });

  it("is deterministic for the same seed", () => {
    const first = resumeSafetyCheck(testConfig, "resume-seed-2");
    const second = resumeSafetyCheck(testConfig, "resume-seed-2");
    expect(first).toBe(second);
  });
});
