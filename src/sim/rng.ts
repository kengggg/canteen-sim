/** Stream ids (spec §8.2). */
export const STREAM = {
  arrival: 1, size: 2, accept: 3, reserve: 4, object: 5, service: 6,
  eat: 7, stallNoise: 8, stallRank: 9, route: 10, batchSeed: 11,
} as const;

/** murmur3 32-bit finaliser; returns a uint32. */
export function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** h(seed, stream, a, b) from spec §8.1; returns a uint32. */
export function hash4(seed: number, stream: number, a: number, b = 0): number {
  const inner = fmix32(a ^ fmix32(b >>> 0));
  const mid = fmix32(Math.imul(stream, 0x9e3779b1) ^ inner);
  return fmix32((seed ^ mid) >>> 0);
}

/** u(stream, a, b) in the open interval (0, 1). */
export function uniform(seed: number, stream: number, a: number, b = 0): number {
  return (hash4(seed, stream, a, b) + 0.5) / 4294967296;
}
