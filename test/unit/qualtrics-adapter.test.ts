import { describe, it, expect, beforeEach } from "vitest";
import { parseConfig } from "../../src/core/config.js";
import { grcConfig } from "../../src/configs/grc.js";

describe("grcConfig", () => {
  it("parses without error", () => {
    expect(() => parseConfig(grcConfig)).not.toThrow();
  });

  it("has 8 attributes", () => {
    const parsed = parseConfig(grcConfig);
    expect(parsed.study.attributes).toHaveLength(8);
  });
});

import { ACBCEngine, MemoryStorage } from "../../src/index.js";
import {
  serializeStateToQualtricsTask,
  buildEngineEventFromChoice,
} from "../../src/integration/qualtrics-adapter.js";

describe("serializeStateToQualtricsTask", () => {
  let engine: ACBCEngine;

  beforeEach(() => {
    engine = new ACBCEngine("grc-test", "r-001", grcConfig, "seed-test", new MemoryStorage());
    engine.start();
  });

  it("BYO phase returns taskType=byo with attributes list", () => {
    const task = serializeStateToQualtricsTask(engine.getState(), engine.getConfig());
    expect(task.taskType).toBe("byo");
    expect(task.attributes).toHaveLength(6); // in_byo=true attributes only
    expect(task.phase).toBe("BYO");
    expect(task.done).toBe(false);
  });

  it("round-trips: built event from BYO choice advances to SCREENING", () => {
    const task = serializeStateToQualtricsTask(engine.getState(), engine.getConfig());
    const byoChoices: Record<string, string> = {};
    for (const attr of task.attributes!) {
      byoChoices[attr.id] = attr.levels[0].id;
    }
    const event = buildEngineEventFromChoice(engine.getState(), "byo-0", byoChoices);
    const newState = engine.submitEvent(event);
    expect(newState.phase).toBe("SCREENING");
  });
});

describe("buildEngineEventFromChoice", () => {
  it("screening choice builds SCREEN_SUBMITTED event", () => {
    const engine = new ACBCEngine("grc-test", "r-002", grcConfig, "seed-screen", new MemoryStorage());
    engine.start();
    const byoChoices: Record<string, string> = {
      regulatory_framework: "multi",
      deployment: "tenant_isolated",
      ai_autonomy: "ai_executes_approved",
      tprm: "full_tprm",
      time_to_value: "30_90",
      integrations: "broad_ootb",
    };
    engine.submitEvent({ type: "BYO_SUBMITTED", answers: byoChoices });
    expect(engine.getState().phase).toBe("SCREENING");

    const task = serializeStateToQualtricsTask(engine.getState(), engine.getConfig());
    const conceptIds = task.concepts!.map((c) => c.id);
    const screeningChoices: Record<string, string> = {};
    for (const id of conceptIds) screeningChoices[id] = "possible";
    const event = buildEngineEventFromChoice(engine.getState(), task.taskId, screeningChoices);
    expect(event.type).toBe("SCREEN_SUBMITTED");
  });
});
