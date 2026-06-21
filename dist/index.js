// ACBC Engine — Public API entry point
import { createInitialState, reduce } from "./core/reducer.js";
import { createEventLog, saveEvent, replay, MemoryStorage } from "./core/state.js";
import { parseConfig } from "./core/config.js";
export class ACBCEngine {
    studyId;
    respondentId;
    config;
    seed;
    state;
    log;
    storage;
    listeners = new Map();
    constructor(studyId, respondentId, config, seed, storage) {
        this.studyId = studyId;
        this.respondentId = respondentId;
        this.config = parseConfig(config);
        this.seed = seed;
        this.storage = storage ?? new MemoryStorage();
        this.state = createInitialState(studyId, respondentId, this.config, seed);
        this.log = createEventLog(this.state);
    }
    start() {
        this.persist();
        this.emit("stateChange", this.state);
        return this.state;
    }
    submitEvent(event) {
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
    getState() {
        return this.state;
    }
    getConfig() {
        return this.config;
    }
    loadState(state) {
        this.state = state;
        this.log = createEventLog(state);
        this.persist();
        this.emit("stateChange", this.state);
    }
    loadEventLog(log) {
        this.log = log;
        this.state = replay(log, this.config);
        this.persist();
        this.emit("stateChange", this.state);
        return this.state;
    }
    on(event, handler) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(handler);
    }
    off(event, handler) {
        this.listeners.get(event)?.delete(handler);
    }
    emit(event, ...args) {
        this.listeners.get(event)?.forEach((handler) => {
            try {
                handler(...args);
            }
            catch { }
        });
    }
    persist() {
        this.storage.save(this.log);
    }
}
export { parseConfig } from "./core/config.js";
export { parseEvent } from "./core/events.js";
export { createInitialState, reduce, } from "./core/reducer.js";
export { createEventLog, saveEvent, replay, MemoryStorage, } from "./core/state.js";
// SurveyJS integration adapter
export { renderACBCSurvey, onStateChange, injectACBCStyles, } from "./integration/surveyjs-adapter.js";
//# sourceMappingURL=index.js.map