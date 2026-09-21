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
    rejectedRules: [],
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

/**
 * Chunks survivors into tournament matchup groups of size 2 or 3, never 1.
 * A group of 1 would render as a degenerate matchup (a single concept with
 * nothing to compare it against), so any remainder of 1 from a straight
 * chunk-by-3 is rebalanced by pulling the last 4 items into two groups of 2.
 *
 * N==0 -> []; N<=3 -> one group of N; otherwise chunk by 3, with a
 * remainder of 1 rebalanced into 2+2 (e.g. 4 -> [2,2], 7 -> [3,2,2],
 * 10 -> [3,3,2,2]; a remainder of 2 just trails as its own group of 2,
 * e.g. 5 -> [3,2]).
 *
 * Exported (like buildTournament below) so test/unit/tournament-grouping.test.ts
 * can assert partitions and multi-round shapes directly; both are otherwise
 * internal to the reducer's TOURNAMENT construction.
 */
export function chunkIntoTournamentGroups<T>(items: T[]): T[][] {
  const n = items.length;
  if (n === 0) return [];
  if (n <= 3) return [items.slice()];

  const remainder = n % 3;
  // A remainder of 1 cannot stand on its own (that is the degenerate case
  // this function exists to avoid), so borrow one full triple back and
  // split those 4 items into two pairs instead.
  let numFullTriples = Math.floor(n / 3);
  const sizes: number[] = [];
  if (remainder === 1) {
    numFullTriples -= 1;
    for (let i = 0; i < numFullTriples; i++) sizes.push(3);
    sizes.push(2, 2);
  } else {
    for (let i = 0; i < numFullTriples; i++) sizes.push(3);
    if (remainder === 2) sizes.push(2);
  }

  const groups: T[][] = [];
  let idx = 0;
  for (const size of sizes) {
    groups.push(items.slice(idx, idx + size));
    idx += size;
  }
  return groups;
}

function sharedAttributes(concepts: Concept[]): string[] {
  if (concepts.length === 0) return [];
  const keys = Object.keys(concepts[0].levels);
  return keys.filter(k => concepts.every(c => c.levels[k] === concepts[0].levels[k]));
}

// Exported for direct testing (see the comment on chunkIntoTournamentGroups above).
export function buildTournament(survivorIds: string[], pool: Concept[], seed: string): TournamentRound[] {
  const rng = new SeededRNG(seed + "-tournament");
  const concepts = survivorIds.map(id => pool.find(c => c.id === id)).filter((c): c is Concept => c !== null);
  const shuffled = rng.shuffle(concepts);
  const rounds: TournamentRound[] = [];
  let current = chunkIntoTournamentGroups(shuffled);
  let round = 1;
  while (current.length > 0) {
    rounds.push({
      round,
      tasks: current.map(group => ({
        concepts: group as [Concept, Concept] | [Concept, Concept, Concept],
        grayedAttributes: sharedAttributes(group),
        winnerConceptId: null,
      })),
    });
    if (current.length <= 1) break;
    const placeholders = current.map((_, i) => ({ id: `winner-r${round}-${i}`, levels: {}, source: "TOURNAMENT" as const }));
    current = chunkIntoTournamentGroups(placeholders);
    round++;
  }
  return rounds;
}

function mapRuleToPhase(rule: CutoffRule): Phase {
  return rule.kind === "mustHave" ? "CONFIRM_MUST_HAVE" : "CONFIRM_UNACCEPTABLE";
}

/**
 * The phase to enter once a single concept remains as the tournament
 * champion, with no opponent left to run a matchup against: CALIBRATION if
 * that phase is enabled, DONE otherwise. Shared by both TOURNAMENT-entry
 * sites below (the screening-complete branch and the REGENERATE-exhausted
 * branch) so a future change to this rule cannot be updated at one site and
 * missed at the other.
 */
function championPhase(config: StudyConfig): "CALIBRATION" | "DONE" {
  return config.study.phases.calibration ? "CALIBRATION" : "DONE";
}

/**
 * Whether the concept pool has any concept the respondent has not already
 * rated. Shared by the RULE_REJECTED handler and the REGENERATE branch so a
 * respondent is never parked on a SCREENING task that can present nothing.
 */
function hasUnseenConcept(pool: Concept[], screened: ScreeningResponse[]): boolean {
  const screenedIds = new Set(screened.map((s) => s.conceptId));
  return pool.some((c) => !screenedIds.has(c.id));
}

/**
 * Resolves survivors into a terminal-ish phase: zero survivors ends the
 * study (DONE), a sole survivor becomes the champion directly (no degenerate
 * 1-concept tournament round), and two or more survivors get a tournament
 * bracket. Shared by every site that can end screening (screening-complete,
 * REGENERATE-exhausted, a RULE_REJECTED with nothing left to screen, and a
 * SCREEN_SUBMITTED that exhausts the pool before the completion target) so
 * the finalize decision lives in exactly one place.
 */
function finalizeScreening(state: EngineState, config: StudyConfig): EngineState {
  const survivors = collectSurvivors(state.screened);
  if (survivors.length === 0) {
    return { ...state, survivingConceptIds: [], tournamentRounds: [], phase: "DONE" };
  }
  if (survivors.length === 1) {
    return { ...state, survivingConceptIds: survivors, tournamentRounds: [], phase: championPhase(config) };
  }
  const rounds = buildTournament(survivors, state.conceptPool, state.rngSeed);
  return { ...state, survivingConceptIds: survivors, tournamentRounds: rounds, phase: config.study.phases.tournament ? "TOURNAMENT" : "DONE" };
}

/**
 * Backfill the round that follows a just-completed one. buildTournament seeds
 * every round past the first with placeholder concepts (winner-r{round}-{i},
 * empty levels) because the winners are not known until the earlier round is
 * played. Once a round finishes we resolve those placeholders to the actual
 * winning concepts, so later matchups (and the calibration champion) render real
 * attribute levels instead of the em-dash fallback. grayedAttributes is
 * recomputed against the resolved concepts.
 */
function resolveNextRoundConcepts(
  rounds: TournamentRound[],
  completedRoundIndex: number,
  pool: Concept[]
): TournamentRound[] {
  const nextIndex = completedRoundIndex + 1;
  if (nextIndex >= rounds.length) return rounds;
  const completed = rounds[completedRoundIndex];
  const winners = completed.tasks.map(
    (t) => pool.find((c) => c.id === t.winnerConceptId) ?? null
  );
  const resolve = (concept: Concept): Concept => {
    const m = /^winner-r(\d+)-(\d+)$/.exec(concept.id);
    if (m && Number(m[1]) === completed.round) {
      const winner = winners[Number(m[2])];
      if (winner) return winner;
    }
    return concept;
  };
  return rounds.map((r, idx) =>
    idx !== nextIndex
      ? r
      : {
          ...r,
          tasks: r.tasks.map((t) => {
            const concepts = t.concepts.map(resolve) as [Concept, Concept] | [Concept, Concept, Concept];
            return { ...t, concepts, grayedAttributes: sharedAttributes(concepts) };
          }),
        }
  );
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
        const alreadyHandled = [...state.confirmedRules, ...state.rejectedRules];
        const candidate = detectCandidateRule(screened, state.conceptPool, alreadyHandled);
        if (candidate) return { ...state, screened, candidateRule: candidate, phase: mapRuleToPhase(candidate) };
        if (config && screeningComplete(screened, config)) {
          // No accepted concepts means there is nothing to run a tournament over.
          // buildTournament would return an empty bracket and serializing the
          // TOURNAMENT phase would then throw, so end the ACBC cleanly instead.
          // A sole survivor has no opponent to face in a matchup, so a
          // 1-concept tournament round would be degenerate; finalizeScreening
          // treats it as the champion and goes straight to calibration (or
          // DONE if calibration is off) instead of building a tournament.
          return finalizeScreening({ ...state, screened }, config);
        }
        if (config && !hasUnseenConcept(state.conceptPool, screened)) {
          // Pool exhausted before the completion target: nothing left to
          // present, so finalize survivors instead of stranding the respondent
          // on an empty screening page (mirrors the RULE_REJECTED / REGENERATE
          // guards).
          return finalizeScreening({ ...state, screened }, config);
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
      if (event.type === "RULE_REJECTED") {
        if (!state.candidateRule) return state;
        const rejectedState = {
          ...state,
          rejectedRules: [...state.rejectedRules, state.candidateRule],
          candidateRule: null,
        };
        // A rejected rule must never resurface: with nothing new added to
        // `screened`, the same evidence that produced this candidate would
        // otherwise be re-detected on the very next screening pass. If the
        // pool has no unseen concept left to present, or screening was
        // already complete, there is no meaningful SCREENING task to return
        // to, so finalize survivors now instead of looping forever between
        // CONFIRM_UNACCEPTABLE and an empty SCREENING screen.
        if (config && (!hasUnseenConcept(state.conceptPool, state.screened) || screeningComplete(state.screened, config))) {
          return finalizeScreening(rejectedState, config);
        }
        return { ...rejectedState, phase: "SCREENING" };
      }
      return state;
    case "REGENERATE":
      if (config && state.byoConcept) {
        const rng = new SeededRNG(state.rngSeed);
        const pool = regeneratePool(state.conceptPool, state.confirmedRules, state.byoConcept, config, rng);
        // The confirmed dealbreakers can rule out every buildable concept, or leave
        // only concepts the respondent has already screened. Either way there is
        // nothing new to present, so resolve now rather than parking the respondent
        // on a screening page that can never present a concept or complete. (An
        // all-BYO attribute set thins per-level exposure, so a reject-everything
        // respondent reaches this with a non-empty but fully-seen pool.)
        if (!hasUnseenConcept(pool, state.screened)) {
          // Same degenerate-matchup guard as the screening-complete branch above,
          // via the shared finalizeScreening helper: zero survivors ends the
          // study, a sole survivor becomes the champion directly (no tournament
          // round), and multiple survivors get a tournament bracket.
          return finalizeScreening({ ...state, conceptPool: pool }, config);
        }
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
          const resolved = resolveNextRoundConcepts(rounds, state.currentTournamentRound, state.conceptPool);
          return { ...state, tournamentRounds: resolved, currentTournamentRound: nextRound, currentTournamentTask: 0 };
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
