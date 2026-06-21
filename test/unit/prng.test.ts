import { describe, it, expect } from "vitest";
import { SeededRNG, createRNG } from "../../src/core/prng.js";

describe("SeededRNG", () => {
  it("produces deterministic values for the same seed", () => {
    const rng1 = new SeededRNG("test-seed-123");
    const rng2 = new SeededRNG("test-seed-123");
    const values1 = Array.from({ length: 10 }, () => rng1.next());
    const values2 = Array.from({ length: 10 }, () => rng2.next());
    expect(values1).toEqual(values2);
  });

  it("produces different values for different seeds", () => {
    const rng1 = new SeededRNG("seed-a");
    const rng2 = new SeededRNG("seed-b");
    const v1 = rng1.next();
    const v2 = rng2.next();
    expect(v1).not.toBe(v2);
  });

  it("randInt returns values within range", () => {
    const rng = new SeededRNG("range-test");
    for (let i = 0; i < 100; i++) {
      const val = rng.randInt(2, 4);
      expect(val).toBeGreaterThanOrEqual(2);
      expect(val).toBeLessThanOrEqual(4);
    }
  });

  it("shuffle preserves elements and is deterministic", () => {
    const rng1 = new SeededRNG("shuffle-test");
    const rng2 = new SeededRNG("shuffle-test");
    const arr = [1, 2, 3, 4, 5, 6, 7, 8];
    const shuffled1 = rng1.shuffle(arr);
    const shuffled2 = rng2.shuffle(arr);
    expect(shuffled1).toEqual(shuffled2);
    expect(shuffled1.sort()).toEqual(arr);
  });

  it("createRNG factory works", () => {
    const rng = createRNG("factory-test");
    expect(typeof rng.next()).toBe("number");
  });
});