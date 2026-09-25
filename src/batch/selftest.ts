import { presetConfig } from '../config/presets';
import { defaultConfig, type Config } from '../config/schema';
import { createEngine } from '../sim/engine';

/** Determinism self-test scenarios (spec §13.6): the same in Node, every browser, main thread and worker. */
export interface Scenario { id: string; cfg: Config; fraction: number }

export function scenarios(): Scenario[] {
  const cv0 = defaultConfig();
  cv0.stalls.serviceCV = 0;
  cv0.eat.cv = 0;
  cv0.stalls.popularitySkew = 0;
  const big = defaultConfig();
  big.layout = { ...big.layout, cols: 20, rows: 20, seatsPerSide: 4 };
  big.crowd.totalPeople = 1000;
  return [
    { id: 'defaultA', cfg: defaultConfig(), fraction: 0.5 },
    { id: 'defaultB', cfg: defaultConfig(), fraction: 0 },
    { id: 'crush', cfg: presetConfig('crush'), fraction: 0.5 },
    { id: 'reservationFriendly', cfg: presetConfig('reservationFriendly'), fraction: 0.5 },
    { id: 'cv0skew0', cfg: cv0, fraction: 0.5 },
    { id: 'big', cfg: big, fraction: 0.5 },
  ];
}

export interface SelfTestResult { hash: number; checkpoints: number[] }

/** Run one scenario to done, with a state-hash checkpoint every 10 sim-minutes. */
export function runScenario(s: Scenario): SelfTestResult {
  const e = createEngine(s.cfg, { reserveFraction: s.fraction });
  const checkpoints: number[] = [];
  for (let t = 600_000; !e.done; t += 600_000) {
    e.advanceTo(t);
    checkpoints.push(e.stateHash());
  }
  return { hash: e.runHash(), checkpoints };
}
