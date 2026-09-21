// ACBC Engine — Core Domain Types

export type Phase =
  | "BYO"
  | "SCREENING"
  | "CONFIRM_MUST_HAVE"
  | "CONFIRM_UNACCEPTABLE"
  | "REGENERATE"
  | "TOURNAMENT"
  | "CALIBRATION"
  | "DONE";

export interface Level {
  id: string;
  label: string;
  price_increment?: number;
}

export interface Attribute {
  id: string;
  label: string;
  levels: Level[];
  in_byo: boolean;
  price_type: "none" | "component" | "summed";
  /**
   * When true on a non-BYO attribute, the attribute is still varied across
   * the screening/tournament concept pool (each concept gets a level chosen
   * at random) even though it never appears in the BYO warm-up task.
   */
  vary_in_screening?: boolean;
}

export interface DesignParams {
  T: number;
  Amin: number;
  Amax: number;
  screens_per_concept_batch: number;
  total_screening_screens: number;
  price_variation_pct: number;
  price_rounding: number;
  /**
   * Optional list of prohibited level combinations. Each pair is two
   * {attributeId, levelId} entries that must never co-occur in a generated
   * concept (e.g. on-prem deployment with a cloud-region data residency level).
   */
  prohibited_pairs?: { attributeId: string; levelId: string }[][];
}

export interface EstimationConfig {
  method: "hb" | "mnl" | "monotone_regression";
  price_function: "linear" | "log_linear" | "piecewise";
  piecewise_breakpoints?: number[];
}

export interface PhaseFlags {
  byo: boolean;
  screening: boolean;
  must_have: boolean;
  unacceptable: boolean;
  tournament: boolean;
  calibration: boolean;
}

export interface StudyConfig {
  study: {
    attributes: Attribute[];
    design: DesignParams;
    phases: PhaseFlags;
    estimation: EstimationConfig;
  };
}

export type CutoffKind = "mustHave" | "unacceptable";

export interface CutoffRule {
  kind: CutoffKind;
  attributeId: string;
  levelId: string;
  confirmedAtScreen: number;
}

export type ConceptSource = "BYO" | "SCREENING" | "REPLACEMENT" | "TOURNAMENT";

export interface Concept {
  id: string;
  levels: Record<string, string>;
  price?: number;
  source: ConceptSource;
}

export interface ScreeningResponse {
  conceptId: string;
  possible: boolean;
  screenIndex: number;
}

export interface TournamentTask {
  // A matchup always has 2 or 3 concepts, never 1: a 1-concept group would be
  // a degenerate "choose among options" task with nothing to compare against.
  concepts: [Concept, Concept] | [Concept, Concept, Concept];
  grayedAttributes: string[];
  winnerConceptId: string | null;
}

export interface TournamentRound {
  round: number;
  tasks: TournamentTask[];
}

export interface CalibrationAnswer {
  conceptId: string;
  purchaseIntent: number;
}

export interface EngineState {
  respondentId: string;
  studyId: string;
  phase: Phase;
  rngSeed: string;
  byoConcept: Concept | null;
  conceptPool: Concept[];
  screened: ScreeningResponse[];
  candidateRule: CutoffRule | null;
  confirmedRules: CutoffRule[];
  survivingConceptIds: string[];
  tournamentRounds: TournamentRound[];
  currentTournamentRound: number;
  currentTournamentTask: number;
  calibration: CalibrationAnswer | null;
  eventVersion: number;
}
