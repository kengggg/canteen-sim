import { computed, signal } from '@preact/signals';
import { cloneConfig } from '../config/meta';
import { defaultConfig, type Config } from '../config/schema';
import { validate } from '../config/validate';
import type { Pick } from '../render/scene';
import { Controller } from './controller';

/** UI state (signals). Engine state lives in the controller; `tick` is bumped when panels should re-read it. */
export type Drawer = 'settings' | 'assumptions' | 'batch' | null;
export type ThemeChoice = 'system' | 'light' | 'dark';

export const controller = new Controller(defaultConfig());

export const pending = signal<Config>(cloneConfig(controller.applied));
export const applied = signal<Config>(cloneConfig(controller.applied));
export const dirty = computed(() => JSON.stringify(pending.value) !== JSON.stringify(applied.value));
export const validation = computed(() => validate(pending.value));

export const tick = signal(0);
export const frameTick = signal(0);
export const playing = signal(false);
export const speed = signal(60);
export const drawer = signal<Drawer>(null);
export const focusSetting = signal<string | null>(null);
export const howto = signal(false);
export const theme = signal<ThemeChoice>('system');
export const cameraMode = signal<'threeQuarter' | 'topDown' | 'follow'>('threeQuarter');
export const linked = signal(true);
export const colorByGroup = signal(false);
export const seatTints = signal(false);
export const hover = signal<(Pick & { x: number; y: number }) | null>(null);
export const webgl = signal<'ok' | 'none' | 'lost'>('ok');
export const notices = signal<string[]>([]);
export const skipProgress = signal<number | null>(null);
export const endCardOpen = signal(false);
export const evidenceOpen = signal(false);

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
  playing.value = false;
  endCardOpen.value = false;
  skipProgress.value = null;
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
