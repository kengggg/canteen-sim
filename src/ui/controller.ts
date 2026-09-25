import { cloneConfig } from '../config/meta';
import type { Config } from '../config/schema';
import { settingsCode } from '../config/url';
import { createEngine, type Engine } from '../sim/engine';

export const TICK_MS = 200;
export const FRAME_BUDGET_MS = 8;
export const SPEEDS = [1, 10, 30, 60, 120];

export interface EngineError { message: string; atMs: number; seed: number; code: string }

/** A Skip-to job run in ≤ 8 ms slices per frame (spec §11.2). */
export interface SkipJob { target: number; progress: number; done: boolean; cancelled: boolean; cancel(): void }

/**
 * Owns the two live engines and the playback clock (spec §11.2). A and B always end a frame at the same tick.
 * UI-only; it never changes results.
 */
export class Controller {
  applied: Config;
  A!: Engine;
  B!: Engine;
  /** Sim ms both engines have reached (a whole number of ticks). */
  tickNow = 0;
  playing = false;
  speed = 60;
  /** Achieved speed when the frame budget was hit, else null. */
  runningAt: number | null = null;
  error: EngineError | null = null;
  skip: (SkipJob & { rebuilt: boolean }) | null = null;
  /** Bumped on every rebuild so views can reallocate. */
  generation = 0;
  private simTarget = 0;

  constructor(cfg: Config, private readonly now: () => number = () => performance.now(), private readonly budget = FRAME_BUDGET_MS) {
    this.applied = cloneConfig(cfg);
    this.rebuild(cfg);
  }

  /** Restart: rebuild both engines at time 0 with `cfg`, paused (spec §11.2). */
  rebuild(cfg: Config, keepPlaying = false): void {
    this.applied = cloneConfig(cfg);
    this.error = null;
    try {
      this.A = createEngine(this.applied, { reserveFraction: this.applied.reserve.percentA });
      this.B = createEngine(this.applied, { reserveFraction: 0 });
    } catch (e) {
      this.fail(e);
    }
    this.tickNow = 0;
    this.simTarget = 0;
    this.runningAt = null;
    this.skip = null;
    this.playing = keepPlaying && this.playing;
    this.generation++;
  }

  /** A-slider release: restart from 0 with the same seed and the new fraction, keeping play/pause and speed. */
  setFraction(fraction: number, pending?: Config): void {
    const c = cloneConfig(pending ?? this.applied);
    c.reserve.percentA = fraction;
    this.rebuild(c, true);
  }

  /** Continuous sim time for rendering: between the last tick and the next one. */
  get renderMs(): number {
    return Math.min(Math.max(this.simTarget, this.tickNow), this.tickNow + TICK_MS);
  }

  get bothDone(): boolean {
    return this.A.done && this.B.done;
  }

  private fail(e: unknown): void {
    this.playing = false;
    this.error = { message: e instanceof Error ? e.message : String(e), atMs: this.tickNow, seed: this.applied.seed, code: settingsCode(this.applied) };
  }

  /** Advance both engines one tick; false on error. */
  private stepTick(): boolean {
    const next = this.tickNow + TICK_MS;
    try {
      this.A.advanceTo(next);
      this.B.advanceTo(next);
    } catch (e) {
      this.fail(e);
      return false;
    }
    this.tickNow = next;
    return true;
  }

  /** One animation frame of playback. `rafDtMs` is the time since the previous frame. */
  frame(rafDtMs: number): void {
    if (this.error) return;
    if (this.skip && !this.skip.done) {
      this.stepSkip();
      return;
    }
    if (!this.playing) return;
    if (this.bothDone) {
      this.playing = false;
      return;
    }
    const dt = Math.min(rafDtMs, 100);
    this.simTarget = Math.max(this.simTarget, this.tickNow) + dt * this.speed;
    const start = this.now();
    const before = this.tickNow;
    let hitBudget = false;
    while (this.tickNow + TICK_MS <= this.simTarget && !this.bothDone) {
      if (!this.stepTick()) return;
      if (this.now() - start >= this.budget) {
        hitBudget = this.tickNow + TICK_MS <= this.simTarget;
        break;
      }
    }
    if (hitBudget) {
      // Unmet time is dropped, not carried as debt.
      this.simTarget = this.tickNow;
      this.runningAt = dt > 0 ? Math.max(1, Math.round((this.tickNow - before) / dt)) : null;
    } else {
      this.runningAt = null;
    }
    if (this.bothDone) this.playing = false;
  }

  /** Start a Skip-to (spec §11.2). An earlier target rebuilds and replays from 0; a target past the end runs to done. */
  skipTo(targetMs: number): SkipJob {
    const target = Math.max(0, Math.floor(targetMs / TICK_MS) * TICK_MS);
    const rebuilt = target < this.tickNow;
    if (rebuilt) {
      const keep = this.playing;
      this.rebuild(this.applied);
      this.playing = keep;
    }
    const job = {
      target, progress: 0, done: false, cancelled: false, rebuilt,
      cancel: () => { job.cancelled = true; job.done = true; },
    };
    this.skip = job;
    this.simTarget = this.tickNow;
    return job;
  }

  private stepSkip(): void {
    const job = this.skip!;
    const start = this.now();
    while (!job.done) {
      if (this.bothDone || this.tickNow >= job.target) {
        job.done = true;
        break;
      }
      if (!this.stepTick()) {
        job.done = true;
        return;
      }
      if (this.now() - start >= this.budget) break;
    }
    job.progress = job.target === 0 ? 1 : Math.min(1, this.tickNow / job.target);
    this.simTarget = this.tickNow;
  }

  /** Run the current skip to completion synchronously (tests, self-test). */
  finishSkip(): void {
    while (this.skip && !this.skip.done) this.stepSkip();
  }
}
