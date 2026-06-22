import { describe, it, expect } from "vitest";
import {
  serializeMatrix,
  parseHBResult,
  buildHBRequest,
  type HBOptions,
  type HBPayload,
  type HBRequest,
  type HBResult,
} from "../../../src/estimation/hb-interface.js";
import type { DesignMatrix } from "../../../src/estimation/matrix.js";

// ---------------------------------------------------------------------------
// Test fixture: a DesignMatrix matching the header/row conventions of matrix.ts
// ---------------------------------------------------------------------------

function makeTestMatrix(): DesignMatrix {
  return {
    header: [
      { name: "brand_brand_a", type: "effect", coding: "effects" },
      { name: "brand_brand_b", type: "effect", coding: "effects" },
      { name: "color_color_red", type: "effect", coding: "effects" },
      { name: "color_color_blue", type: "effect", coding: "effects" },
      { name: "price", type: "price", coding: "continuous" },
      { name: "none_threshold", type: "none", coding: "binary" },
      { name: "task_id", type: "task_id", coding: "binary" },
      { name: "phase", type: "phase", coding: "binary" },
    ],
    rows: [
      { taskId: "byo-brand", phase: "BYO", values: [1, 0, 1, 0, 100, 0, 0, 0], response: 1 },
      { taskId: "screen-0", phase: "SCREENING", values: [-1, -1, 0, 1, 200, 1, 0, 1], response: 1 },
      { taskId: "screen-1", phase: "SCREENING", values: [0, 1, -1, -1, 300, 1, 1, 1], response: 0 },
      { taskId: "tournament-r0-t0", phase: "TOURNAMENT", values: [1, 0, 0, 1, 150, 0, 0, 2], response: 1 },
      { taskId: "tournament-r0-t0", phase: "TOURNAMENT", values: [0, 1, 1, 0, 250, 0, 0, 2], response: 0 },
      { taskId: "tournament-r0-t0", phase: "TOURNAMENT", values: [-1, -1, -1, -1, 200, 0, 0, 2], response: 0 },
    ],
    metadata: {
      respondentId: "resp-001",
      studyId: "study-001",
      totalTasks: 6,
      attributeCount: 2,
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("hb-interface", () => {
  const matrix = makeTestMatrix();

  // -----------------------------------------------------------------------
  // serializeMatrix
  // -----------------------------------------------------------------------

  describe("serializeMatrix", () => {
    it("produces a payload with version, studyId, respondentId, columns, rows", () => {
      const payload = serializeMatrix(matrix);
      expect(payload.version).toBe("1.0.0");
      expect(payload.studyId).toBe("study-001");
      expect(payload.respondentId).toBe("resp-001");
      expect(payload.columns).toEqual([
        "brand_brand_a",
        "brand_brand_b",
        "color_color_red",
        "color_color_blue",
        "price",
        "none_threshold",
        "task_id",
        "phase",
      ]);
      expect(payload.rows).toHaveLength(6);
      expect(payload.rows[0]).toEqual({
        taskId: "byo-brand",
        phase: "BYO",
        values: [1, 0, 1, 0, 100, 0, 0, 0],
        response: 1,
      });
      expect(payload.options).toBeUndefined();
    });

    it("passes through HBOptions when provided", () => {
      const options: HBOptions = {
        chains: 4,
        iterations: 10000,
        burnIn: 2000,
        thinning: 5,
        seed: "42",
      };
      const payload = serializeMatrix(matrix, options);
      expect(payload.options).toEqual(options);
    });

    it("produces a JSON-serializable payload", () => {
      const payload = serializeMatrix(matrix);
      expect(() => JSON.stringify(payload)).not.toThrow();
      const restored: HBPayload = JSON.parse(JSON.stringify(payload));
      expect(restored.columns).toEqual(payload.columns);
      expect(restored.rows).toEqual(payload.rows);
    });

    it("preserves row phase as a string in the payload", () => {
      const payload = serializeMatrix(matrix);
      expect(payload.rows[0].phase).toBe("BYO");
      expect(payload.rows[1].phase).toBe("SCREENING");
      expect(payload.rows[3].phase).toBe("TOURNAMENT");
    });
  });

  // -----------------------------------------------------------------------
  // buildHBRequest
  // -----------------------------------------------------------------------

  describe("buildHBRequest", () => {
    it("bundles studyId, respondentId, matrix, and options", () => {
      const options: HBOptions = { chains: 2, seed: "abc" };
      const request = buildHBRequest(matrix, options);
      expect(request.studyId).toBe("study-001");
      expect(request.respondentId).toBe("resp-001");
      expect(request.matrix).toBe(matrix);
      expect(request.options).toEqual(options);
    });

    it("works without options", () => {
      const request = buildHBRequest(matrix);
      expect(request.options).toBeUndefined();
      expect(request.matrix).toBe(matrix);
    });

    it("satisfies the HBRequest interface shape", () => {
      const request: HBRequest = buildHBRequest(matrix, { chains: 1 });
      expect(typeof request.studyId).toBe("string");
      expect(typeof request.respondentId).toBe("string");
      expect(request.matrix.header).toBeDefined();
      expect(request.matrix.rows).toBeDefined();
      expect(request.matrix.metadata).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // parseHBResult — happy path + importance
  // -----------------------------------------------------------------------

  describe("parseHBResult", () => {
    const validResponse = {
      respondentUtilities: {
        brand_brand_a: 0.5,
        brand_brand_b: -0.3,
        color_color_red: 0.2,
        color_color_blue: -0.1,
        price: -0.01,
        none_threshold: -1.5,
      },
      noneUtility: -1.5,
      converged: true,
      diagnostics: { rhat: 1.01, effectiveSize: 500 },
    };

    it("parses a valid response and returns a typed HBResult", () => {
      const result = parseHBResult(validResponse, matrix);
      expect(result.respondentUtilities).toEqual(validResponse.respondentUtilities);
      expect(result.noneUtility).toBe(-1.5);
      expect(result.converged).toBe(true);
      expect(result.diagnostics).toEqual({ rhat: 1.01, effectiveSize: 500 });
    });

    it("computes attribute importance as range / sumRanges × 100", () => {
      // brand: explicit = [0.5, -0.3], omitted = -(0.5 + -0.3) = -0.2
      //   range = max(0.5, -0.3, -0.2) - min(0.5, -0.3, -0.2) = 0.5 - (-0.3) = 0.8
      // color: explicit = [0.2, -0.1], omitted = -(0.2 + -0.1) = -0.1
      //   range = max(0.2, -0.1, -0.1) - min(0.2, -0.1, -0.1) = 0.2 - (-0.1) = 0.3
      // price: beta = -0.01, prices in data = [100, 200, 300, 150, 250, 200]
      //   range = |−0.01| × (300 - 100) = 2.0
      // sumRanges = 0.8 + 0.3 + 2.0 = 3.1
      // brand = 0.8/3.1 × 100 ≈ 25.806
      // color = 0.3/3.1 × 100 ≈ 9.677
      // price = 2.0/3.1 × 100 ≈ 64.516
      const result = parseHBResult(validResponse, matrix);
      expect(result.attributeImportance.brand).toBeCloseTo(25.806, 1);
      expect(result.attributeImportance.color).toBeCloseTo(9.677, 1);
      expect(result.attributeImportance.price).toBeCloseTo(64.516, 1);
    });

    it("importances sum to 100", () => {
      const result = parseHBResult(validResponse, matrix);
      const sum = Object.values(result.attributeImportance).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(100, 5);
    });

    it("returns 0 importance for all attributes when all utilities are zero", () => {
      const zeroResponse = {
        respondentUtilities: {
          brand_brand_a: 0,
          brand_brand_b: 0,
          color_color_red: 0,
          color_color_blue: 0,
          price: 0,
          none_threshold: 0,
        },
        noneUtility: 0,
        converged: true,
        diagnostics: {},
      };
      const result = parseHBResult(zeroResponse, matrix);
      expect(result.attributeImportance.brand).toBe(0);
      expect(result.attributeImportance.color).toBe(0);
      expect(result.attributeImportance.price).toBe(0);
    });

    it("treats missing utility keys as 0 (graceful degradation)", () => {
      const partialResponse = {
        respondentUtilities: {
          brand_brand_a: 0.6,
          // brand_brand_b missing → treated as 0
          color_color_red: 0.4,
          color_color_blue: 0,
          price: -0.02,
          none_threshold: -1,
        },
        noneUtility: -1,
        converged: true,
        diagnostics: {},
      };
      const result = parseHBResult(partialResponse, matrix);
      // brand: explicit = [0.6, 0], omitted = -(0.6) = -0.6
      //   range = 0.6 - (-0.6) = 1.2
      // color: explicit = [0.4, 0], omitted = -(0.4) = -0.4
      //   range = 0.4 - (-0.4) = 0.8
      // price: |−0.02| × 200 = 4.0
      // sum = 1.2 + 0.8 + 4.0 = 6.0
      expect(result.attributeImportance.brand).toBeCloseTo(20, 0);
      expect(result.attributeImportance.color).toBeCloseTo((0.8 / 6.0) * 100, 1);
      expect(result.attributeImportance.price).toBeCloseTo((4.0 / 6.0) * 100, 1);
    });

    it("does not include none_threshold, task_id, or phase in attributeImportance", () => {
      const result = parseHBResult(validResponse, matrix);
      expect(result.attributeImportance).not.toHaveProperty("none_threshold");
      expect(result.attributeImportance).not.toHaveProperty("task_id");
      expect(result.attributeImportance).not.toHaveProperty("phase");
    });
  });

  // -----------------------------------------------------------------------
  // parseHBResult — type guard validation
  // -----------------------------------------------------------------------

  describe("parseHBResult validation", () => {
    it("throws on null", () => {
      expect(() => parseHBResult(null, matrix)).toThrow();
    });

    it("throws on undefined", () => {
      expect(() => parseHBResult(undefined, matrix)).toThrow();
    });

    it("throws on string", () => {
      expect(() => parseHBResult("not an object", matrix)).toThrow();
    });

    it("throws on number", () => {
      expect(() => parseHBResult(42, matrix)).toThrow();
    });

    it("throws on array", () => {
      expect(() => parseHBResult([], matrix)).toThrow();
    });

    it("throws on missing respondentUtilities", () => {
      expect(() =>
        parseHBResult(
          { noneUtility: 0, converged: true, diagnostics: {} },
          matrix,
        ),
      ).toThrow();
    });

    it("throws on non-boolean converged", () => {
      expect(() =>
        parseHBResult(
          {
            respondentUtilities: {},
            noneUtility: 0,
            converged: "yes",
            diagnostics: {},
          },
          matrix,
        ),
      ).toThrow();
    });

    it("throws on non-number noneUtility", () => {
      expect(() =>
        parseHBResult(
          {
            respondentUtilities: {},
            noneUtility: "low",
            converged: true,
            diagnostics: {},
          },
          matrix,
        ),
      ).toThrow();
    });

    it("throws on NaN in respondentUtilities", () => {
      expect(() =>
        parseHBResult(
          {
            respondentUtilities: { brand_brand_a: NaN },
            noneUtility: 0,
            converged: true,
            diagnostics: {},
          },
          matrix,
        ),
      ).toThrow();
    });

    it("throws on Infinity in diagnostics", () => {
      expect(() =>
        parseHBResult(
          {
            respondentUtilities: {},
            noneUtility: 0,
            converged: true,
            diagnostics: { rhat: Infinity },
          },
          matrix,
        ),
      ).toThrow();
    });

    it("throws on non-number value in respondentUtilities", () => {
      expect(() =>
        parseHBResult(
          {
            respondentUtilities: { brand_brand_a: "high" },
            noneUtility: 0,
            converged: true,
            diagnostics: {},
          },
          matrix,
        ),
      ).toThrow();
    });

    it("throws on missing diagnostics", () => {
      expect(() =>
        parseHBResult(
          {
            respondentUtilities: {},
            noneUtility: 0,
            converged: true,
          },
          matrix,
        ),
      ).toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // Round-trip: matrix → payload → simulated server → parsed result
  // -----------------------------------------------------------------------

  describe("round-trip", () => {
    it("matrix → buildHBRequest → serializeMatrix → simulated server → parseHBResult", () => {
      const options: HBOptions = {
        chains: 4,
        iterations: 5000,
        burnIn: 1000,
        thinning: 2,
        seed: "round-trip",
      };

      // 1. Build internal request.
      const request: HBRequest = buildHBRequest(matrix, options);
      expect(request.studyId).toBe(matrix.metadata.studyId);
      expect(request.respondentId).toBe(matrix.metadata.respondentId);

      // 2. Serialize to wire payload.
      const payload: HBPayload = serializeMatrix(request.matrix, request.options);
      expect(payload.version).toBe("1.0.0");
      expect(payload.options).toEqual(options);
      expect(payload.columns).toHaveLength(matrix.header.length);
      expect(payload.rows).toHaveLength(matrix.rows.length);

      // 3. Simulate HB server: produce utilities for every column.
      const serverResponse = {
        respondentUtilities: Object.fromEntries(
          payload.columns.map((col, i) => [col, (i + 1) * 0.1]),
        ),
        noneUtility: -2.0,
        converged: true,
        diagnostics: { rhat: 1.0, effectiveSize: 1000 },
      };

      // 4. Parse back.
      const result: HBResult = parseHBResult(serverResponse, request.matrix);

      expect(result.converged).toBe(true);
      expect(result.noneUtility).toBe(-2.0);
      expect(result.diagnostics).toEqual({ rhat: 1.0, effectiveSize: 1000 });
      expect(Object.keys(result.attributeImportance).sort()).toEqual([
        "brand",
        "color",
        "price",
      ]);

      // Importances sum to 100.
      const sum = Object.values(result.attributeImportance).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(100, 5);
    });

    it("payload survives JSON round-trip without data loss", () => {
      const payload = serializeMatrix(matrix, { chains: 3, seed: "json" });
      const json = JSON.stringify(payload);
      const restored: HBPayload = JSON.parse(json);

      expect(restored.version).toBe(payload.version);
      expect(restored.studyId).toBe(payload.studyId);
      expect(restored.respondentId).toBe(payload.respondentId);
      expect(restored.columns).toEqual(payload.columns);
      expect(restored.rows).toEqual(payload.rows);
      expect(restored.options).toEqual(payload.options);
    });
  });
});
