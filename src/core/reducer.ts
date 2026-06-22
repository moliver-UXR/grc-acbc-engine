import type { EngineState, Phase, Concept, CutoffRule, ScreeningResponse, StudyConfig, TournamentRound } from "./types.js";
import type { EngineEvent } from "./events.js";
import { SeededRNG } from "./prng.js";
import { generateNearNeighborPool } from "../design/generator.js";
import { detectCandidateRule } from "../detection/cutoff.js";
import { regeneratePool } from "../design/replacement.js";

export function createInitialState(
  studyId: string,
  respondentId: string,
  _config: StudyConfig,
  seed: string
): EngineState {
  return {
    respondentId,
    studyId,
    phase: "BYO",
    rngSeed: seed,
    byoConcept: null,
    conceptPool: [],
    screened: [],
    candidateRule: null,
    confirmedRules: [],
    survivingConceptIds: [],
    tournamentRounds: [],
    currentTournamentRound: 0,
    currentTournamentTask: 0,
    calibration: null,
    eventVersion: 1,
  };
}

function buildByoConcept(answers: Record<string, string>): Concept {
  return { id: "byo-concept", levels: { ...answers }, source: "BYO" };
}

function screeningComplete(screened: ScreeningResponse[], config: StudyConfig): boolean {
  return screened.length >= config.study.design.total_screening_screens * config.study.design.screens_per_concept_batch;
}

function collectSurvivors(screened: ScreeningResponse[]): string[] {
  return screened.filter(s => s.possible).map(s => s.conceptId);
}

function makeTriples<T>(items: T[]): T[][] {
  const triples: T[][] = [];
  for (let i = 0; i < items.length; i += 3) triples.push(items.slice(i, i + 3));
  return triples;
}

function sharedAttributes(concepts: Concept[]): string[] {
  if (concepts.length === 0) return [];
  const keys = Object.keys(concepts[0].levels);
  return keys.filter(k => concepts.every(c => c.levels[k] === concepts[0].levels[k]));
}

function buildTournament(survivorIds: string[], pool: Concept[], seed: string): TournamentRound[] {
  const rng = new SeededRNG(seed + "-tournament");
  const concepts = survivorIds.map(id => pool.find(c => c.id === id)).filter((c): c is Concept => c !== null);
  const shuffled = rng.shuffle(concepts);
  const rounds: TournamentRound[] = [];
  let current = makeTriples(shuffled);
  let round = 1;
  while (current.length > 0) {
    rounds.push({
      round,
      tasks: current.map(triple => ({
        concepts: triple as [Concept, Concept, Concept],
        grayedAttributes: sharedAttributes(triple),
        winnerConceptId: null,
      })),
    });
    if (current.length <= 1) break;
    const placeholders = current.map((_, i) => ({ id: `winner-r${round}-${i}`, levels: {}, source: "TOURNAMENT" as const }));
    current = makeTriples(placeholders);
    round++;
  }
  return rounds;
}

function mapRuleToPhase(rule: CutoffRule): Phase {
  return rule.kind === "mustHave" ? "CONFIRM_MUST_HAVE" : "CONFIRM_UNACCEPTABLE";
}

export function reduce(state: EngineState, event: EngineEvent, config?: StudyConfig): EngineState {
  switch (state.phase) {
    case "BYO":
      if (event.type === "BYO_SUBMITTED" && config) {
        const byo = buildByoConcept(event.answers);
        const rng = new SeededRNG(state.rngSeed);
        const pool = generateNearNeighborPool(byo, state.confirmedRules, config, rng);
        return { ...state, byoConcept: byo, conceptPool: pool, phase: "SCREENING" };
      }
      return state;
    case "SCREENING":
      if (event.type === "SCREEN_SUBMITTED") {
        const screened = [...state.screened, ...event.responses];
        const candidate = detectCandidateRule(screened, state.conceptPool, state.confirmedRules);
        if (candidate) return { ...state, screened, candidateRule: candidate, phase: mapRuleToPhase(candidate) };
        if (config && screeningComplete(screened, config)) {
          const survivors = collectSurvivors(screened);
          const rounds = buildTournament(survivors, state.conceptPool, state.rngSeed);
          return { ...state, screened, survivingConceptIds: survivors, tournamentRounds: rounds, phase: config.study.phases.tournament ? "TOURNAMENT" : "DONE" };
        }
        return { ...state, screened };
      }
      return state;
    case "CONFIRM_MUST_HAVE":
    case "CONFIRM_UNACCEPTABLE":
      if (event.type === "RULE_CONFIRMED") {
        if (!state.candidateRule) return state;
        return { ...state, confirmedRules: [...state.confirmedRules, state.candidateRule], candidateRule: null, phase: "REGENERATE" };
      }
      if (event.type === "RULE_REJECTED") return { ...state, candidateRule: null, phase: "SCREENING" };
      return state;
    case "REGENERATE":
      if (config && state.byoConcept) {
        const rng = new SeededRNG(state.rngSeed);
        const pool = regeneratePool(state.conceptPool, state.confirmedRules, state.byoConcept, config, rng);
        return { ...state, conceptPool: pool, phase: "SCREENING" };
      }
      return { ...state, phase: "SCREENING" };
    case "TOURNAMENT":
      if (event.type === "TOURNAMENT_TASK_SUBMITTED") {
        const currentTask = state.tournamentRounds[state.currentTournamentRound].tasks[state.currentTournamentTask];
        let winnerId = event.chosenConceptId;
        if (winnerId === null) {
          // FR-4 tie resolution: coin flip using SeededRNG seeded per round+task for determinism
          const rng = new SeededRNG(`${state.rngSeed}-tie-r${state.currentTournamentRound}-t${state.currentTournamentTask}`);
          winnerId = rng.pick(currentTask.concepts).id;
        }
        const rounds = state.tournamentRounds.map((r, idx) => idx !== state.currentTournamentRound ? r : {
          ...r, tasks: r.tasks.map((t, ti) => ti !== state.currentTournamentTask ? t : { ...t, winnerConceptId: winnerId })
        });
        const nextTask = state.currentTournamentTask + 1;
        const cur = rounds[state.currentTournamentRound];
        if (nextTask >= cur.tasks.length) {
          const nextRound = state.currentTournamentRound + 1;
          if (nextRound >= rounds.length) {
            return { ...state, tournamentRounds: rounds, currentTournamentRound: nextRound, phase: config?.study.phases.calibration ? "CALIBRATION" : "DONE" };
          }
          return { ...state, tournamentRounds: rounds, currentTournamentRound: nextRound, currentTournamentTask: 0 };
        }
        return { ...state, tournamentRounds: rounds, currentTournamentTask: nextTask };
      }
      return state;
    case "CALIBRATION":
      if (event.type === "CALIBRATION_SUBMITTED") return { ...state, calibration: event.answer, phase: "DONE" };
      return state;
    case "DONE":
      return state;
    default:
      return state;
  }
}
