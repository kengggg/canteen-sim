import { defaultConfig } from '../../src/config/schema';
import { presetConfig } from '../../src/config/presets';
import { run, SEEDS } from './helpers';

function littlesLaw(s: ReturnType<typeof run>): void {
  const w = s.world;
  const wait = new Float64Array(w.st.S), sojourn = new Float64Array(w.st.S);
  for (let p = 0; p < w.pop.personCount; p++) {
    const st = w.st.chosen[p];
    if (w.st.joinMs[p] < 0) continue;
    wait[st] += w.st.serviceStartMs[p] - w.st.joinMs[p];
    sojourn[st] += w.st.serviceEndMs[p] - w.st.joinMs[p];
  }
  for (let st = 0; st < w.st.S; st++) {
    expect(w.st.accWaiting[st]).toBe(wait[st]);
    expect(w.st.accInSlot[st]).toBe(sojourn[st]);
  }
}

test.each(SEEDS)('default termination and Little’s law, seed %i, A at 100% and B', (seed) => {
  for (const f of [1, 0]) {
    const s = run(defaultConfig(), seed, f);
    expect(s.truncated).toBe(false);
    expect(s.world.exited).toBe(s.world.pop.personCount);
    littlesLaw(s);
  }
});

test('Crush, narrow vertical aisles and together mode terminate', () => {
  for (const seed of [1, 2, 3]) {
    const crush = run(presetConfig('crush'), seed, 1);
    expect(crush.done).toBe(true);
    expect(crush.world.exited === crush.world.pop.personCount || crush.truncated).toBe(true);
    const narrow = defaultConfig();
    narrow.layout.verticalAisle = 0.6;
    for (const f of [1, 0]) {
      const s = run(narrow, seed, f);
      expect(s.truncated).toBe(false);
      littlesLaw(s);
    }
    const tog = defaultConfig();
    tog.reserve.claimMode = 'together';
    tog.layout.verticalAisle = 0.6;
    const t = run(tog, seed, 1);
    expect(t.truncated).toBe(false);
  }
});

test('maximum layout (20 × 20, k = 4, 60 stalls) with 1,000 people terminates', () => {
  const c = defaultConfig();
  c.layout = { cols: 20, rows: 20, seatsPerSide: 4, verticalAisle: 3, horizontalAisle: 3, stallCount: 60, queueDepth: 10 };
  c.crowd.totalPeople = 1000;
  for (const f of [1, 0]) {
    const s = run(c, 1, f);
    expect(s.truncated).toBe(false);
    expect(s.world.exited).toBe(s.world.pop.personCount);
  }
});
