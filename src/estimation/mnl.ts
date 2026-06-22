// ACBC Engine — Browser-native streaming aggregate Multinomial Logit estimator
//
// This is a provisional client-side implementation intended for monitoring and
// diagnostics. It does not replace the server-side Hierarchical Bayes pipeline.

import { type MatrixColumn, type MatrixRow } from "./matrix.js";

export interface MNLResult {
  /** Utility weight for each estimable matrix column. */
  utilities: Record<string, number>;
  /** Final log-likelihood of the observed responses. */
  logLikelihood: number;
  /** Number of gradient-ascent iterations executed. */
  iterations: number;
  /** Whether the estimator converged before reaching maxIterations. */
  converged: boolean;
}

interface StreamingMNLConfig {
  learningRate?: number;
  maxIterations?: number;
  convergenceThreshold?: number;
  /** Column metadata used to select estimable columns and name utilities. */
  columns?: MatrixColumn[];
}

const EPSILON = 1e-15;

const ESTIMABLE_TYPES = new Set<MatrixColumn["type"]>(["effect", "price", "none"]);

/**
 * Numerically stable logistic function.
 */
export function logistic(x: number): number {
  if (x >= 0) {
    const z = Math.exp(-x);
    return 1 / (1 + z);
  }
  const z = Math.exp(x);
  return z / (1 + z);
}

function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

interface EstimableInfo {
  indices: number[];
  names: string[];
}

export class StreamingMNL {
  private readonly learningRate: number;
  private readonly maxIterations: number;
  private readonly convergenceThreshold: number;
  private readonly columns?: MatrixColumn[];
  private readonly rows: MatrixRow[] = [];

  constructor(config?: StreamingMNLConfig) {
    this.learningRate = config?.learningRate ?? 0.05;
    this.maxIterations = config?.maxIterations ?? 1000;
    this.convergenceThreshold = config?.convergenceThreshold ?? 1e-6;
    this.columns = config?.columns;
  }

  /**
   * Add a design-matrix row to the streaming aggregate.
   */
  update(row: MatrixRow): void {
    this.rows.push(row);
  }

  /**
   * Estimate part-worth utilities using gradient ascent.
   */
  estimate(): MNLResult {
    const { indices, names } = this.getEstimableInfo();
    const k = indices.length;

    if (this.rows.length === 0 || k === 0) {
      return {
        utilities: Object.fromEntries(names.map((name) => [name, 0])),
        logLikelihood: 0,
        iterations: 0,
        converged: false,
      };
    }

    let weights = new Array(k).fill(0);
    let logLikelihood = 0;
    let converged = false;
    let iterations = 0;

    const binaryRows: MatrixRow[] = [];
    const tournamentGroups = new Map<string, MatrixRow[]>();

    for (const row of this.rows) {
      if (row.phase === "TOURNAMENT") {
        const group = tournamentGroups.get(row.taskId) ?? [];
        group.push(row);
        tournamentGroups.set(row.taskId, group);
      } else if (row.phase === "BYO" || row.phase === "SCREENING") {
        binaryRows.push(row);
      }
      // CALIBRATION rows are intentionally ignored by this provisional estimator.
    }

    for (let iter = 0; iter < this.maxIterations; iter++) {
      const gradient = new Array(k).fill(0);
      let likelihood = 0;

      // Binary (Bernoulli) likelihood contributions.
      for (const row of binaryRows) {
        const x = indices.map((idx) => row.values[idx]);
        const utility = dot(weights, x);
        const predicted = logistic(utility);
        const residual = row.response - predicted;
        for (let i = 0; i < k; i++) {
          gradient[i] += residual * x[i];
        }
        const y = row.response;
        likelihood +=
          y * Math.log(predicted + EPSILON) +
          (1 - y) * Math.log(1 - predicted + EPSILON);
      }

      // Multinomial (softmax) tournament contributions.
      for (const group of tournamentGroups.values()) {
        const xs = group.map((row) => indices.map((idx) => row.values[idx]));
        const utilities = xs.map((x) => dot(weights, x));
        const maxUtility = Math.max(...utilities);
        const expUtilities = utilities.map((u) => Math.exp(u - maxUtility));
        const sumExp = expUtilities.reduce((a, b) => a + b, 0);

        for (let i = 0; i < group.length; i++) {
          const predicted = expUtilities[i] / sumExp;
          const residual = group[i].response - predicted;
          const x = xs[i];
          for (let j = 0; j < k; j++) {
            gradient[j] += residual * x[j];
          }
          likelihood += group[i].response * Math.log(predicted + EPSILON);
        }
      }

      const n = this.rows.length;
      for (let i = 0; i < k; i++) {
        gradient[i] /= n;
      }

      const nextWeights = new Array(k);
      let maxChange = 0;
      for (let i = 0; i < k; i++) {
        nextWeights[i] = weights[i] + this.learningRate * gradient[i];
        maxChange = Math.max(maxChange, Math.abs(nextWeights[i] - weights[i]));
      }

      weights = nextWeights;
      logLikelihood = likelihood;
      iterations = iter + 1;

      if (maxChange < this.convergenceThreshold) {
        converged = true;
        break;
      }
    }

    const utilities: Record<string, number> = {};
    for (let i = 0; i < k; i++) {
      utilities[names[i]] = weights[i];
    }

    return { utilities, logLikelihood, iterations, converged };
  }

  private getEstimableInfo(): EstimableInfo {
    if (this.columns && this.columns.length > 0) {
      const indices: number[] = [];
      const names: string[] = [];
      for (let i = 0; i < this.columns.length; i++) {
        if (ESTIMABLE_TYPES.has(this.columns[i].type)) {
          indices.push(i);
          names.push(this.columns[i].name);
        }
      }
      return { indices, names };
    }

    // Fallback: if no column metadata is supplied, treat every column as
    // estimable and use generic names. This loses the task_id/phase skip
    // behaviour, so callers should supply columns whenever possible.
    const count = this.rows.length > 0 ? this.rows[0].values.length : 0;
    return {
      indices: Array.from({ length: count }, (_, i) => i),
      names: Array.from({ length: count }, (_, i) => `col_${i}`),
    };
  }
}
