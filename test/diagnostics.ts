// ACBC Engine — Diagnostic quality checks for generated designs (NFR validation)

import type { Concept, StudyConfig } from "../src/core/types.js";
import type { DesignMatrix, MatrixColumn } from "../src/estimation/matrix.js";
import { replay, MemoryStorage, type EventLog } from "../src/core/state.js";
import { ACBCEngine } from "../src/index.js";

const EPS = 1e-12;

/**
 * Build the estimator design matrix X from a DesignMatrix by dropping metadata
 * columns (`task_id`, `phase`) that are not part of the utility model.
 */
function buildXMatrix(matrix: DesignMatrix): number[][] {
  const keep: boolean[] = matrix.header.map(
    (col: MatrixColumn) => col.type !== "task_id" && col.type !== "phase",
  );
  return matrix.rows.map((row) => row.values.filter((_, i) => keep[i]));
}

function transposeMultiply(X: number[][]): number[][] {
  const n = X.length;
  if (n === 0) return [];
  const p = X[0].length;
  const XtX: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  for (let i = 0; i < p; i++) {
    for (let j = i; j < p; j++) {
      let sum = 0;
      for (let r = 0; r < n; r++) {
        sum += X[r][i] * X[r][j];
      }
      XtX[i][j] = sum;
      if (i !== j) XtX[j][i] = sum;
    }
  }
  return XtX;
}

function determinant(A: number[][]): number {
  const n = A.length;
  if (n === 0) return 1;
  if (n === 1) return A[0][0];

  const M = A.map((row) => [...row]);
  let det = 1;
  let swaps = 0;

  for (let k = 0; k < n; k++) {
    let pivotRow = k;
    let pivotAbs = Math.abs(M[k][k]);
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(M[i][k]);
      if (v > pivotAbs) {
        pivotAbs = v;
        pivotRow = i;
      }
    }

    if (pivotAbs < EPS) return 0;

    if (pivotRow !== k) {
      [M[k], M[pivotRow]] = [M[pivotRow], M[k]];
      swaps++;
    }

    const pivot = M[k][k];
    det *= pivot;

    for (let i = k + 1; i < n; i++) {
      const factor = M[i][k] / pivot;
      M[i][k] = 0;
      for (let j = k + 1; j < n; j++) {
        M[i][j] -= factor * M[k][j];
      }
    }
  }

  return swaps % 2 === 0 ? det : -det;
}

/**
 * D-criterion efficiency: det(X'X)^(1/p) where p is the number of estimated
 * parameters (columns kept from the design matrix).
 */
export function computeDEfficiency(matrix: DesignMatrix): number {
  const X = buildXMatrix(matrix);
  if (X.length === 0 || X[0].length === 0) return 0;
  const p = X[0].length;
  const XtX = transposeMultiply(X);
  const detXtX = determinant(XtX);
  if (detXtX <= 0) return 0;
  return Math.pow(detXtX, 1 / p);
}

export interface BalanceReport {
  attributeId: string;
  levels: Record<
    string,
    {
      count: number;
      expected: number;
      deviation: number;
    }
  >;
}

/**
 * Report how evenly each attribute level appears in the concept pool.
 */
export function levelBalance(pool: Concept[], config: StudyConfig): BalanceReport[] {
  return config.study.attributes.map((attr) => {
    const levelCount = attr.levels.length;
    const expected = pool.length / levelCount;
    const levels: BalanceReport["levels"] = {};

    for (const level of attr.levels) {
      const count = pool.filter((c) => c.levels[attr.id] === level.id).length;
      levels[level.id] = {
        count,
        expected,
        deviation: count - expected,
      };
    }

    return { attributeId: attr.id, levels };
  });
}

function levelFingerprint(concept: Concept): string {
  const entries = Object.entries(concept.levels).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return JSON.stringify(entries);
}

/**
 * Fraction of exact duplicate concepts in the pool.
 */
export function duplicateRate(pool: Concept[]): number {
  if (pool.length === 0) return 0;
  const seen = new Set<string>();
  let duplicates = 0;
  for (const concept of pool) {
    const key = levelFingerprint(concept);
    if (seen.has(key)) {
      duplicates++;
    } else {
      seen.add(key);
    }
  }
  return duplicates / pool.length;
}

function stateFingerprint(state: unknown): string {
  return JSON.stringify(state);
}

/**
 * Simulate a full respondent, persist the event log, replay it, and verify the
 * replayed state matches the live engine state byte-for-byte.
 */
export function resumeSafetyCheck(config: StudyConfig, seed: string): boolean {
  const storage = new MemoryStorage();
  const engine = new ACBCEngine("diag-study", "diag-resp", config, seed, storage);
  engine.start();

  // BYO: pick the first level of every in-BYO attribute.
  const byoAnswers: Record<string, string> = {};
  for (const attr of config.study.attributes) {
    if (attr.in_byo) {
      byoAnswers[attr.id] = attr.levels[0].id;
    }
  }
  engine.submitEvent({ type: "BYO_SUBMITTED", answers: byoAnswers });

  let safety = 0;
  while (safety < 1000) {
    safety++;
    const state = engine.getState();

    if (state.phase === "SCREENING") {
      const batchSize = config.study.design.screens_per_concept_batch;
      const nextIndex = state.screened.length;
      const conceptIds = state.conceptPool
        .filter((c) => !state.screened.some((s) => s.conceptId === c.id))
        .map((c) => c.id)
        .slice(0, batchSize);

      if (conceptIds.length === 0) {
        // No remaining concepts; submit an empty batch to let completion logic run.
        engine.submitEvent({ type: "SCREEN_SUBMITTED", responses: [] });
        continue;
      }

      const responses = conceptIds.map((conceptId, i) => ({
        conceptId,
        possible: true,
        screenIndex: nextIndex + i,
      }));
      engine.submitEvent({ type: "SCREEN_SUBMITTED", responses });
      continue;
    }

    if (state.phase === "CONFIRM_MUST_HAVE" || state.phase === "CONFIRM_UNACCEPTABLE") {
      // Reject heuristic cutoffs so screening can continue unimpeded.
      engine.submitEvent({ type: "RULE_REJECTED" });
      continue;
    }

    if (state.phase === "REGENERATE") {
      // The REGENERATE phase has no required input event; advancing is handled
      // by the reducer when a SCREEN_SUBMITTED occurs next. Loop to continue.
      continue;
    }

    if (state.phase === "TOURNAMENT") {
      const round = state.tournamentRounds[state.currentTournamentRound];
      const task = round.tasks[state.currentTournamentTask];
      engine.submitEvent({
        type: "TOURNAMENT_TASK_SUBMITTED",
        matchupId: `r${round.round}-t${state.currentTournamentTask}`,
        chosenConceptId: task.concepts[0].id,
      });
      continue;
    }

    if (state.phase === "CALIBRATION") {
      const calibrationConceptId =
        state.conceptPool[0]?.id ?? state.byoConcept?.id ?? "calibration";
      engine.submitEvent({
        type: "CALIBRATION_SUBMITTED",
        answer: { conceptId: calibrationConceptId, purchaseIntent: 5 },
      });
      continue;
    }

    if (state.phase === "DONE") {
      break;
    }
  }

  const finalState = engine.getState();
  const log: EventLog = storage.load() ?? { events: [], initialState: finalState };
  const replayed = replay(log, config);

  return finalState.phase === "DONE" && stateFingerprint(finalState) === stateFingerprint(replayed);
}
