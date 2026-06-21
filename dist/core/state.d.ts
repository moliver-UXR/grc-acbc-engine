import type { EngineState, StudyConfig } from "./types.js";
import type { EngineEvent } from "./events.js";
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
export declare class MemoryStorage implements EventStorage {
    private log;
    load(): EventLog | null;
    save(log: EventLog): void;
    clear(): void;
}
export declare class SessionStorageAdapter implements EventStorage {
    private key;
    constructor(key?: string);
    load(): EventLog | null;
    save(log: EventLog): void;
    clear(): void;
}
export declare function createEventLog(initialState: EngineState): EventLog;
export declare function saveEvent(log: EventLog, event: EngineEvent, currentState: EngineState): EventLog;
export declare function replay(log: EventLog, config: StudyConfig): EngineState;
export declare function migrateEvent(event: unknown, _fromVersion: number, _toVersion: number): EngineEvent;
