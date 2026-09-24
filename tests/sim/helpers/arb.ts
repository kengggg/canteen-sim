import fc from 'fast-check';
import { defaultConfig, type Config } from '../../../src/config/schema';

const step = (lo: number, hi: number, st: number) => fc.integer({ min: 0, max: Math.round((hi - lo) / st) }).map((i) => Math.round((lo + i * st) * 1000) / 1000);

/** Small random configs within spec §13.3 bounds (≤ 400 people, ≤ 6 × 6 tables, ≤ 90 min windows). */
export const smallConfigArb: fc.Arbitrary<{ cfg: Config; fraction: number }> = fc
  .record({
    cols: fc.integer({ min: 3, max: 6 }),
    rows: fc.integer({ min: 1, max: 6 }),
    k: fc.integer({ min: 2, max: 4 }),
    va: step(0.6, 3, 0.05),
    ha: step(0.6, 3, 0.05),
    stalls: fc.integer({ min: 1, max: 12 }),
    qd: step(3.2, 10, 0.1),
    people: fc.integer({ min: 2, max: 8 }).map((x) => x * 50),
    window: fc.integer({ min: 6, max: 18 }).map((x) => x * 5),
    peakAt: fc.double({ min: 0, max: 1, noNaN: true }),
    peakShare: step(0, 1, 0.05),
    spread: fc.integer({ min: 5, max: 60 }),
    mix: fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 6, maxLength: 6 }),
    fraction: step(0, 1, 0.05),
    together: fc.boolean(),
    limit: fc.integer({ min: 0, max: 60 }).map((x) => x * 5),
    shareMin: fc.integer({ min: 1, max: 8 }),
    shareMax: fc.integer({ min: 1, max: 6 }),
    service: step(0.25, 10, 0.05),
    scv: step(0, 1.5, 0.05),
    skew: step(0, 2, 0.1),
    aversion: step(0, 5, 0.1),
    eat: fc.integer({ min: 3, max: 60 }),
    ecv: step(0, 1, 0.05),
    linger: fc.integer({ min: 0, max: 30 }),
    walk: step(0.5, 2, 0.05),
    tray: step(0.3, 2, 0.05),
    vis: fc.integer({ min: 2, max: 100 }),
    patience: step(0.5, 30, 0.5),
    parallel: fc.boolean(),
    detour: fc.integer({ min: 0, max: 40 }),
    drop: fc.integer({ min: 1, max: 60 }),
    slots: fc.integer({ min: 1, max: 10 }),
    seed: fc.nat(),
  })
  .map((r) => {
    const c = defaultConfig();
    c.seed = r.seed;
    c.layout = { cols: r.cols, rows: r.rows, seatsPerSide: r.k, verticalAisle: r.va, horizontalAisle: r.ha, stallCount: r.stalls, queueDepth: r.qd };
    const mix = r.mix.map((w, i) => (i + 1 > 2 * r.k ? 0 : w)) as Config['crowd']['groupMix'];
    if (mix.every((w) => w === 0)) mix[0] = 1;
    c.crowd = {
      totalPeople: r.people, windowStart: 660, windowEnd: 660 + r.window,
      peakTime: 660 + 5 * Math.round((r.peakAt * r.window) / 5), peakShare: r.peakShare, peakSpread: r.spread * 60, groupMix: mix,
    };
    c.reserve = { percentA: r.fraction, claimMode: r.together ? 'together' : 'oneClaimer', claimSearchLimit: r.limit, shareMinEmpty: Math.min(r.shareMin, 2 * r.k), shareMaxParty: r.shareMax };
    c.stalls = { serviceMean: r.service * 60, serviceCV: r.scv, popularitySkew: r.skew, queueAversion: r.aversion };
    c.eat = { mean: r.eat * 60, cv: r.ecv, linger: r.linger * 60 };
    c.move = { walkSpeed: r.walk, traySpeed: r.tray };
    c.search = { visibility: r.vis, patience: r.patience * 60, parallel: r.parallel, emptyTableDetour: r.detour };
    c.tray = { dropTime: r.drop, slots: r.slots };
    return { cfg: c, fraction: r.fraction };
  });

export const offeredLoad = (c: Config) => (c.crowd.totalPeople * c.stalls.serviceMean) / (c.layout.stallCount * (c.crowd.windowEnd - c.crowd.windowStart) * 60);
