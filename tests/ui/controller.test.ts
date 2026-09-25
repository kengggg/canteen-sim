import { defaultConfig } from '../../src/config/schema';
import { createEngine } from '../../src/sim/engine';
import { Controller, TICK_MS } from '../../src/ui/controller';

function fakeClock(stepPerCall: number) {
  let t = 0;
  return () => (t += stepPerCall);
}

test('A and B always end a frame on the same tick', () => {
  const c = new Controller(defaultConfig(), fakeClock(1));
  c.playing = true;
  c.speed = 120;
  for (let i = 0; i < 200; i++) {
    c.frame(16.7);
    if (!c.A.done && !c.B.done) expect(c.A.nowMs).toBe(c.B.nowMs);
    expect(c.tickNow % TICK_MS).toBe(0);
  }
  expect(c.tickNow).toBeGreaterThan(0);
});

test('the 8 ms budget caps work per frame and drops unmet time, reporting the achieved speed', () => {
  const c = new Controller(defaultConfig(), fakeClock(5));
  c.playing = true;
  c.speed = 120;
  c.frame(100);
  // Each clock read costs 5 ms: after 2 ticks the budget is hit.
  expect(c.tickNow).toBe(2 * TICK_MS);
  expect(c.runningAt).toBe(4);
  const before = c.tickNow;
  c.frame(100);
  expect(c.tickNow - before).toBe(2 * TICK_MS);
});

test('skip-to in slices ends in the same state as a direct run; an earlier target rebuilds', () => {
  const c = new Controller(defaultConfig(), fakeClock(1));
  const job = c.skipTo(75 * 60_000);
  let frames = 0;
  while (!job.done) { c.frame(16); frames++; }
  expect(frames).toBeGreaterThan(1);
  const direct = createEngine(defaultConfig(), { reserveFraction: 0.5 });
  direct.advanceTo(75 * 60_000);
  expect(c.A.stateHash()).toBe(direct.stateHash());
  expect(c.tickNow).toBe(75 * 60_000);
  const gen = c.generation;
  const back = c.skipTo(30 * 60_000);
  expect(back.target).toBe(30 * 60_000);
  expect(c.generation).toBe(gen + 1);
  c.finishSkip();
  expect(c.tickNow).toBe(30 * 60_000);
});

test('skip past the end runs to done; cancel stops a skip', () => {
  const c = new Controller(defaultConfig(), fakeClock(0.01));
  const job = c.skipTo(24 * 3_600_000);
  c.finishSkip();
  expect(job.done).toBe(true);
  expect(c.bothDone).toBe(true);
  const d = new Controller(defaultConfig(), fakeClock(4));
  const j2 = d.skipTo(100 * 60_000);
  d.frame(16);
  j2.cancel();
  const t = d.tickNow;
  d.frame(16);
  expect(d.tickNow).toBe(t);
});

test('restart discards the engines and leaves playback paused; slider release keeps playing', () => {
  const c = new Controller(defaultConfig(), fakeClock(1));
  c.playing = true;
  c.frame(50);
  const A0 = c.A;
  c.rebuild(defaultConfig());
  expect(c.A).not.toBe(A0);
  expect(c.tickNow).toBe(0);
  expect(c.playing).toBe(false);
  c.playing = true;
  c.speed = 30;
  c.setFraction(1);
  expect(c.playing).toBe(true);
  expect(c.speed).toBe(30);
  expect(c.applied.reserve.percentA).toBe(1);
});
