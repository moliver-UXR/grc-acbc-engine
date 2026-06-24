import type { EngineState, StudyConfig } from "../core/types.js";
import type { EngineEvent } from "../core/events.js";

export interface QualtricsTaskAttribute {
  id: string;
  label: string;
  levels: Array<{ id: string; label: string }>;
}

export interface QualtricsTaskConcept {
  id: string;
  attributes: Array<{ id: string; label: string; level: string; levelId: string }>;
}

export interface QualtricsTaskCandidateRule {
  kind: "mustHave" | "unacceptable";
  attributeId: string;
  attributeLabel: string;
  levelId: string;
  levelLabel: string;
}

export interface QualtricsTask {
  taskId: string;
  taskType: "byo" | "screening" | "confirm" | "tournament" | "calibration";
  phase: string;
  iteration: number;
  prompt: string;
  done: boolean;
  attributes?: QualtricsTaskAttribute[];
  concepts?: QualtricsTaskConcept[];
  grayedAttributes?: string[];
  candidateRule?: QualtricsTaskCandidateRule;
  winnerConcept?: QualtricsTaskConcept;
}

/**
 * Converts the current EngineState into a flat QualtricsTask object that the
 * Qualtrics survey shell can JSON-parse and render without knowing engine internals.
 */
export function serializeStateToQualtricsTask(
  state: EngineState,
  config: StudyConfig
): QualtricsTask {
  const attrs = config.study.attributes;

  if (state.phase === "DONE") {
    return { taskId: "done", taskType: "calibration", phase: "DONE", iteration: 0, prompt: "", done: true };
  }

  // BYO: return all in_byo attributes as dropdowns so the respondent can build their ideal concept.
  if (state.phase === "BYO") {
    const byoAttrs = attrs.filter((a) => a.in_byo);
    return {
      taskId: "byo-0",
      taskType: "byo",
      phase: "BYO",
      iteration: 0,
      prompt: "Select your preferred option for each feature to build your ideal GRC platform.",
      done: false,
      attributes: byoAttrs.map((a) => ({
        id: a.id,
        label: a.label,
        levels: a.levels.map((l) => ({ id: l.id, label: l.label })),
      })),
    };
  }

  // SCREENING: slice the next unseen batch from the concept pool, excluding already-screened concepts.
  if (state.phase === "SCREENING") {
    // screenedIds excludes concepts the respondent has already rated (possible/not-possible),
    // so each concept is shown exactly once regardless of how many batches have been presented.
    const screenedIds = new Set(state.screened.map((s) => s.conceptId));
    const batch = state.conceptPool
      .filter((c) => !screenedIds.has(c.id))
      .slice(0, config.study.design.screens_per_concept_batch);

    return {
      taskId: `screen-${state.screened.length}`,
      taskType: "screening",
      phase: "SCREENING",
      iteration: state.screened.length,
      prompt: "For each platform concept below, indicate whether it is something you could possibly purchase.",
      done: false,
      concepts: batch.map((concept) => ({
        id: concept.id,
        attributes: attrs.map((a) => {
          const levelId = concept.levels[a.id];
          const level = a.levels.find((l) => l.id === levelId);
          return { id: a.id, label: a.label, level: level?.label ?? "—", levelId: levelId ?? "" };
        }),
      })),
    };
  }

  // CONFIRM: present a single yes/no question asking whether the detected cutoff rule is intentional.
  if (state.phase === "CONFIRM_MUST_HAVE" || state.phase === "CONFIRM_UNACCEPTABLE") {
    const rule = state.candidateRule;
    if (!rule) throw new Error("candidateRule missing during CONFIRM phase");
    const attr = attrs.find((a) => a.id === rule.attributeId);
    const level = attr?.levels.find((l) => l.id === rule.levelId);
    return {
      taskId: `confirm-${rule.kind}-${rule.attributeId}`,
      taskType: "confirm",
      phase: state.phase,
      iteration: state.screened.length,
      prompt: rule.kind === "mustHave"
        ? `It looks like you only accepted concepts where ${attr?.label} is "${level?.label}". Is this a must-have for you?`
        : `It looks like you rejected every concept where ${attr?.label} is "${level?.label}". Is this a deal-breaker?`,
      done: false,
      candidateRule: {
        kind: rule.kind,
        attributeId: rule.attributeId,
        attributeLabel: attr?.label ?? rule.attributeId,
        levelId: rule.levelId,
        levelLabel: level?.label ?? rule.levelId,
      },
    };
  }

  // TOURNAMENT: render the current matchup task from the bracket.
  if (state.phase === "TOURNAMENT") {
    const currentRound = state.tournamentRounds[state.currentTournamentRound];
    if (!currentRound) throw new Error("No tournament round found");
    const currentTask = currentRound.tasks[state.currentTournamentTask];
    if (!currentTask) throw new Error("No tournament task found");

    return {
      taskId: `tournament-r${state.currentTournamentRound}-t${state.currentTournamentTask}`,
      taskType: "tournament",
      phase: "TOURNAMENT",
      iteration: state.currentTournamentRound * 10 + state.currentTournamentTask,
      prompt: "Which platform would you most prefer to purchase?",
      done: false,
      grayedAttributes: currentTask.grayedAttributes,
      concepts: currentTask.concepts.map((concept) => ({
        id: concept.id,
        attributes: attrs.map((a) => {
          const levelId = concept.levels[a.id];
          const level = a.levels.find((l) => l.id === levelId);
          return { id: a.id, label: a.label, level: level?.label ?? "—", levelId: levelId ?? "" };
        }),
      })),
    };
  }

  // CALIBRATION: show the tournament winner and ask for purchase-intent on a 1-5 scale.
  if (state.phase === "CALIBRATION") {
    const lastRound = state.tournamentRounds[state.tournamentRounds.length - 1];
    const lastTask = lastRound?.tasks[lastRound.tasks.length - 1];
    const winnerId = lastTask?.winnerConceptId;
    const winner = state.conceptPool.find((c) => c.id === winnerId);

    return {
      taskId: "calibration-0",
      taskType: "calibration",
      phase: "CALIBRATION",
      iteration: 0,
      prompt: "How likely would you be to purchase this platform configuration?",
      done: false,
      winnerConcept: winner
        ? {
            id: winner.id,
            attributes: attrs.map((a) => {
              const levelId = winner.levels[a.id];
              const level = a.levels.find((l) => l.id === levelId);
              return { id: a.id, label: a.label, level: level?.label ?? "—", levelId: levelId ?? "" };
            }),
          }
        : undefined,
    };
  }

  // REGENERATE: the engine is rebuilding the concept pool after a confirmed cutoff rule.
  // Return a screening-shaped placeholder so the Qualtrics shell has a valid task object
  // to write to Embedded Data while the Web Service call is pending.
  return {
    taskId: "regenerate",
    taskType: "screening",
    phase: state.phase,
    iteration: state.screened.length,
    prompt: "Please wait while we update your survey.",
    done: false,
    concepts: [],
  };
}

export function buildEngineEventFromChoice(
  state: EngineState,
  taskId: string,
  choice: Record<string, string>
): EngineEvent {
  if (state.phase === "BYO") {
    return { type: "BYO_SUBMITTED", answers: choice };
  }

  if (state.phase === "SCREENING") {
    const responses = Object.entries(choice).map(([conceptId, value], i) => ({
      conceptId,
      possible: value === "possible",
      screenIndex: state.screened.length + i,
    }));
    return { type: "SCREEN_SUBMITTED", responses };
  }

  if (state.phase === "CONFIRM_MUST_HAVE" || state.phase === "CONFIRM_UNACCEPTABLE") {
    const decision = choice["confirm_decision"];
    if (decision === "confirm") return { type: "RULE_CONFIRMED" };
    return { type: "RULE_REJECTED" };
  }

  if (state.phase === "TOURNAMENT") {
    const chosenConceptId = choice["tournament_choice"] ?? null;
    const matchupId = taskId;
    return { type: "TOURNAMENT_TASK_SUBMITTED", matchupId, chosenConceptId };
  }

  if (state.phase === "CALIBRATION") {
    const purchaseIntent = parseInt(choice["purchase_intent"] ?? "3", 10);
    const lastRound = state.tournamentRounds[state.tournamentRounds.length - 1];
    const lastTask = lastRound?.tasks[lastRound.tasks.length - 1];
    const conceptId = lastTask?.winnerConceptId ?? "";
    return { type: "CALIBRATION_SUBMITTED", answer: { conceptId, purchaseIntent } };
  }

  throw new Error(`Cannot build event for phase ${state.phase}`);
}
