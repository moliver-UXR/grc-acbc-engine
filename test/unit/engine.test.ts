import { describe, it, expect, vi } from "vitest";
import { ACBCEngine } from "../../src/index.js";
import type { EventStorage, EventLog } from "../../src/core/state.js";
import sampleStudy from "../fixtures/sample-study.json";

class SpyStorage implements EventStorage {
  saved: EventLog | null = null;
  load(): EventLog | null { return this.saved; }
  save(log: EventLog): void { this.saved = log; }
  clear(): void { this.saved = null; }
}

describe("ACBCEngine", () => {
  it("starts in BYO phase", () => {
    const engine = new ACBCEngine("study-1", "resp-1", sampleStudy, "seed");
    const state = engine.start();
    expect(state.phase).toBe("BYO");
    expect(state.respondentId).toBe("resp-1");
  });

  it("transitions through BYO -> SCREENING on submit", () => {
    const engine = new ACBCEngine("study-1", "resp-1", sampleStudy, "seed");
    engine.start();
    const state = engine.submitEvent({
      type: "BYO_SUBMITTED",
      answers: { brand: "brand_a", price: "price_low", color: "color_red" },
    });
    expect(state.phase).toBe("SCREENING");
    expect(engine.getState().phase).toBe("SCREENING");
  });

  it("emits phaseChange and stateChange events", () => {
    const engine = new ACBCEngine("study-1", "resp-1", sampleStudy, "seed");
    const stateChangeSpy = vi.fn();
    const phaseChangeSpy = vi.fn();
    engine.on("stateChange", stateChangeSpy);
    engine.on("phaseChange", phaseChangeSpy);
    engine.start();
    engine.submitEvent({
      type: "BYO_SUBMITTED",
      answers: { brand: "brand_a", price: "price_low", color: "color_red" },
    });
    expect(stateChangeSpy).toHaveBeenCalled();
    expect(phaseChangeSpy).toHaveBeenCalledWith("SCREENING", "BYO", expect.any(Object));
  });

  it("persists event log to storage", () => {
    const storage = new SpyStorage();
    const engine = new ACBCEngine("study-1", "resp-1", sampleStudy, "seed", storage);
    engine.start();
    engine.submitEvent({
      type: "BYO_SUBMITTED",
      answers: { brand: "brand_a", price: "price_low", color: "color_red" },
    });
    expect(storage.saved).not.toBeNull();
    expect(storage.saved?.events).toHaveLength(1);
  });

  it("loads state from event log", () => {
    const storage = new SpyStorage();
    const engine = new ACBCEngine("study-1", "resp-1", sampleStudy, "seed", storage);
    engine.start();
    engine.submitEvent({
      type: "BYO_SUBMITTED",
      answers: { brand: "brand_a", price: "price_low", color: "color_red" },
    });
    const log = storage.saved!;
    const engine2 = new ACBCEngine("study-1", "resp-1", sampleStudy, "seed", storage);
    const restored = engine2.loadEventLog(log);
    expect(restored.phase).toBe("SCREENING");
  });

  it("throws on invalid config", () => {
    expect(() => new ACBCEngine("study-1", "resp-1", { study: {} }, "seed")).toThrow();
  });
});
