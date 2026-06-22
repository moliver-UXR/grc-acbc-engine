import { describe, it, expect } from "vitest";
import { simulateRespondent } from "../harness.js";
import sampleStudy from "../fixtures/sample-study.json";
import { buildDesignMatrix } from "../../src/estimation/matrix.js";
import { StreamingMNL } from "../../src/estimation/mnl.js";
import {
  serializeMatrix,
  buildHBRequest,
  parseHBResult,
} from "../../src/estimation/hb-interface.js";
import {
  computeDEfficiency,
  levelBalance,
  duplicateRate,
  resumeSafetyCheck,
} from "../diagnostics.js";
import type { StudyConfig } from "../../src/core/types.js";

const config = sampleStudy as StudyConfig;

describe("full ACBC pipeline integration", () => {
  const run = simulateRespondent("full-pipeline-study", "full-pipeline-resp", config, {
    seed: "integration-test",
  });

  it("reaches DONE with a non-empty event log", () => {
    expect(run.finalState.phase).toBe("DONE");
    expect(run.eventLog.events.length).toBeGreaterThan(0);
    expect(run.finalState.byoConcept).toBeDefined();
    expect(run.finalState.conceptPool.length).toBeGreaterThan(0);
  });

  it("builds a design matrix containing rows from BYO, Screening, and Tournament", () => {
    const matrix = buildDesignMatrix(run.finalState, config);

    expect(matrix.metadata.studyId).toBe(run.studyId);
    expect(matrix.metadata.respondentId).toBe(run.respondentId);
    expect(matrix.rows.length).toBeGreaterThan(0);

    const byoRows = matrix.rows.filter((r) => r.phase === "BYO");
    const screeningRows = matrix.rows.filter((r) => r.phase === "SCREENING");
    const tournamentRows = matrix.rows.filter((r) => r.phase === "TOURNAMENT");

    expect(byoRows.length).toBeGreaterThan(0);
    expect(screeningRows.length).toBeGreaterThan(0);
    expect(tournamentRows.length).toBeGreaterThan(0);

    const phaseRowCounts = new Set(matrix.rows.map((r) => r.phase));
    expect(phaseRowCounts).toContain("BYO");
    expect(phaseRowCounts).toContain("SCREENING");
    expect(phaseRowCounts).toContain("TOURNAMENT");
  });

  it("estimates finite MNL utilities from the design matrix", () => {
    const matrix = buildDesignMatrix(run.finalState, config);
    const mnl = new StreamingMNL({ columns: matrix.header });

    for (const row of matrix.rows) {
      mnl.update(row);
    }

    const result = mnl.estimate();

    expect(Object.keys(result.utilities).length).toBeGreaterThan(0);
    for (const [name, value] of Object.entries(result.utilities)) {
      expect(Number.isFinite(value), `utility ${name} must be finite`).toBe(true);
    }
    expect(result.iterations).toBeGreaterThan(0);
  });

  it("serializes the matrix and builds an HB request", () => {
    const matrix = buildDesignMatrix(run.finalState, config);
    const payload = serializeMatrix(matrix, { chains: 2, iterations: 1000 });
    const request = buildHBRequest(matrix, { chains: 2, iterations: 1000 });

    expect(payload.version).toBe("1.0.0");
    expect(payload.columns).toEqual(matrix.header.map((col) => col.name));
    expect(payload.rows).toHaveLength(matrix.rows.length);
    expect(JSON.stringify(payload)).toBeTruthy();

    expect(request.studyId).toBe(matrix.metadata.studyId);
    expect(request.respondentId).toBe(matrix.metadata.respondentId);
    expect(request.matrix).toBe(matrix);
    expect(request.options).toEqual({ chains: 2, iterations: 1000 });
  });

  it("parses a mock HB response containing utilities, importance, and None utility", () => {
    const matrix = buildDesignMatrix(run.finalState, config);

    const respondentUtilities: Record<string, number> = {};
    for (const col of matrix.header) {
      respondentUtilities[col.name] = Math.random() * 2 - 1;
    }

    const mockResponse = {
      respondentUtilities,
      noneUtility: -1.25,
      converged: true,
      diagnostics: { rhat: 1.05, effectiveSize: 400 },
    };

    const result = parseHBResult(mockResponse, matrix);

    expect(result.respondentUtilities).toEqual(respondentUtilities);
    expect(result.noneUtility).toBe(-1.25);
    expect(result.converged).toBe(true);
    expect(result.diagnostics).toEqual(mockResponse.diagnostics);

    expect(Object.keys(result.attributeImportance).length).toBeGreaterThan(0);
    for (const value of Object.values(result.attributeImportance)) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it("computes design-quality diagnostics", () => {
    const matrix = buildDesignMatrix(run.finalState, config);
    const pool = run.finalState.conceptPool;

    const dEfficiency = computeDEfficiency(matrix);
    expect(Number.isFinite(dEfficiency)).toBe(true);
    expect(dEfficiency).toBeGreaterThanOrEqual(0);

    const balance = levelBalance(pool, config);
    expect(balance.length).toBe(config.study.attributes.length);
    for (const report of balance) {
      expect(Object.keys(report.levels).length).toBeGreaterThan(0);
    }

    const dupRate = duplicateRate(pool);
    expect(Number.isFinite(dupRate)).toBe(true);
    expect(dupRate).toBeGreaterThanOrEqual(0);
    expect(dupRate).toBeLessThanOrEqual(1);
  });

  it("passes the resume-safety check", () => {
    expect(resumeSafetyCheck(config, "resume-integration-test")).toBe(true);
  });
});
