export declare class SeededRNG {
    private a;
    private b;
    private c;
    private d;
    constructor(seed: string);
    next(): number;
    randInt(min: number, max: number): number;
    shuffle<T>(array: readonly T[]): T[];
    pick<T>(array: readonly T[]): T;
}
export declare function createRNG(seed: string): SeededRNG;
