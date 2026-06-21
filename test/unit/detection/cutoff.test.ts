import { describe, it, expect } from "vitest";
import {
  detectCandidateRule,
  isRuleViolated,
  buildExposureTable,
} from "../../../src/detection/cutoff.js";
import { ScreeningResponse, Concept, CutoffRule } from "../../../src/core/types.js";

function makeConcept(id: string, levels: Record<string, string>): Concept {
  return { id, levels, source: "SCREENING" };
}

function makeResponse(
  conceptId: string,
  possible: boolean,
  screenIndex: number,
): ScreeningResponse {
  return { conceptId, possible, screenIndex };
}

describe("buildExposureTable", () => {
  it("returns empty table for empty screened array", () => {
    const table = buildExposureTable([], []);
    expect(table).toEqual({});
  });

  it("builds correct exposure counts", () => {
    const pool = [
      makeConcept("c1", { brand: "A", color: "Red" }),
      makeConcept("c2", { brand: "B", color: "Red" }),
      makeConcept("c3", { brand: "A", color: "Blue" }),
    ];
    const screened = [
      makeResponse("c1", true, 0),
      makeResponse("c2", false, 1),
      makeResponse("c3", true, 2),
    ];

    const table = buildExposureTable(screened, pool);

    expect(table["brand"]["A"]).toEqual({ exposure: 2, accepts: 2, rejects: 0 });
    expect(table["brand"]["B"]).toEqual({ exposure: 1, accepts: 0, rejects: 1 });
    expect(table["color"]["Red"]).toEqual({ exposure: 2, accepts: 1, rejects: 1 });
    expect(table["color"]["Blue"]).toEqual({ exposure: 1, accepts: 1, rejects: 0 });
  });

  it("skips concepts not in pool", () => {
    const pool = [makeConcept("c1", { brand: "A" })];
    const screened = [makeResponse("c99", true, 0)];
    const table = buildExposureTable(screened, pool);
    expect(table).toEqual({});
  });
});

describe("isRuleViolated", () => {
  it("returns true when concept has the rule's level", () => {
    const concept = makeConcept("c1", { brand: "A", color: "Red" });
    const rule: CutoffRule = {
      kind: "unacceptable",
      attributeId: "brand",
      levelId: "A",
      confirmedAtScreen: 5,
    };
    expect(isRuleViolated(concept, rule)).toBe(true);
  });

  it("returns false when concept has a different level", () => {
    const concept = makeConcept("c1", { brand: "B", color: "Red" });
    const rule: CutoffRule = {
      kind: "unacceptable",
      attributeId: "brand",
      levelId: "A",
      confirmedAtScreen: 5,
    };
    expect(isRuleViolated(concept, rule)).toBe(false);
  });
});

describe("detectCandidateRule", () => {
  it("returns null when screened length < minExposure", () => {
    const pool = [makeConcept("c1", { brand: "A" })];
    const screened = [makeResponse("c1", false, 0)];
    expect(detectCandidateRule(screened, pool, [])).toBeNull();
  });

  it("detects unacceptable level (rejected every time)", () => {
    const pool = [
      makeConcept("c1", { brand: "A", color: "Red" }),
      makeConcept("c2", { brand: "A", color: "Blue" }),
      makeConcept("c3", { brand: "A", color: "Green" }),
    ];
    const screened = [
      makeResponse("c1", false, 0),
      makeResponse("c2", false, 1),
      makeResponse("c3", false, 2),
    ];

    const rule = detectCandidateRule(screened, pool, []);

    expect(rule).not.toBeNull();
    expect(rule!.kind).toBe("unacceptable");
    expect(rule!.attributeId).toBe("brand");
    expect(rule!.levelId).toBe("A");
    expect(rule!.confirmedAtScreen).toBe(3);
  });

  it("detects must-have level (accepted every time, no other level accepted)", () => {
    const pool = [
      makeConcept("c1", { brand: "A", color: "Red" }),
      makeConcept("c2", { brand: "A", color: "Blue" }),
      makeConcept("c3", { brand: "A", color: "Green" }),
    ];
    const screened = [
      makeResponse("c1", true, 0),
      makeResponse("c2", true, 1),
      makeResponse("c3", true, 2),
    ];

    const rule = detectCandidateRule(screened, pool, []);

    expect(rule).not.toBeNull();
    expect(rule!.kind).toBe("mustHave");
    expect(rule!.attributeId).toBe("brand");
    expect(rule!.levelId).toBe("A");
    expect(rule!.confirmedAtScreen).toBe(3);
  });

  it("does not detect must-have when another level of same attribute is accepted", () => {
    const pool = [
      makeConcept("c1", { brand: "A", color: "Red" }),
      makeConcept("c2", { brand: "B", color: "Red" }),
      makeConcept("c3", { brand: "A", color: "Blue" }),
    ];
    const screened = [
      makeResponse("c1", true, 0),
      makeResponse("c2", true, 1),
      makeResponse("c3", true, 2),
    ];

    const rule = detectCandidateRule(screened, pool, []);

    // brand A accepted twice but brand B also accepted once -> not must-have
    // color Red accepted twice but color Blue also accepted once -> not must-have
    expect(rule).toBeNull();
  });

  it("skips already-confirmed rules", () => {
    const pool = [
      makeConcept("c1", { brand: "A", color: "Red" }),
      makeConcept("c2", { brand: "A", color: "Blue" }),
      makeConcept("c3", { brand: "A", color: "Green" }),
    ];
    const screened = [
      makeResponse("c1", false, 0),
      makeResponse("c2", false, 1),
      makeResponse("c3", false, 2),
    ];
    const confirmed: CutoffRule[] = [
      {
        kind: "unacceptable",
        attributeId: "brand",
        levelId: "A",
        confirmedAtScreen: 10,
      },
    ];

    const rule = detectCandidateRule(screened, pool, confirmed);

    expect(rule).toBeNull();
  });

  it("prefers unacceptable over must-have", () => {
    const pool = [
      makeConcept("c1", { brand: "A", color: "Red" }),
      makeConcept("c2", { brand: "A", color: "Red" }),
      makeConcept("c3", { brand: "A", color: "Red" }),
    ];
    const screened = [
      makeResponse("c1", false, 0),
      makeResponse("c2", false, 1),
      makeResponse("c3", false, 2),
    ];

    const rule = detectCandidateRule(screened, pool, []);

    expect(rule).not.toBeNull();
    expect(rule!.kind).toBe("unacceptable");
  });

  it("respects custom minExposure", () => {
    const pool = [
      makeConcept("c1", { brand: "A" }),
      makeConcept("c2", { brand: "A" }),
    ];
    const screened = [
      makeResponse("c1", false, 0),
      makeResponse("c2", false, 1),
    ];

    // With default minExposure=3, should return null
    expect(detectCandidateRule(screened, pool, [])).toBeNull();

    // With minExposure=2, should detect
    const rule = detectCandidateRule(screened, pool, [], 2);
    expect(rule).not.toBeNull();
    expect(rule!.kind).toBe("unacceptable");
  });

  it("returns null when no pattern detected", () => {
    const pool = [
      makeConcept("c1", { brand: "A", color: "Red" }),
      makeConcept("c2", { brand: "B", color: "Blue" }),
      makeConcept("c3", { brand: "A", color: "Blue" }),
    ];
    const screened = [
      makeResponse("c1", true, 0),
      makeResponse("c2", false, 1),
      makeResponse("c3", true, 2),
    ];

    const rule = detectCandidateRule(screened, pool, []);

    expect(rule).toBeNull();
  });
});
