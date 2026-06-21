import { SeededRNG } from "../core/prng.js";

export type LevelCounts = Record<string, Record<string, number>>;

export interface LevelBalancer {
  record(attributeId: string, levelId: string): void;
  getCounts(): LevelCounts;
  selectLevel(allowedLevels: readonly string[]): string;
  reset(): void;
}

export interface BalancerOptions {
  rng: SeededRNG;
}

export function createBalancer(
  attributes: readonly { id: string; levels: readonly { id: string }[] }[],
  options: BalancerOptions
): LevelBalancer {
  const { rng } = options;

  const counts: LevelCounts = {};
  for (const attr of attributes) {
    counts[attr.id] = {};
    for (const level of attr.levels) {
      counts[attr.id][level.id] = 0;
    }
  }

  function record(attributeId: string, levelId: string): void {
    if (counts[attributeId] && counts[attributeId][levelId] !== undefined) {
      counts[attributeId][levelId]++;
    }
  }

  function getCounts(): LevelCounts {
    return counts;
  }

  function selectLevel(allowedLevels: readonly string[]): string {
    if (allowedLevels.length === 0) {
      throw new Error("selectLevel: allowedLevels must not be empty");
    }

    const weighted = allowedLevels.map((levelId) => ({
      levelId,
      weight: 1 / (countsForLevel(levelId) + 1),
    }));

    const total = weighted.reduce((sum, w) => sum + w.weight, 0);
    let r = rng.next() * total;

    for (const w of weighted) {
      r -= w.weight;
      if (r <= 0) {
        return w.levelId;
      }
    }

    return weighted[weighted.length - 1].levelId;
  }

  function countsForLevel(levelId: string): number {
    for (const attrCounts of Object.values(counts)) {
      if (attrCounts[levelId] !== undefined) {
        return attrCounts[levelId];
      }
    }
    return 0;
  }

  function reset(): void {
    for (const attrId of Object.keys(counts)) {
      for (const levelId of Object.keys(counts[attrId])) {
        counts[attrId][levelId] = 0;
      }
    }
  }

  return { record, getCounts, selectLevel, reset };
}
