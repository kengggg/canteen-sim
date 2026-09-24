import type { Config } from '../../../src/config/schema';
import { Sim } from '../../../src/sim/engine';

export type Trace = { ev: string; ms: number; a: number; b: number; c: number };

/** Run a full lunch, recording every trace; `on` sees the world at the moment of each trace. */
export function traced(cfg: Config, opts: { seed?: number; reserveFraction?: number }, on?: (s: Sim, t: Trace) => void) {
  const traces: Trace[] = [];
  const holder: { sim?: Sim } = {};
  const sim = new Sim(cfg, {
    ...opts,
    trace: (ev: string, a: number, b: number, c: number) => {
      const t = { ev, ms: holder.sim!.world.now, a, b, c };
      traces.push(t);
      on?.(holder.sim!, t);
    },
  });
  holder.sim = sim;
  sim.advanceTo(Infinity);
  return { sim, w: sim.world, traces };
}
