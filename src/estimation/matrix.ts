// ACBC Engine — Unified effects-coded design matrix builder (FR-6)

import {
  type Attribute,
  type Concept,
  type EngineState,
  type StudyConfig,
} from "../core/types.js";

export interface MatrixColumn {
  name: string;
  type: "effect" | "price" | "none" | "task_id" | "phase";
  coding: "effects" | "continuous" | "binary";
}

export interface MatrixRow {
  taskId: string;
  phase: "BYO" | "SCREENING" | "TOURNAMENT" | "CALIBRATION";
  values: number[];
  response: number;
}

export interface MatrixMetadata {
  respondentId: string;
  studyId: string;
  totalTasks: number;
  attributeCount: number;
}

export interface DesignMatrix {
  header: MatrixColumn[];
  rows: MatrixRow[];
  metadata: MatrixMetadata;
}

/**
 * Effects coding for a single attribute level.
 *
 * For L levels there are L - 1 columns. Level i (0-indexed) with i < L - 1
 * receives a 1 in column i and 0 elsewhere. The last level (i === L - 1) is
 * aliased as -1 in every column.
 */
export function effectsCode(levelIndex: number, levelCount: number): number[] {
  if (levelCount < 2) {
    return [];
  }
  if (levelIndex < 0 || levelIndex >= levelCount) {
    return new Array(levelCount - 1).fill(0);
  }
  const columns = levelCount - 1;
  if (levelIndex === levelCount - 1) {
    return new Array(columns).fill(-1);
  }
  const result = new Array(columns).fill(0);
  result[levelIndex] = 1;
  return result;
}

function getDiscreteAttributes(config: StudyConfig): Attribute[] {
  return config.study.attributes.filter((attr) => attr.price_type === "none");
}

function getPriceAttributes(config: StudyConfig): Attribute[] {
  return config.study.attributes.filter((attr) => attr.price_type !== "none");
}

function levelIndex(attribute: Attribute, levelId: string): number {
  return attribute.levels.findIndex((level) => level.id === levelId);
}

/**
 * Return the numeric price for a concept.
 *
 * Uses concept.price when present; otherwise sums price_increment values of
 * the selected levels for all price-type attributes.
 */
export function getConceptPrice(concept: Concept, config: StudyConfig): number {
  if (typeof concept.price === "number") {
    return concept.price;
  }
  const priceAttrs = getPriceAttributes(config);
  if (priceAttrs.length === 0) {
    return 0;
  }
  let total = 0;
  for (const attr of priceAttrs) {
    const selectedLevelId = concept.levels[attr.id];
    if (!selectedLevelId) continue;
    const selectedLevel = attr.levels.find((level) => level.id === selectedLevelId);
    if (selectedLevel && typeof selectedLevel.price_increment === "number") {
      total += selectedLevel.price_increment;
    }
  }
  return total;
}

/**
 * Encode a concept's discrete attribute levels as a flat effects-coded vector.
 *
 * Discrete attributes are those with price_type === "none". The vector follows
 * the attribute order in the config and, within each attribute, the level order
 * defined there, omitting the last level of each attribute.
 */
export function encodeAttributeLevels(concept: Concept, config: StudyConfig): number[] {
  const attrs = getDiscreteAttributes(config);
  const encoded: number[] = [];
  for (const attr of attrs) {
    const selectedLevelId = concept.levels[attr.id];
    const idx = selectedLevelId ? levelIndex(attr, selectedLevelId) : -1;
    encoded.push(...effectsCode(idx, attr.levels.length));
  }
  return encoded;
}

function buildHeader(config: StudyConfig): MatrixColumn[] {
  const header: MatrixColumn[] = [];
  for (const attr of getDiscreteAttributes(config)) {
    for (let i = 0; i < attr.levels.length - 1; i++) {
      header.push({
        name: `${attr.id}_${attr.levels[i].id}`,
        type: "effect",
        coding: "effects",
      });
    }
  }
  if (getPriceAttributes(config).length > 0) {
    header.push({ name: "price", type: "price", coding: "continuous" });
  }
  header.push({ name: "none_threshold", type: "none", coding: "binary" });
  header.push({ name: "task_id", type: "task_id", coding: "binary" });
  header.push({ name: "phase", type: "phase", coding: "binary" });
  return header;
}

function phaseCode(phase: MatrixRow["phase"]): number {
  switch (phase) {
    case "BYO":
      return 0;
    case "SCREENING":
      return 1;
    case "TOURNAMENT":
      return 2;
    case "CALIBRATION":
      return 3;
  }
}

function encodeRow(
  concept: Concept,
  config: StudyConfig,
  taskId: string,
  phase: MatrixRow["phase"],
  response: number,
  taskIndex: number,
  noneThreshold: number,
): MatrixRow {
  const values: number[] = [...encodeAttributeLevels(concept, config)];
  if (getPriceAttributes(config).length > 0) {
    values.push(getConceptPrice(concept, config));
  }
  values.push(noneThreshold);
  values.push(taskIndex);
  values.push(phaseCode(phase));
  return { taskId, phase, values, response };
}

/**
 * Build a unified effects-coded design matrix from an EngineState snapshot.
 *
 * Rows are emitted in deterministic order:
 *   1. BYO rows (one per non-price BYO attribute)
 *   2. Screening rows (one per screened concept)
 *   3. Tournament rows (one row per concept per task, rounds then tasks)
 *   4. Calibration row (when calibration answer is present)
 */
export function buildDesignMatrix(
  state: EngineState,
  config: StudyConfig,
): DesignMatrix {
  const header = buildHeader(config);
  const rows: MatrixRow[] = [];

  // BYO: one row per non-price BYO attribute, encoding the full C0 concept.
  if (state.byoConcept) {
    const byoAttrs = config.study.attributes.filter(
      (attr) => attr.in_byo && attr.price_type === "none",
    );
    for (let attrIdx = 0; attrIdx < byoAttrs.length; attrIdx++) {
      const attr = byoAttrs[attrIdx];
      rows.push(
        encodeRow(
          state.byoConcept,
          config,
          `byo-${attr.id}`,
          "BYO",
          1,
          attrIdx,
          0,
        ),
      );
    }
  }

  // Screening: one row per screened concept with None threshold.
  for (let screenIdx = 0; screenIdx < state.screened.length; screenIdx++) {
    const response = state.screened[screenIdx];
    const concept = state.conceptPool.find((c) => c.id === response.conceptId);
    if (!concept) continue;
    rows.push(
      encodeRow(
        concept,
        config,
        `screen-${response.screenIndex}`,
        "SCREENING",
        response.possible ? 1 : 0,
        response.screenIndex,
        1,
      ),
    );
  }

  // Tournament: three rows per task (one per concept).
  let tournamentTaskIndex = 0;
  for (const round of state.tournamentRounds) {
    for (let taskIdx = 0; taskIdx < round.tasks.length; taskIdx++) {
      const task = round.tasks[taskIdx];
      for (const concept of task.concepts) {
        const isWinner = task.winnerConceptId === concept.id;
        rows.push(
          encodeRow(
            concept,
            config,
            `tournament-r${round.round}-t${taskIdx}`,
            "TOURNAMENT",
            isWinner ? 1 : 0,
            tournamentTaskIndex,
            0,
          ),
        );
      }
      tournamentTaskIndex++;
    }
  }

  // Calibration: one row using the calibration concept.
  if (state.calibration) {
    const calibrationConcept =
      state.conceptPool.find((c) => c.id === state.calibration!.conceptId) ??
      state.byoConcept;
    if (calibrationConcept) {
      rows.push(
        encodeRow(
          calibrationConcept,
          config,
          "calibration",
          "CALIBRATION",
          state.calibration.purchaseIntent,
          0,
          0,
        ),
      );
    }
  }

  const metadata: MatrixMetadata = {
    respondentId: state.respondentId,
    studyId: state.studyId,
    totalTasks: rows.length,
    attributeCount: getDiscreteAttributes(config).length,
  };

  return { header, rows, metadata };
}
