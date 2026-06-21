// ACBC Engine — Public API entry point

import type { EngineState, StudyConfig } from "./core/types.js";
import type { EngineEvent } from "./core/events.js";
import type { EventLog, EventStorage } from "./core/state.js";
import { createInitialState, reduce } from "./core/reducer.js";
import { createEventLog, saveEvent, replay, MemoryStorage } from "./core/state.js";
import { parseConfig } from "./core/config.js";

export type EngineEventName = "phaseChange" | "stateChange";

export class ACBCEngine {
  private studyId: string;
  private respondentId: string;
  private config: StudyConfig;
  private seed: string;
  private state: EngineState;
  private log: EventLog;
  private storage: EventStorage;
  private listeners: Map<EngineEventName, Set<Function>> = new Map();

  constructor(
    studyId: string,
    respondentId: string,
    config: unknown,
    seed: string,
    storage?: EventStorage
  ) {
    this.studyId = studyId;
    this.respondentId = respondentId;
    this.config = parseConfig(config);
    this.seed = seed;
    this.storage = storage ?? new MemoryStorage();
    this.state = createInitialState(studyId, respondentId, this.config, seed);
    this.log = createEventLog(this.state);
  }

  start(): EngineState {
    this.persist();
    this.emit("stateChange", this.state);
    return this.state;
  }

  submitEvent(event: EngineEvent): EngineState {
    const previousPhase = this.state.phase;
    this.state = reduce(this.state, event, this.config);
    this.log = saveEvent(this.log, event, this.state);
    this.persist();
    this.emit("stateChange", this.state);
    if (this.state.phase !== previousPhase) {
      this.emit("phaseChange", this.state.phase, previousPhase, this.state);
    }
    return this.state;
  }

  getState(): EngineState {
    return this.state;
  }

  getConfig(): StudyConfig {
    return this.config;
  }

  loadState(state: EngineState): void {
    this.state = state;
    this.log = createEventLog(state);
    this.persist();
    this.emit("stateChange", this.state);
  }

  loadEventLog(log: EventLog): EngineState {
    this.log = log;
    this.state = replay(log, this.config);
    this.persist();
    this.emit("stateChange", this.state);
    return this.state;
  }

  on(
    event: EngineEventName,
    handler: (state: EngineState, ...args: any[]) => void
  ): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  off(event: EngineEventName, handler: Function): void {
    this.listeners.get(event)?.delete(handler);
  }

  private emit(event: EngineEventName, ...args: any[]): void {
    this.listeners.get(event)?.forEach((handler) => {
      try {
        handler(...args);
      } catch {}
    });
  }

  private persist(): void {
    this.storage.save(this.log);
  }
}

export { parseConfig } from "./core/config.js";
export { parseEvent } from "./core/events.js";
export {
  createInitialState,
  reduce,
} from "./core/reducer.js";
export {
  createEventLog,
  saveEvent,
  replay,
  MemoryStorage,
} from "./core/state.js";

export type {
  EngineState,
  StudyConfig,
} from "./core/types.js";
export type { EngineEvent } from "./core/events.js";
export type { EventLog } from "./core/state.js";


