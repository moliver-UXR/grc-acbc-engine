// ACBC Engine — Robotic respondent simulation harness (NFR validation)
//
// Simulates deterministic robotic respondents with random-but-seeded true
// utilities. Each respondent is driven through the full ACBC pipeline by
// submitting events to ACBCEngine; state is never mutated directly.

import { ACBCEngine, MemoryStorage } from "../src/index.js";
import type { EngineState, StudyConfig, Attribute, Concept } from "../src/core/types.js";
import type { EventLog } from "../src/core/state.js";
import { SeededRNG } from "../src/core/prng.js";

export interface RoboticRespondentOptions {
  seed?: string;
  utilityNoise?: number;
  screeningThreshold?: number;
  calibrationEnabled?: boolean;
}

export interface RespondentRun {
  studyId: string;
  respondentId: string;
  eventLog: EventLog;
  finalState: EngineState;
  trueUtilities: Record<string, number>;
}

export interface CohortReport {
  runs: RespondentRun[];
  summary: {
    avgScreeningResponses: number;
    avgTournamentTasks: number;
    avgCalibration?: number;
  };
}

const DEFAULT_SEED = "robotic-default";
const TIE_TOLERANCE = 1e-9;

/**
 * Generate deterministic true utilities matching the effects-coded design
 * matrix naming convention from src/estimation/matrix.ts.
 *
 * For each discrete (price_type === "none") attribute, a coefficient is
 * generated for every level except the last (reference) level. The omitted
 * level's part-worth is reconstructed as the negative sum of the explicit
 * coefficients. When price attributes exist, a single continuous price
 * coefficient is generated and keyed as "price".
 */
export function generateRandomUtilities(
  config: StudyConfig,
  rng: SeededRNG,
): Record<string, number> {
  const utilities: Record<string, number> = {};

  for (const attr of config.study.attributes) {
    if (attr.price_type === "none") {
      // Effects coding omits the last level of each attribute.
      for (let i = 0; i < attr.levels.length - 1; i++) {
        utilities[`${attr.id}_${attr.levels[i].id}`] = rng.next() * 2 - 1;
      }
    }
  }

  const hasPrice = config.study.attributes.some((a) => a.price_type !== "none");
  if (hasPrice) {
    // Negative coefficient: higher price reduces utility.
    utilities["price"] = -(rng.next() * 0.02 + 0.005);
  }

  return utilities;
}

function findAttribute(config: StudyConfig, attributeId: string): Attribute | undefined {
  return config.study.attributes.find((a) => a.id === attributeId);
}

/**
 * Compute the part-worth of a selected level for a single attribute.
 *
 * Discrete attributes use effects-coded reconstruction; price attributes use
 * the continuous price coefficient multiplied by the level's price increment.
 */
function partWorth(
  attr: Attribute,
  levelId: string,
  utilities: Record<string, number>,
): number {
  if (attr.price_type !== "none") {
    const level = attr.levels.find((l) => l.id === levelId);
    const increment = level?.price_increment ?? 0;
    return increment * (utilities["price"] ?? 0);
  }

  const idx = attr.levels.findIndex((l) => l.id === levelId);
  if (idx < 0) return 0;

  // Effects coding: explicit coefficients for all levels except the last.
  if (idx < attr.levels.length - 1) {
    return utilities[`${attr.id}_${levelId}`] ?? 0;
  }

  // Reference level is aliased as the negative sum of explicit coefficients.
  let sum = 0;
  for (let i = 0; i < attr.levels.length - 1; i++) {
    sum += utilities[`${attr.id}_${attr.levels[i].id}`] ?? 0;
  }
  return -sum;
}

/**
 * Compute the deterministic utility of a concept from the robotic respondent's
 * true utilities. Optional Gumbel-like noise can be added via the supplied RNG.
 */
function conceptUtility(
  concept: Concept,
  config: StudyConfig,
  utilities: Record<string, number>,
  rng?: SeededRNG,
  noise = 0,
): number {
  let u = 0;
  for (const attr of config.study.attributes) {
    const levelId = concept.levels[attr.id];
    if (levelId) {
      u += partWorth(attr, levelId, utilities);
    }
  }
  if (noise > 0 && rng) {
    u += rng.next() * noise * 2 - noise;
  }
  return u;
}

/**
 * Pick the BYO level for a single attribute that maximizes part-worth.
 */
function chooseBestLevel(
  attr: Attribute,
  utilities: Record<string, number>,
): string {
  let bestLevel = attr.levels[0].id;
  let bestWorth = partWorth(attr, bestLevel, utilities);
  for (let i = 1; i < attr.levels.length; i++) {
    const levelId = attr.levels[i].id;
    const worth = partWorth(attr, levelId, utilities);
    if (worth > bestWorth) {
      bestLevel = levelId;
      bestWorth = worth;
    }
  }
  return bestLevel;
}

/**
 * Run a single robotic respondent through the entire ACBC pipeline.
 */
export function simulateRespondent(
  studyId: string,
  respondentId: string,
  config: StudyConfig,
  options: RoboticRespondentOptions = {},
): RespondentRun {
  const seed = options.seed ?? DEFAULT_SEED;
  const noise = options.utilityNoise ?? 0;
  const screeningThreshold = options.screeningThreshold ?? -100;
  const calibrationEnabled = options.calibrationEnabled ?? true;

  // Separate RNGs for utility generation and response noise so that changing
  // noise level does not alter the underlying true utilities.
  const utilityRNG = new SeededRNG(`${seed}-${respondentId}-utilities`);
  const noiseRNG = new SeededRNG(`${seed}-${respondentId}-noise`);
  const tieRNG = new SeededRNG(`${seed}-${respondentId}-tournament`);

  const trueUtilities = generateRandomUtilities(config, utilityRNG);
  const storage = new MemoryStorage();
  const engine = new ACBCEngine(studyId, respondentId, config, seed, storage);
  engine.start();

  let screenCounter = 0;
  while (engine.getState().phase !== "DONE") {
    const state = engine.getState();

    switch (state.phase) {
      case "BYO": {
        const answers: Record<string, string> = {};
        for (const attr of config.study.attributes) {
          if (attr.in_byo) {
            answers[attr.id] = chooseBestLevel(attr, trueUtilities);
          }
        }
        engine.submitEvent({ type: "BYO_SUBMITTED", answers });
        break;
      }

      case "SCREENING": {
        const screenedIds = new Set(state.screened.map((s) => s.conceptId));
        const unscreened = state.conceptPool.filter((c) => !screenedIds.has(c.id));
        const batchSize = config.study.design.screens_per_concept_batch;
        const batch = unscreened.slice(0, batchSize);

        const responses = batch.map((concept, idx) => {
          const u = conceptUtility(concept, config, trueUtilities, noiseRNG, noise);
          return {
            conceptId: concept.id,
            possible: u > screeningThreshold,
            screenIndex: screenCounter + idx,
          };
        });

        engine.submitEvent({ type: "SCREEN_SUBMITTED", responses });
        screenCounter += batch.length;
        break;
      }

      case "CONFIRM_MUST_HAVE":
      case "CONFIRM_UNACCEPTABLE": {
        engine.submitEvent({ type: "RULE_CONFIRMED" });
        break;
      }

      case "REGENERATE": {
        // Any event triggers the reducer to regenerate and return to SCREENING.
        engine.submitEvent({ type: "SCREEN_SUBMITTED", responses: [] });
        break;
      }

      case "TOURNAMENT": {
        const round = state.tournamentRounds[state.currentTournamentRound];
        const task = round.tasks[state.currentTournamentTask];
        const utilities = task.concepts.map((c) =>
          conceptUtility(c, config, trueUtilities, noiseRNG, noise),
        );
        const maxU = Math.max(...utilities);
        const tied = task.concepts.filter(
          (_, i) => Math.abs(utilities[i] - maxU) <= TIE_TOLERANCE,
        );
        const winner =
          tied.length === 1 ? tied[0] : tieRNG.pick(tied);
        engine.submitEvent({
          type: "TOURNAMENT_TASK_SUBMITTED",
          matchupId: `r${state.currentTournamentRound}-t${state.currentTournamentTask}`,
          chosenConceptId: winner.id,
        });
        break;
      }

      case "CALIBRATION": {
        const calibrationConcept = state.byoConcept;
        let purchaseIntent = 3;
        if (calibrationEnabled && calibrationConcept) {
          const allConcepts = [calibrationConcept, ...state.conceptPool];
          const utils = allConcepts.map((c) =>
            conceptUtility(c, config, trueUtilities),
          );
          const min = Math.min(...utils);
          const max = Math.max(...utils);
          const range = max - min || 1;
          const u = conceptUtility(calibrationConcept, config, trueUtilities);
          const normalized = (u - min) / range;
          purchaseIntent = Math.max(1, Math.min(5, Math.round(1 + 4 * normalized)));
        }
        engine.submitEvent({
          type: "CALIBRATION_SUBMITTED",
          answer: {
            conceptId: calibrationConcept?.id ?? "byo-concept",
            purchaseIntent,
          },
        });
        break;
      }

      default:
        // Unknown phase; break to avoid infinite loop.
        throw new Error(`Unhandled phase: ${state.phase}`);
    }
  }

  const finalState = engine.getState();
  const eventLog = storage.load() ?? { events: [], initialState: finalState };
  return {
    studyId,
    respondentId,
    eventLog,
    finalState,
    trueUtilities,
  };
}

/**
 * Simulate a cohort of N robotic respondents and produce an aggregate report.
 */
export function simulateCohort(
  config: StudyConfig,
  n: number,
  options: RoboticRespondentOptions = {},
): CohortReport {
  const runs: RespondentRun[] = [];
  for (let i = 0; i < n; i++) {
    const respondentOptions: RoboticRespondentOptions = {
      ...options,
      seed: options?.seed ? `${options.seed}-${i}` : `${DEFAULT_SEED}-${i}`,
    };
    runs.push(
      simulateRespondent(
        "cohort-study",
        `robotic-${i}`,
        config,
        respondentOptions,
      ),
    );
  }

  const avgScreeningResponses =
    runs.reduce((sum, r) => sum + r.finalState.screened.length, 0) / runs.length;

  const avgTournamentTasks =
    runs.reduce(
      (sum, r) =>
        sum + r.finalState.tournamentRounds.reduce((t, round) => t + round.tasks.length, 0),
      0,
    ) / runs.length;

  const calibrationAnswers = runs
    .map((r) => r.finalState.calibration?.purchaseIntent)
    .filter((v): v is number => v != null);

  const summary: CohortReport["summary"] = {
    avgScreeningResponses,
    avgTournamentTasks,
  };

  if (options.calibrationEnabled !== false && calibrationAnswers.length > 0) {
    summary.avgCalibration =
      calibrationAnswers.reduce((a, b) => a + b, 0) / calibrationAnswers.length;
  }

  return { runs, summary };
}
