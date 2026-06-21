import type { EngineState, StudyConfig } from "./types.js";
import type { EngineEvent } from "./events.js";
import { parseEvent } from "./events.js";
import { reduce } from "./reducer.js";

export interface PersistedEvent {
  event: EngineEvent;
  eventVersion: number;
  timestamp: number;
}

export interface EventLog {
  events: PersistedEvent[];
  initialState: EngineState;
}

export interface EventStorage {
  load(): EventLog | null;
  save(log: EventLog): void;
  clear(): void;
}

export class MemoryStorage implements EventStorage {
  private log: EventLog | null = null;
  load(): EventLog | null { return this.log; }
  save(log: EventLog): void { this.log = log; }
  clear(): void { this.log = null; }
}

export class SessionStorageAdapter implements EventStorage {
  private key: string;
  constructor(key: string = "acbc-event-log") { this.key = key; }
  load(): EventLog | null {
    try {
      const raw = sessionStorage.getItem(this.key);
      if (!raw) return null;
      return JSON.parse(raw) as EventLog;
    } catch { return null; }
  }
  save(log: EventLog): void { sessionStorage.setItem(this.key, JSON.stringify(log)); }
  clear(): void { sessionStorage.removeItem(this.key); }
}

export function createEventLog(initialState: EngineState): EventLog {
  return { events: [], initialState };
}

export function saveEvent(log: EventLog, event: EngineEvent, currentState: EngineState): EventLog {
  return {
    ...log,
    events: [...log.events, { event, eventVersion: currentState.eventVersion, timestamp: Date.now() }],
  };
}

export function replay(log: EventLog, config: StudyConfig): EngineState {
  let state = log.initialState;
  for (const persisted of log.events) {
    const event = parseEvent(persisted.event);
    state = reduce(state, event, config);
  }
  return state;
}

export function migrateEvent(event: unknown, _fromVersion: number, _toVersion: number): EngineEvent {
  return parseEvent(event);
}
