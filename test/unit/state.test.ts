import { describe, it, expect } from "vitest";
import { createEventLog, saveEvent, replay, MemoryStorage } from "../../src/core/state.js";
import { createInitialState, reduce } from "../../src/core/reducer.js";
import { parseConfig } from "../../src/core/config.js";
import sampleStudy from "../fixtures/sample-study.json";

const config = parseConfig(sampleStudy);

describe("EventLog", () => {
  it("creates an empty event log", () => {
    const initial = createInitialState("s", "r", config, "seed");
    const log = createEventLog(initial);
    expect(log.events).toEqual([]);
    expect(log.initialState).toEqual(initial);
  });

  it("saveEvent appends to log", () => {
    const initial = createInitialState("s", "r", config, "seed");
    let log = createEventLog(initial);
    log = saveEvent(log, { type: "BYO_SUBMITTED", answers: { brand: "brand_a" } }, initial);
    expect(log.events).toHaveLength(1);
    expect(log.events[0].event.type).toBe("BYO_SUBMITTED");
  });

  it("replay reproduces the same state", () => {
    const seed = "replay-test-seed";
    const initial = createInitialState("s", "r", config, seed);
    let state = initial;
    const byoEvent = { type: "BYO_SUBMITTED" as const, answers: { brand: "brand_a", price: "price_low", color: "color_red" } };
    state = reduce(state, byoEvent, config);
    const screenEvent = { type: "SCREEN_SUBMITTED" as const, responses: state.conceptPool.slice(0, 6).map((c, i) => ({
      conceptId: c.id, possible: i % 2 === 0, screenIndex: Math.floor(i / 3),
    }))};
    state = reduce(state, screenEvent, config);
    let log = createEventLog(initial);
    log = saveEvent(log, byoEvent, initial);
    log = saveEvent(log, screenEvent, reduce(initial, byoEvent, config));
    const replayed = replay(log, config);
    expect(replayed.phase).toBe(state.phase);
    expect(replayed.conceptPool.length).toBe(state.conceptPool.length);
    expect(replayed.screened.length).toBe(state.screened.length);
  });
});

describe("MemoryStorage", () => {
  it("saves and loads event logs", () => {
    const storage = new MemoryStorage();
    const initial = createInitialState("s", "r", config, "seed");
    let log = createEventLog(initial);
    log = saveEvent(log, { type: "BYO_SUBMITTED", answers: {} }, initial);
    storage.save(log);
    const loaded = storage.load();
    expect(loaded).not.toBeNull();
    expect(loaded?.events).toHaveLength(1);
  });

  it("clears storage", () => {
    const storage = new MemoryStorage();
    const initial = createInitialState("s", "r", config, "seed");
    storage.save(createEventLog(initial));
    storage.clear();
    expect(storage.load()).toBeNull();
  });
});
