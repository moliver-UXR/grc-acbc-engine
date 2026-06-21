import { parseEvent } from "./events.js";
import { reduce } from "./reducer.js";
export class MemoryStorage {
    log = null;
    load() { return this.log; }
    save(log) { this.log = log; }
    clear() { this.log = null; }
}
export class SessionStorageAdapter {
    key;
    constructor(key = "acbc-event-log") { this.key = key; }
    load() {
        try {
            const raw = sessionStorage.getItem(this.key);
            if (!raw)
                return null;
            return JSON.parse(raw);
        }
        catch {
            return null;
        }
    }
    save(log) { sessionStorage.setItem(this.key, JSON.stringify(log)); }
    clear() { sessionStorage.removeItem(this.key); }
}
export function createEventLog(initialState) {
    return { events: [], initialState };
}
export function saveEvent(log, event, currentState) {
    return {
        ...log,
        events: [...log.events, { event, eventVersion: currentState.eventVersion, timestamp: Date.now() }],
    };
}
export function replay(log, config) {
    let state = log.initialState;
    for (const persisted of log.events) {
        const event = parseEvent(persisted.event);
        state = reduce(state, event, config);
    }
    return state;
}
export function migrateEvent(event, _fromVersion, _toVersion) {
    return parseEvent(event);
}
//# sourceMappingURL=state.js.map