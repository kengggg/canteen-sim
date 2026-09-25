import { EventQueue } from '../../../src/sim/events';
import { Movement } from '../../../src/sim/movement';
import type { NavGraph } from '../../../src/sim/navgraph';

/**
 * A minimal event loop around Movement: agents walk fixed node paths.
 * Kind 1 = scripted callbacks, 3 = edge exits, 6 = admission steps.
 */
export class MiniSim {
  q = new EventQueue();
  now = 0;
  mv: Movement;
  paths: number[][] = [];
  step: number[] = [];
  speed: number[] = [];
  arrivedAt: number[][] = []; // per agent: ms of each node arrival (index = path position)
  admittedAt: number[][] = [];
  done: boolean[] = [];
  onArrive: (p: number, node: number) => boolean = () => true; // return false to stop the agent there
  private admitAt = -1;
  firstAdmit: number[] = [];
  admittedAtMs(p: number): number {
    return this.firstAdmit[p];
  }
  private callbacks: (() => void)[] = [];

  constructor(public G: NavGraph, maxAgents: number, edgeBetween: (a: number, b: number) => number) {
    this.mv = new Movement(G, maxAgents, {
      scheduleArrival: (p, ms) => this.q.push(ms, 3, p, 0, p, 0),
      onAdmit: (p, ms) => {
        if (this.firstAdmit[p] === undefined) this.firstAdmit[p] = ms;
      },
      requestAdmit: () => {
        if (this.admitAt !== this.now) {
          this.admitAt = this.now;
          this.q.push(this.now, 6, 0, 0, 0, 0);
        }
      },
    });
    this.edgeBetween = edgeBetween;
  }
  edgeBetween: (a: number, b: number) => number;

  /** Agent p appears at path[0] at ms `at` and walks the path. */
  add(p: number, path: number[], at: number, speed = 1300): void {
    this.paths[p] = path;
    this.step[p] = 0;
    this.speed[p] = speed;
    this.arrivedAt[p] = [at];
    this.admittedAt[p] = [];
    this.done[p] = false;
    this.at(at, () => {
      this.mv.placeAt(p, path[0]);
      this.next(p);
    });
  }

  /** Replace p's remaining path with `path` (starting at its current node) and move on. */
  reroute(p: number, path: number[]): void {
    this.paths[p] = path;
    this.step[p] = 0;
    this.arrivedAt[p] = [this.now];
    this.done[p] = false;
    this.next(p);
  }

  /** Run a callback at ms (kind 1, before arrivals). */
  at(ms: number, fn: () => void): void {
    this.callbacks.push(fn);
    this.q.push(ms, 1, 0, 1, this.callbacks.length - 1, 0);
  }

  next(p: number): void {
    const path = this.paths[p];
    const i = this.step[p];
    if (i + 1 >= path.length) {
      this.mv.leave(p);
      this.done[p] = true;
      return;
    }
    const a = path[i], b = path[i + 1];
    const e = this.edgeBetween(a, b);
    if (e < 0) throw new Error(`no edge ${a}-${b}`);
    const dir = this.G.edges[e].a === a ? 1 : -1;
    this.mv.candidate(p, e, dir, this.speed[p]);
  }

  run(until = Infinity): void {
    while (this.q.size > 0 && this.q.peekMs() <= until) {
      this.q.pop();
      this.now = this.q.ms;
      this.mv.now = this.now;
      if (this.q.kind === 1) this.callbacks[this.q.arg]();
      else if (this.q.kind === 3) {
        const p = this.q.arg;
        const node = this.mv.arrive(p);
        this.step[p]++;
        this.arrivedAt[p].push(this.now);
        if (node !== this.paths[p][this.step[p]]) throw new Error('arrived at wrong node');
        if (this.onArrive(p, node)) this.next(p);
      } else if (this.q.kind === 6) {
        const before = this.mv.onEdgeCount;
        this.mv.admitStep();
        void before;
      }
    }
  }
}
