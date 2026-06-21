import { describe, it, expect } from "vitest";
import { createBalancer, LevelCounts } from "../../../src/design/balancer.js";
import { SeededRNG } from "../../../src/core/prng.js";

const mockAttributes = [
  { id: "brand", levels: [{ id: "nike" }, { id: "adidas" }, { id: "puma" }] },
  { id: "color", levels: [{ id: "red" }, { id: "blue" }, { id: "green" }] },
];

function makeRNG(seed = "test-seed"): SeededRNG {
  return new SeededRNG(seed);
}

describe("createBalancer", () => {
  it("initializes counts to zero for all attributes and levels", () => {
    const balancer = createBalancer(mockAttributes, { rng: makeRNG() });
    const counts = balancer.getCounts();

    expect(counts["brand"]["nike"]).toBe(0);
    expect(counts["brand"]["adidas"]).toBe(0);
    expect(counts["brand"]["puma"]).toBe(0);
    expect(counts["color"]["red"]).toBe(0);
    expect(counts["color"]["blue"]).toBe(0);
    expect(counts["color"]["green"]).toBe(0);
  });

  it("records level selections and increments counts", () => {
    const balancer = createBalancer(mockAttributes, { rng: makeRNG() });

    balancer.record("brand", "nike");
    balancer.record("brand", "nike");
    balancer.record("brand", "adidas");

    const counts = balancer.getCounts();
    expect(counts["brand"]["nike"]).toBe(2);
    expect(counts["brand"]["adidas"]).toBe(1);
    expect(counts["brand"]["puma"]).toBe(0);
  });

  it("ignores record calls for unknown attributes or levels", () => {
    const balancer = createBalancer(mockAttributes, { rng: makeRNG() });

    balancer.record("unknown", "level");
    balancer.record("brand", "unknown");

    const counts = balancer.getCounts();
    expect(counts["brand"]["nike"]).toBe(0);
  });

  it("selects a level from allowed levels", () => {
    const balancer = createBalancer(mockAttributes, { rng: makeRNG() });
    const selected = balancer.selectLevel(["nike", "adidas", "puma"]);

    expect(["nike", "adidas", "puma"]).toContain(selected);
  });

  it("throws when allowedLevels is empty", () => {
    const balancer = createBalancer(mockAttributes, { rng: makeRNG() });

    expect(() => balancer.selectLevel([])).toThrow(
      "selectLevel: allowedLevels must not be empty"
    );
  });

  it("uses deficit weighting: underrepresented levels are preferred", () => {
    const rng = makeRNG("deterministic-seed");
    const balancer = createBalancer(mockAttributes, { rng });

    balancer.record("brand", "nike");
    balancer.record("brand", "nike");
    balancer.record("brand", "nike");

    const selections: Record<string, number> = { nike: 0, adidas: 0, puma: 0 };
    const iterations = 1000;

    for (let i = 0; i < iterations; i++) {
      const selected = balancer.selectLevel(["nike", "adidas", "puma"]);
      selections[selected]++;
    }

    expect(selections["adidas"]).toBeGreaterThan(selections["nike"]);
    expect(selections["puma"]).toBeGreaterThan(selections["nike"]);
  });

  it("selects uniformly when all counts are equal", () => {
    const rng = makeRNG("uniform-test");
    const balancer = createBalancer(mockAttributes, { rng });

    const selections: Record<string, number> = { red: 0, blue: 0, green: 0 };
    const iterations = 1000;

    for (let i = 0; i < iterations; i++) {
      const selected = balancer.selectLevel(["red", "blue", "green"]);
      selections[selected]++;
    }

    const maxDiff = Math.max(
      Math.abs(selections["red"] - selections["blue"]),
      Math.abs(selections["blue"] - selections["green"]),
      Math.abs(selections["red"] - selections["green"])
    );

    expect(maxDiff).toBeLessThan(100);
  });

  it("resets all counts to zero", () => {
    const balancer = createBalancer(mockAttributes, { rng: makeRNG() });

    balancer.record("brand", "nike");
    balancer.record("brand", "adidas");
    balancer.record("color", "red");

    balancer.reset();

    const counts = balancer.getCounts();
    expect(counts["brand"]["nike"]).toBe(0);
    expect(counts["brand"]["adidas"]).toBe(0);
    expect(counts["color"]["red"]).toBe(0);
  });

  it("works correctly after reset and re-recording", () => {
    const balancer = createBalancer(mockAttributes, { rng: makeRNG() });

    balancer.record("brand", "nike");
    balancer.reset();
    balancer.record("brand", "nike");

    const counts = balancer.getCounts();
    expect(counts["brand"]["nike"]).toBe(1);
  });

  it("selectLevel respects allowed levels subset", () => {
    const balancer = createBalancer(mockAttributes, { rng: makeRNG() });

    balancer.record("brand", "nike");
    const selected = balancer.selectLevel(["adidas", "puma"]);

    expect(["adidas", "puma"]).toContain(selected);
    expect(selected).not.toBe("nike");
  });

  it("deficit weighting works with single allowed level", () => {
    const balancer = createBalancer(mockAttributes, { rng: makeRNG() });

    balancer.record("brand", "nike");
    const selected = balancer.selectLevel(["nike"]);

    expect(selected).toBe("nike");
  });

  it("countsForLevel finds level across attributes", () => {
    const balancer = createBalancer(mockAttributes, { rng: makeRNG() });

    balancer.record("color", "red");
    balancer.record("color", "red");

    const selected = balancer.selectLevel(["red", "blue"]);

    expect(["red", "blue"]).toContain(selected);
  });
});
