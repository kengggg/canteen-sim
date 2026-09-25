import { computed, signal } from '@preact/signals';
import { applyValues } from '../config/load';
import { cloneConfig } from '../config/meta';
import { parseShared } from '../config/url';
import { defaultConfig, type Config } from '../config/schema';
import { validate } from '../config/validate';
import type { Pick } from '../render/scene';
import { Controller } from './controller';

/** UI state (signals). Engine state lives in the controller; `tick` is bumped when panels should re-read it. */
export type Drawer = 'settings' | 'assumptions' | 'batch' | 'findings' | null;
export type ThemeChoice = 'system' | 'light' | 'dark';

function initialConfig(): { cfg: Config; notices: string[] } {
  try {
    if (typeof location !== 'undefined' && location.hash.startsWith('#v=')) {
      const d = parseShared(location.hash);
      if (d.ok) {
        const r = applyValues(d.values, d.model);
        return { cfg: r.cfg, notices: [...r.notices, ...(r.modelNotice ? [`Shared with model ${r.modelNotice.from}; results may differ in model ${r.modelNotice.to}.`] : [])] };
      }
      return { cfg: defaultConfig(), notices: ['This settings code isn’t valid or is from a newer version'] };
    }
  } catch {
    // Fall through to the defaults.
  }
  return { cfg: defaultConfig(), notices: [] };
}
const initial = initialConfig();

export const controller = new Controller(initial.cfg);

export const pending = signal<Config>(cloneConfig(controller.applied));
export const applied = signal<Config>(cloneConfig(controller.applied));
export const dirty = computed(() => JSON.stringify(pending.value) !== JSON.stringify(applied.value));
export const validation = computed(() => validate(pending.value));

export const tick = signal(0);
export const frameTick = signal(0);
export const playing = signal(false);
export const speed = signal(60);
export const drawer = signal<Drawer>(null);
/** Open a drawer and move focus to its heading, for links that jump between panels (spec §11.11). */
export function openDrawer(d: Exclude<Drawer, null>): void {
  drawer.value = d;
  requestAnimationFrame(() => document.querySelector<HTMLElement>('.drawer-head h2')?.focus());
}
export const focusSetting = signal<string | null>(null);
export const howto = signal(false);
export const theme = signal<ThemeChoice>('system');
export const cameraMode = signal<'threeQuarter' | 'topDown' | 'follow'>('threeQuarter');
export const linked = signal(true);
export const colorByGroup = signal(false);
export const seatTints = signal(false);
export const hover = signal<(Pick & { x: number; y: number }) | null>(null);
export const webgl = signal<'ok' | 'none' | 'lost'>('ok');
export const notices = signal<string[]>(initial.notices);
export const skipProgress = signal<number | null>(null);
export const endCardOpen = signal(false);
export const evidenceOpen = signal(false);
/** Bumped whenever the effective theme may have changed (our toggle, the host's data-theme, the OS scheme). */
export const themeGen = signal(0);
/** True while a batch runs: live playback pauses and the A slider is disabled (spec §10.1). */
export const batchRunning = signal(false);
/** Called after the applied config changes, so views holding results for other settings can drop them. */
export const appliedListeners: ((c: Config) => void)[] = [];

/** Mutate the pending config immutably (marks the run dirty; applies on Restart). */
export function editPending(fn: (c: Config) => void): void {
  const c = cloneConfig(pending.value);
  fn(c);
  pending.value = c;
}

/** Restart with the pending settings (spec §9.4 "Apply on Restart"). */
export function restart(): void {
  if (validation.value.blocking.length > 0) {
    note(`These settings cannot run: ${validation.value.blocking.map((b) => b.message).join(' ')}`);
    return;
  }
  controller.rebuild(pending.value);
  applied.value = cloneConfig(controller.applied);
  for (const f of appliedListeners) f(applied.value);
  playing.value = false;
  endCardOpen.value = false;
  skipProgress.value = null;
  tick.value++;
}

/**
 * A-slider release (spec §11.1): restart from 0 with the same seed and the new fraction, applying pending drawer
 * changes — unless they are blocked, in which case only the fraction changes.
 */
export function releaseSlider(percent: number): void {
  editPending((c) => { c.reserve.percentA = percent / 100; });
  const base = validation.value.blocking.length > 0 ? applied.value : pending.value;
  if (base !== pending.value) note('Pending settings cannot run, so only the reservation share was applied.');
  controller.setFraction(percent / 100, base);
  applied.value = cloneConfig(controller.applied);
  for (const f of appliedListeners) f(applied.value);
  tick.value++;
}

export function note(msg: string): void {
  notices.value = [...notices.value, msg];
}

/** localStorage wrapped for sandboxed viewers (it may throw or be empty). */
export const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): boolean {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
};

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
