import { describe, it, expect } from "vitest";
import {
  buildDesignMatrix,
  effectsCode,
  encodeAttributeLevels,
  type DesignMatrix,
} from "../../../src/estimation/matrix.js";
import type {
  Attribute,
  Concept,
  EngineState,
  StudyConfig,
} from "../../../src/core/types.js";

const testAttributes: Attribute[] = [
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
      { id: "color_green", label: "Green" },
    ],
  },
];

const testConfig: StudyConfig = {
  study: {
    attributes: testAttributes,
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

function makeConcept(
  id: string,
  brand: string,
  price: string,
  color: string,
  opts?: { priceValue?: number },
): Concept {
  return {
    id,
    levels: { brand, price, color },
    price: opts?.priceValue,
    source: "SCREENING",
  };
}

function makeState(): EngineState {
  return {
    respondentId: "resp-1",
    studyId: "study-1",
    phase: "DONE",
    rngSeed: "seed",
    byoConcept: makeConcept("c0", "brand_a", "price_low", "color_red", {
      priceValue: 100,
    }),
    conceptPool: [
      makeConcept("c1", "brand_a", "price_mid", "color_blue", {
        priceValue: 200,
      }),
      makeConcept("c2", "brand_b", "price_low", "color_green", {
        priceValue: 100,
      }),
      makeConcept("c3", "brand_c", "price_high", "color_red", {
        priceValue: 300,
      }),
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
    calibration: { conceptId: "c3", purchaseIntent: 7 },
    eventVersion: 1,
  };
}

describe("effectsCode", () => {
  it("encodes 2-level attributes", () => {
    expect(effectsCode(0, 2)).toEqual([1]);
    expect(effectsCode(1, 2)).toEqual([-1]);
  });

  it("encodes 3-level attributes", () => {
    expect(effectsCode(0, 3)).toEqual([1, 0]);
    expect(effectsCode(1, 3)).toEqual([0, 1]);
    expect(effectsCode(2, 3)).toEqual([-1, -1]);
  });

  it("encodes 4-level attributes", () => {
    expect(effectsCode(0, 4)).toEqual([1, 0, 0]);
    expect(effectsCode(1, 4)).toEqual([0, 1, 0]);
    expect(effectsCode(2, 4)).toEqual([0, 0, 1]);
    expect(effectsCode(3, 4)).toEqual([-1, -1, -1]);
  });

  it("returns empty vector for single-level attributes", () => {
    expect(effectsCode(0, 1)).toEqual([]);
  });

  it("returns zeros for out-of-range level indices", () => {
    expect(effectsCode(-1, 3)).toEqual([0, 0]);
    expect(effectsCode(3, 3)).toEqual([0, 0]);
  });
});

describe("encodeAttributeLevels", () => {
  it("encodes a full concept with discrete and price attributes", () => {
    const concept = makeConcept("cx", "brand_a", "price_low", "color_red");
    // brand: brand_a -> [1, 0], color: color_red -> [1, 0]
    expect(encodeAttributeLevels(concept, testConfig)).toEqual([1, 0, 1, 0]);
  });

  it("aliases the last level of each attribute to -1", () => {
    const concept = makeConcept("cx", "brand_c", "price_low", "color_green");
    // brand: brand_c -> [-1, -1], color: color_green -> [-1, -1]
    expect(encodeAttributeLevels(concept, testConfig)).toEqual([-1, -1, -1, -1]);
  });
});

describe("buildDesignMatrix", () => {
  it("produces a deterministic header with discrete effects, price, none, task_id, phase columns", () => {
    const matrix = buildDesignMatrix(makeState(), testConfig);

    expect(matrix.header.map((c) => c.name)).toEqual([
      "brand_brand_a",
      "brand_brand_b",
      "color_color_red",
      "color_color_blue",
      "price",
      "none_threshold",
      "task_id",
      "phase",
    ]);
    expect(matrix.header.map((c) => c.type)).toEqual([
      "effect",
      "effect",
      "effect",
      "effect",
      "price",
      "none",
      "task_id",
      "phase",
    ]);
  });

  it("emits BYO rows (one per non-price BYO attribute) with response 1", () => {
    const matrix = buildDesignMatrix(makeState(), testConfig);
    const byoRows = matrix.rows.filter((r) => r.phase === "BYO");

    expect(byoRows).toHaveLength(2); // brand and color
    expect(byoRows[0].taskId).toBe("byo-brand");
    expect(byoRows[0].response).toBe(1);
    expect(byoRows[1].taskId).toBe("byo-color");
    expect(byoRows[1].response).toBe(1);

    // Full BYO concept encoded: brand_a [1,0], color_red [1,0], price 100
    expect(byoRows[0].values).toEqual([1, 0, 1, 0, 100, 0, 0, 0]);
    expect(byoRows[1].values).toEqual([1, 0, 1, 0, 100, 0, 1, 0]);
  });

  it("emits screening rows with none_threshold = 1 and correct responses", () => {
    const matrix = buildDesignMatrix(makeState(), testConfig);
    const screeningRows = matrix.rows.filter((r) => r.phase === "SCREENING");

    expect(screeningRows).toHaveLength(3);
    expect(screeningRows[0].taskId).toBe("screen-0");
    expect(screeningRows[0].response).toBe(1);
    expect(screeningRows[1].taskId).toBe("screen-1");
    expect(screeningRows[1].response).toBe(0);
    expect(screeningRows[2].taskId).toBe("screen-2");
    expect(screeningRows[2].response).toBe(1);

    // All screening rows carry the None threshold flag.
    const noneIdx = matrix.header.findIndex((c) => c.name === "none_threshold");
    for (const row of screeningRows) {
      expect(row.values[noneIdx]).toBe(1);
    }
  });

  it("emits tournament rows (3 per task) with one winner", () => {
    const matrix = buildDesignMatrix(makeState(), testConfig);
    const tournamentRows = matrix.rows.filter((r) => r.phase === "TOURNAMENT");

    expect(tournamentRows).toHaveLength(3);
    expect(tournamentRows[0].taskId).toBe("tournament-r1-t0");
    expect(tournamentRows[0].response).toBe(1); // c1 winner
    expect(tournamentRows[1].response).toBe(0);
    expect(tournamentRows[2].response).toBe(0);
  });

  it("emits a calibration row with purchase intent response", () => {
    const matrix = buildDesignMatrix(makeState(), testConfig);
    const calibrationRows = matrix.rows.filter((r) => r.phase === "CALIBRATION");

    expect(calibrationRows).toHaveLength(1);
    expect(calibrationRows[0].taskId).toBe("calibration");
    expect(calibrationRows[0].response).toBe(7);
  });

  it("returns rows in deterministic phase order", () => {
    const matrix = buildDesignMatrix(makeState(), testConfig);
    const phases = matrix.rows.map((r) => r.phase);
    expect(phases).toEqual([
      "BYO",
      "BYO",
      "SCREENING",
      "SCREENING",
      "SCREENING",
      "TOURNAMENT",
      "TOURNAMENT",
      "TOURNAMENT",
      "CALIBRATION",
    ]);
  });

  it("populates metadata from state and config", () => {
    const matrix = buildDesignMatrix(makeState(), testConfig);
    expect(matrix.metadata.respondentId).toBe("resp-1");
    expect(matrix.metadata.studyId).toBe("study-1");
    expect(matrix.metadata.totalTasks).toBe(9);
    expect(matrix.metadata.attributeCount).toBe(2);
  });

  it("produces consistent values for concept c3 across phases", () => {
    const matrix = buildDesignMatrix(makeState(), testConfig);
    const c3Rows = matrix.rows.filter((r) =>
      r.values.slice(0, 4).every((v, i) => v === [-1, -1, 1, 0][i]),
    );
    // Screening c3, tournament c3, calibration c3
    expect(c3Rows).toHaveLength(3);
  });

  it("omits price column when no price attribute exists", () => {
    const noPriceConfig: StudyConfig = {
      study: {
        attributes: testAttributes.filter((a) => a.price_type === "none"),
        design: testConfig.study.design,
        phases: testConfig.study.phases,
        estimation: testConfig.study.estimation,
      },
    };
    const matrix = buildDesignMatrix(makeState(), noPriceConfig);
    const names = matrix.header.map((c) => c.name);
    expect(names).not.toContain("price");
  });
});
