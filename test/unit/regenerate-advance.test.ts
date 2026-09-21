import { describe, it, expect } from "vitest";
import { ACBCEngine } from "../../src/index.js";
import { advancePastTransientPhases } from "../../src/server.js";
import { serializeStateToQualtricsTask } from "../../src/integration/qualtrics-adapter.js";
import { grcConfig } from "../../src/configs/grc.js";
import { parseConfig } from "../../src/core/config.js";

const config = parseConfig(grcConfig);

// Build an engine sitting in SCREENING with a real concept pool, then force the
// must-have confirm path so the next reduce lands on the transient REGENERATE phase.
function engineAtConfirmMustHave(): ACBCEngine {
  const engine = new ACBCEngine("grc", "r", grcConfig, "seed-regen");
  engine.start();
  const byo: Record<string, string> = {};
  for (const a of config.study.attributes) {
    if (a.in_byo) byo[a.id] = a.levels[0].id;
  }
  engine.submitEvent({ type: "BYO_SUBMITTED", answers: byo });

  const state = engine.getState();
  const attr = config.study.attributes.find((a) => a.in_byo)!;
  engine.loadState({
    ...state,
    phase: "CONFIRM_MUST_HAVE",
    candidateRule: {
      kind: "mustHave",
      attributeId: attr.id,
      levelId: attr.levels[0].id,
      confirmedAtScreen: 3,
    },
  });
  return engine;
}

describe("REGENERATE is transient in the HTTP flow", () => {
  it("confirming a rule leaves the engine in REGENERATE (the phase the client cannot answer)", () => {
    const engine = engineAtConfirmMustHave();
    const after = engine.submitEvent({ type: "RULE_CONFIRMED" });
    expect(after.phase).toBe("REGENERATE");
  });

  it("advancePastTransientPhases moves REGENERATE forward to a respondent-answerable task", () => {
    const engine = engineAtConfirmMustHave();
    engine.submitEvent({ type: "RULE_CONFIRMED" });
    expect(engine.getState().phase).toBe("REGENERATE");

    const advanced = advancePastTransientPhases(engine);
    expect(advanced.phase).not.toBe("REGENERATE");
    expect(advanced.phase).toBe("SCREENING");

    // The serialised task must be one the survey shell can actually render and submit.
    const task = serializeStateToQualtricsTask(advanced, config);
    expect(task.taskType).toBe("screening");
    expect(task.done).toBe(false);
  });
});
