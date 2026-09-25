import { MODEL_VERSION } from '../sim/version';
import { clampConfig } from './clamp';
import { META_BY_ID, getSetting, setSetting } from './meta';
import { defaultConfig, type Config } from './schema';
import type { Leaf } from './url';
import { validate } from './validate';

export interface LoadResult {
  cfg: Config;
  /** Human-readable notices: clamped settings, repairs, model version. */
  notices: string[];
  modelNotice: { from: number; to: number } | null;
}

const labelOf = (id: string) => META_BY_ID.get(id)?.label ?? id;

/** Repair a blocked combination (spec §9.4): move oversized group shares onto size 2k; reset conflicting layout keys. */
export function repairBlocked(c: Config): string[] {
  const notes: string[] = [];
  for (let pass = 0; pass < 3; pass++) {
    const blocking = validate(c).blocking;
    if (blocking.length === 0) break;
    for (const b of blocking) {
      if (b.code === 'groupTooBig') {
        const k2 = 2 * c.layout.seatsPerSide;
        const mix = [...c.crowd.groupMix] as Config['crowd']['groupMix'];
        for (let s = k2 + 1; s <= 6; s++) {
          mix[k2 - 1] += mix[s - 1];
          mix[s - 1] = 0;
        }
        c.crowd.groupMix = mix;
        notes.push(`Group sizes above ${k2} were moved onto groups of ${k2} to fit ${k2}-seat tables.`);
      } else if (b.code === 'mixZero') {
        c.crowd.groupMix = defaultConfig().crowd.groupMix;
        notes.push('The group mix was empty and was reset.');
      } else {
        const d = defaultConfig();
        const keys = pass === 0 ? b.settings.filter((s) => s.startsWith('layout.')) : Object.keys(d.layout).map((k) => `layout.${k}`);
        for (const k of keys) setSetting(c, k, getSetting(d, k));
        notes.push(`${b.message} Reset ${keys.map(labelOf).join(', ')} to defaults.`);
      }
    }
    clampConfig(c);
  }
  return notes;
}

/** Build a config from shared values: unknown keys ignored, values clamped with notices, blocked combos repaired. */
export function applyValues(values: Map<string, Leaf>, model: number, base: Config = defaultConfig()): LoadResult {
  const c = base;
  for (const [id, v] of values) {
    if (!META_BY_ID.has(id)) continue;
    setSetting(c, id, v);
  }
  const clamped = clampConfig(c);
  const notices = clamped.length > 0 ? [`Out-of-range values were adjusted: ${clamped.map(labelOf).join(', ')}.`] : [];
  notices.push(...repairBlocked(c));
  return { cfg: c, notices, modelNotice: model !== MODEL_VERSION ? { from: model, to: MODEL_VERSION } : null };
}

/** JSON export (spec §9.4). */
export function exportJson(c: Config): string {
  return JSON.stringify({ app: 'canteen-sim', v: 1, model: MODEL_VERSION, settings: c }, null, 2);
}

export function importJson(text: string): LoadResult | { error: true } {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return { error: true };
  }
  const d = doc as { app?: unknown; v?: unknown; model?: unknown; settings?: unknown };
  if (!d || d.app !== 'canteen-sim' || d.v !== 1 || typeof d.model !== 'number' || typeof d.settings !== 'object' || d.settings === null) return { error: true };
  const values = new Map<string, Leaf>();
  const s = d.settings as Record<string, unknown>;
  for (const id of META_BY_ID.keys()) {
    const [a, b] = id.split('.');
    const v = b === undefined ? s[a] : (s[a] as Record<string, unknown> | undefined)?.[b];
    if (v !== undefined) values.set(id, v as Leaf);
  }
  return applyValues(values, d.model);
}
