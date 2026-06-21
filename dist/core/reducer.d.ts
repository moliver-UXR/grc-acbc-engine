import type { EngineState, StudyConfig } from "./types.js";
import type { EngineEvent } from "./events.js";
export declare function createInitialState(studyId: string, respondentId: string, _config: StudyConfig, seed: string): EngineState;
export declare function reduce(state: EngineState, event: EngineEvent, config?: StudyConfig): EngineState;
