import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SessionStorage, createEventLog, saveEvent } from "../../src/core/state.js";
import { createInitialState } from "../../src/core/reducer.js";
import { parseConfig } from "../../src/core/config.js";
import sampleStudy from "../fixtures/sample-study.json";

const config = parseConfig(sampleStudy);

// In-memory Storage stub matching the Web Storage API surface used by SessionStorage.
class MemoryStore {
  private map = new Map<string, string>();
  getItem(key: string): string | null { return this.map.has(key) ? this.map.get(key)! : null; }
  setItem(key: string, value: string): void { this.map.set(key, value); }
  removeItem(key: string): void { this.map.delete(key); }
  clear(): void { this.map.clear(); }
}

function installSessionStorage(store: MemoryStore): void {
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    get: () => store,
  });
}

function removeSessionStorage(): void {
  delete (globalThis as { sessionStorage?: unknown }).sessionStorage;
}

describe("SessionStorage", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
    installSessionStorage(store);
  });

  afterEach(() => {
    removeSessionStorage();
  });

  it("save→load round-trips an event log under the composite key", () => {
    const storage = new SessionStorage("study-1", "resp-1");
    const initial = createInitialState("study-1", "resp-1", config, "seed");
    let log = createEventLog(initial);
    log = saveEvent(log, { type: "BYO_SUBMITTED", answers: { brand: "brand_a" } }, initial);

    storage.save(log);
    const loaded = storage.load();

    expect(loaded).not.toBeNull();
    expect(loaded?.events).toHaveLength(1);
    expect(loaded?.events[0].event.type).toBe("BYO_SUBMITTED");
    expect(loaded?.initialState.respondentId).toBe("resp-1");
    // Key shape: acbc:${studyId}:${respondentId}
    expect(store.getItem("acbc:study-1:resp-1")).not.toBeNull();
  });

  it("clear removes the persisted key", () => {
    const storage = new SessionStorage("study-1", "resp-1");
    const initial = createInitialState("study-1", "resp-1", config, "seed");
    storage.save(createEventLog(initial));
    expect(store.getItem("acbc:study-1:resp-1")).not.toBeNull();

    storage.clear();
    expect(store.getItem("acbc:study-1:resp-1")).toBeNull();
    expect(storage.load()).toBeNull();
  });

  it("load returns null when the key is missing", () => {
    const storage = new SessionStorage("study-2", "resp-2");
    expect(storage.load()).toBeNull();
  });

  it("load returns null and save/clear are no-ops when sessionStorage is undefined (Node.js)", () => {
    removeSessionStorage();
    const storage = new SessionStorage("study-3", "resp-3");
    const initial = createInitialState("study-3", "resp-3", config, "seed");
    const log = createEventLog(initial);

    // No-throw; no-op.
    expect(() => storage.save(log)).not.toThrow();
    expect(() => storage.clear()).not.toThrow();
    expect(storage.load()).toBeNull();
  });

  it("isolates logs per study+respondent pair", () => {
    const a = new SessionStorage("study-1", "resp-1");
    const b = new SessionStorage("study-1", "resp-2");
    const initial = createInitialState("study-1", "resp-1", config, "seed");
    a.save(createEventLog(initial));

    expect(a.load()).not.toBeNull();
    expect(b.load()).toBeNull();
  });
});
