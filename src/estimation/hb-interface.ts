// ACBC Engine — Server-side Hierarchical Bayes endpoint contract (FR-6)
//
// This module defines the wire contract between the ACBC engine and an
// external server-side HB estimator. It does NOT implement an HB sampler;
// it only serializes DesignMatrix data into a plain-JSON payload and parses
// the estimator's response back into a typed HBResult.

import type { DesignMatrix, MatrixColumn } from "./matrix.js";

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface HBOptions {
  chains?: number;
  iterations?: number;
  burnIn?: number;
  thinning?: number;
  seed?: string;
}

export interface HBRequest {
  studyId: string;
  respondentId: string;
  matrix: DesignMatrix;
  options?: HBOptions;
}

export interface HBResult {
  respondentUtilities: Record<string, number>;
  attributeImportance: Record<string, number>;
  noneUtility: number;
  converged: boolean;
  diagnostics: Record<string, number>;
}

export interface HBPayload {
  version: string;
  studyId: string;
  respondentId: string;
  columns: string[];
  rows: Array<{
    taskId: string;
    phase: string;
    values: number[];
    response: number;
  }>;
  options?: HBOptions;
}

// ---------------------------------------------------------------------------
// Version
// ---------------------------------------------------------------------------

const PAYLOAD_VERSION = "1.0.0";

// ---------------------------------------------------------------------------
// Type guards (no Zod, no external deps)
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  if (!isRecord(value)) return false;
  for (const v of Object.values(value)) {
    if (typeof v !== "number" || !Number.isFinite(v)) return false;
  }
  return true;
}

/**
 * Shape of the raw response returned by the HB server.
 *
 * `respondentUtilities` is keyed by column name (matching `HBPayload.columns`).
 * `noneUtility` is reported as a separate scalar by the server.
 */
interface HBServerResponse {
  respondentUtilities: Record<string, number>;
  noneUtility: number;
  converged: boolean;
  diagnostics: Record<string, number>;
}

function isHBServerResponse(value: unknown): value is HBServerResponse {
  if (!isRecord(value)) return false;
  if (!isNumberRecord(value.respondentUtilities)) return false;
  if (typeof value.noneUtility !== "number" || !Number.isFinite(value.noneUtility)) {
    return false;
  }
  if (typeof value.converged !== "boolean") return false;
  if (!isNumberRecord(value.diagnostics)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Attribute grouping
// ---------------------------------------------------------------------------

/**
 * Return the attribute ID that owns a header column, or `null` for non-attribute
 * columns (none_threshold, task_id, phase).
 *
 * Effect columns are named `{attrId}_{levelId}` per `matrix.ts` convention.
 * The split is on the **first** underscore, which is correct when attribute IDs
 * do not themselves contain underscores (the common case in ACBC configs).
 *
 * The continuous `price` column is treated as its own attribute group.
 */
function attributeOfColumn(col: MatrixColumn): string | null {
  if (col.type === "effect") {
    const idx = col.name.indexOf("_");
    if (idx === -1) return null;
    return col.name.slice(0, idx);
  }
  if (col.type === "price") return "price";
  return null;
}

// ---------------------------------------------------------------------------
// Attribute importance
// ---------------------------------------------------------------------------

/**
 * Compute attribute importance from respondent utilities and the design matrix.
 *
 * **Discrete (effects-coded) attributes** — for an attribute with L levels the
 * HB server returns L−1 explicit utilities (one per non-aliased column). The
 * omitted level's utility is `−sum(explicit)` under effects coding. The
 * attribute range is `max(utility) − min(utility)` across all L levels.
 *
 * **Continuous price attribute** — the range is `|β| × (max_price − min_price)`
 * observed in the matrix rows, reflecting the utility swing across the observed
 * price range.
 *
 * Importance = `(attribute range) / (sum of all attribute ranges) × 100`.
 * When the denominator is zero (all ranges zero), every importance is 0.
 */
function computeAttributeImportance(
  utilities: Record<string, number>,
  matrix: DesignMatrix,
): Record<string, number> {
  const ranges = new Map<string, number>();

  // Group effect columns by attribute prefix.
  const effectGroups = new Map<string, string[]>();
  let priceColumn: MatrixColumn | null = null;

  for (const col of matrix.header) {
    if (col.type === "effect") {
      const attrId = attributeOfColumn(col);
      if (attrId === null) continue;
      const group = effectGroups.get(attrId) ?? [];
      group.push(col.name);
      effectGroups.set(attrId, group);
    } else if (col.type === "price") {
      priceColumn = col;
    }
  }

  // Discrete attribute ranges.
  for (const [attrId, columns] of effectGroups) {
    const explicit = columns.map((name) => utilities[name] ?? 0);
    const omitted = -explicit.reduce((a, b) => a + b, 0);
    const all = [...explicit, omitted];
    ranges.set(attrId, Math.max(...all) - Math.min(...all));
  }

  // Continuous price range: |beta| × (max_price - min_price) in the data.
  if (priceColumn) {
    const beta = utilities[priceColumn.name] ?? 0;
    const priceIdx = matrix.header.findIndex((c) => c.type === "price");
    if (priceIdx !== -1) {
      let minPrice = Infinity;
      let maxPrice = -Infinity;
      for (const row of matrix.rows) {
        const p = row.values[priceIdx];
        if (typeof p === "number" && Number.isFinite(p)) {
          if (p < minPrice) minPrice = p;
          if (p > maxPrice) maxPrice = p;
        }
      }
      if (Number.isFinite(minPrice) && Number.isFinite(maxPrice)) {
        ranges.set("price", Math.abs(beta) * (maxPrice - minPrice));
      } else {
        ranges.set("price", 0);
      }
    }
  }

  const sumRanges = Array.from(ranges.values()).reduce((a, b) => a + b, 0);
  const importance: Record<string, number> = {};
  for (const [attrId, range] of ranges) {
    importance[attrId] = sumRanges === 0 ? 0 : (range / sumRanges) * 100;
  }
  return importance;
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

/**
 * Serialize a DesignMatrix into a plain-JSON payload suitable for transmission
 * to a server-side HB estimator.
 *
 * Column metadata (type/coding) is collapsed to just column names; the server
 * is expected to infer coding from the column ordering and the `version` field.
 */
export function serializeMatrix(matrix: DesignMatrix, options?: HBOptions): HBPayload {
  return {
    version: PAYLOAD_VERSION,
    studyId: matrix.metadata.studyId,
    respondentId: matrix.metadata.respondentId,
    columns: matrix.header.map((col) => col.name),
    rows: matrix.rows.map((row) => ({
      taskId: row.taskId,
      phase: row.phase,
      values: row.values,
      response: row.response,
    })),
    options,
  };
}

/**
 * Validate and convert an HB server response into a typed `HBResult`.
 *
 * Throws `Error` if the payload fails type-guard validation.
 *
 * `attributeImportance` is derived from `respondentUtilities` and the column
 * structure of the supplied `matrix` — the server does not compute it.
 */
export function parseHBResult(payload: unknown, matrix: DesignMatrix): HBResult {
  if (!isHBServerResponse(payload)) {
    throw new Error("Invalid HB server response: missing or invalid fields");
  }
  return {
    respondentUtilities: payload.respondentUtilities,
    attributeImportance: computeAttributeImportance(payload.respondentUtilities, matrix),
    noneUtility: payload.noneUtility,
    converged: payload.converged,
    diagnostics: payload.diagnostics,
  };
}

/**
 * Build an internal `HBRequest` bundling the matrix with its identifiers and
 * estimation options. This is the in-process handle; `serializeMatrix` converts
 * it to the wire format.
 */
export function buildHBRequest(matrix: DesignMatrix, options?: HBOptions): HBRequest {
  return {
    studyId: matrix.metadata.studyId,
    respondentId: matrix.metadata.respondentId,
    matrix,
    options,
  };
}
