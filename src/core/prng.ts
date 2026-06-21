// Deterministic seeded PRNG using sfc32 algorithm
// Reproducible across Node and browser environments

export class SeededRNG {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: string) {
    let h = 1779033703 ^ seed.length;
    for (let i = 0; i < seed.length; i++) {
      h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    this.a = h >>> 0;
    this.b = (h ^ (h >>> 17)) >>> 0;
    this.c = (h ^ (h << 17)) >>> 0;
    this.d = (h ^ (h >>> 15)) >>> 0;
  }

  next(): number {
    this.a >>>= 0; this.b >>>= 0; this.c >>>= 0; this.d >>>= 0;
    let t = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = this.c + (this.c << 3) | 0;
    this.c = (this.c << 21 | this.c >>> 11);
    this.d = (this.d + 1) | 0;
    t = (t + this.d) | 0;
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  randInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  shuffle<T>(array: readonly T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  pick<T>(array: readonly T[]): T {
    return array[Math.floor(this.next() * array.length)];
  }
}

export function createRNG(seed: string): SeededRNG {
  return new SeededRNG(seed);
}
