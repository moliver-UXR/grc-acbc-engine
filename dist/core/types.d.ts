export type Phase = "BYO" | "SCREENING" | "CONFIRM_MUST_HAVE" | "CONFIRM_UNACCEPTABLE" | "REGENERATE" | "TOURNAMENT" | "CALIBRATION" | "DONE";
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
}
export interface DesignParams {
    T: number;
    Amin: number;
    Amax: number;
    screens_per_concept_batch: number;
    total_screening_screens: number;
    price_variation_pct: number;
    price_rounding: number;
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
    concepts: [Concept, Concept, Concept];
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
