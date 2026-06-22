import { describe, it, expect } from "vitest";
import { StreamingMNL, logistic } from "../../../src/estimation/mnl.js";
import type { MatrixColumn, MatrixRow } from "../../../src/estimation/matrix.js";

const baseColumns: MatrixColumn[] = [
  { name: "brand_a", type: "effect", coding: "effects" },
  { name: "color_red", type: "effect", coding: "effects" },
  { name: "task_id", type: "task_id", coding: "binary" },
  { name: "phase", type: "phase", coding: "binary" },
];

function makeRow(
  values: number[],
  response: number,
  phase: MatrixRow["phase"] = "BYO",
  taskId = "task",
): MatrixRow {
  return { taskId, phase, values, response };
}

function makeBinaryRow(
  attrValues: [number, number],
  response: number,
  taskId: string,
  taskIdValue: number,
  phaseValue: number,
): MatrixRow {
  return makeRow(
    [attrValues[0], attrValues[1], taskIdValue, phaseValue],
    response,
    "BYO",
    taskId,
  );
}

describe("logistic", () => {
  it("returns 0.5 at zero", () => {
    expect(logistic(0)).toBe(0.5);
  });

  it("saturates for large positive inputs", () => {
    expect(logistic(20)).toBeCloseTo(1, 5);
  });

  it("saturates for large negative inputs", () => {
    expect(logistic(-20)).toBeCloseTo(0, 5);
  });

  it("is symmetric around the origin", () => {
    expect(logistic(2)).toBeCloseTo(1 - logistic(-2), 10);
  });
});

describe("StreamingMNL", () => {
  it("returns zero utilities when no rows have been streamed", () => {
    const mnl = new StreamingMNL({ columns: baseColumns });
    const result = mnl.estimate();

    expect(result.utilities).toEqual({
      brand_a: 0,
      color_red: 0,
    });
    expect(result.iterations).toBe(0);
    expect(result.converged).toBe(false);
  });

  it("recovers positive utilities for attributes that drive positive responses", () => {
    const mnl = new StreamingMNL({
      columns: baseColumns,
      learningRate: 0.5,
      maxIterations: 5000,
      convergenceThreshold: 1e-6,
    });

    // Vary task_id and phase values to ensure they are ignored.
    mnl.update(makeBinaryRow([1, 0], 1, "b1", 100, 0));
    mnl.update(makeBinaryRow([-1, 0], 0, "b2", 999, 1));
    mnl.update(makeBinaryRow([0, 1], 1, "b3", 50, 0));
    mnl.update(makeBinaryRow([0, -1], 0, "b4", 12345, 1));

    const result = mnl.estimate();

    expect(result.utilities["brand_a"]).toBeGreaterThan(0);
    expect(result.utilities["color_red"]).toBeGreaterThan(0);
    expect(Object.keys(result.utilities)).toEqual(["brand_a", "color_red"]);
  });

  it("produces the same sign estimates when rows are streamed one at a time", () => {
    const mnl = new StreamingMNL({
      columns: baseColumns,
      learningRate: 0.5,
      maxIterations: 5000,
      convergenceThreshold: 1e-6,
    });

    const rows: MatrixRow[] = [
      makeBinaryRow([1, 0], 1, "b1", 100, 0),
      makeBinaryRow([-1, 0], 0, "b2", 999, 1),
      makeBinaryRow([0, 1], 1, "b3", 50, 0),
      makeBinaryRow([0, -1], 0, "b4", 12345, 1),
    ];

    for (const row of rows) {
      mnl.update(row);
    }

    const result = mnl.estimate();

    expect(result.utilities["brand_a"]).toBeGreaterThan(0);
    expect(result.utilities["color_red"]).toBeGreaterThan(0);
  });

  it("ignores task_id and phase columns", () => {
    const mnlWithNoise = new StreamingMNL({
      columns: baseColumns,
      learningRate: 0.5,
      maxIterations: 5000,
      convergenceThreshold: 1e-6,
    });

    const mnlClean = new StreamingMNL({
      columns: baseColumns.slice(0, 2),
      learningRate: 0.5,
      maxIterations: 5000,
      convergenceThreshold: 1e-6,
    });

    const rows: MatrixRow[] = [
      makeBinaryRow([1, 0], 1, "b1", 100, 0),
      makeBinaryRow([-1, 0], 0, "b2", 999, 1),
      makeBinaryRow([0, 1], 1, "b3", 50, 0),
      makeBinaryRow([0, -1], 0, "b4", 12345, 1),
    ];

    for (const row of rows) {
      mnlWithNoise.update(row);
      mnlClean.update(makeRow(row.values.slice(0, 2), row.response));
    }

    const resultNoise = mnlWithNoise.estimate();
    const resultClean = mnlClean.estimate();

    expect(resultNoise.utilities["brand_a"]).toBeCloseTo(
      resultClean.utilities["brand_a"],
      5,
    );
    expect(resultNoise.utilities["color_red"]).toBeCloseTo(
      resultClean.utilities["color_red"],
      5,
    );
  });

  it("uses softmax over the 3 tournament concepts grouped by taskId", () => {
    const tournamentColumns: MatrixColumn[] = [
      { name: "feat_a", type: "effect", coding: "effects" },
      { name: "feat_b", type: "effect", coding: "effects" },
      { name: "phase", type: "phase", coding: "binary" },
    ];

    const mnl = new StreamingMNL({
      columns: tournamentColumns,
      learningRate: 0.5,
      maxIterations: 5000,
      convergenceThreshold: 1e-6,
    });

    mnl.update(makeRow([1, 0, 2], 1, "TOURNAMENT", "match-1"));
    mnl.update(makeRow([0, 1, 2], 0, "TOURNAMENT", "match-1"));
    mnl.update(makeRow([0, 0, 2], 0, "TOURNAMENT", "match-1"));

    const result = mnl.estimate();

    expect(result.utilities["feat_a"]).toBeGreaterThan(result.utilities["feat_b"]);
  });

  it("groups tournament rows by taskId, not by order alone", () => {
    const cols: MatrixColumn[] = [
      { name: "x", type: "effect", coding: "effects" },
      { name: "phase", type: "phase", coding: "binary" },
    ];

    const mnl = new StreamingMNL({
      columns: cols,
      learningRate: 0.2,
      maxIterations: 2000,
      convergenceThreshold: 1e-6,
    });

    // Two independent tasks: in each, the concept with x=1 wins.
    mnl.update(makeRow([1, 0], 1, "TOURNAMENT", "A"));
    mnl.update(makeRow([0, 0], 0, "TOURNAMENT", "A"));
    mnl.update(makeRow([0, 0], 1, "TOURNAMENT", "B"));
    mnl.update(makeRow([1, 0], 0, "TOURNAMENT", "B"));

    const result = mnl.estimate();

    // With opposite winners across tasks, no systematic preference emerges.
    expect(result.utilities["x"]).toBeCloseTo(0, 5);
  });

  it("includes continuous price and none columns in estimation", () => {
    const cols: MatrixColumn[] = [
      { name: "brand_a", type: "effect", coding: "effects" },
      { name: "price", type: "price", coding: "continuous" },
      { name: "none_threshold", type: "none", coding: "binary" },
    ];

    const mnl = new StreamingMNL({
      columns: cols,
      learningRate: 0.01,
      maxIterations: 3000,
      convergenceThreshold: 1e-6,
    });

    // Higher price should drive lower utility.
    mnl.update(makeRow([1, 100, 0], 1, "SCREENING"));
    mnl.update(makeRow([1, 200, 0], 0, "SCREENING"));
    mnl.update(makeRow([-1, 100, 0], 0, "SCREENING"));
    mnl.update(makeRow([-1, 200, 0], 0, "SCREENING"));

    const result = mnl.estimate();

    expect(Object.keys(result.utilities)).toEqual([
      "brand_a",
      "price",
      "none_threshold",
    ]);
    expect(result.utilities["price"]).toBeLessThan(0);
  });
});
