import { META, getSetting, setSetting, type SettingMeta } from './meta';
import { defaultConfig, type Config } from './schema';

/** Snap to the setting's step grid from its minimum, and clamp; NaN falls back to the default. */
function snap(m: SettingMeta, v: number, lo: number, hi: number, dflt: number): number {
  if (!Number.isFinite(v)) return dflt;
  const stepped = lo + Math.round((v - lo) / m.step) * m.step;
  const r = m.type === 'int' || m.type === 'time' ? Math.round(stepped) : Math.round(stepped * 1e6) / 1e6;
  return Math.min(hi, Math.max(lo, r));
}

const ORDER = ['layout.', 'crowd.windowStart', 'crowd.windowEnd', 'crowd.peakTime', 'reserve.shareMinEmpty'];

/**
 * Clamp every setting into range in the §9.2 dependency order: layout, window start/end, peak time, shareMinEmpty,
 * then the rest. Returns the ids that changed.
 */
export function clampConfig(c: Config): string[] {
  const d = defaultConfig();
  const changed: string[] = [];
  const rank = (id: string) => {
    const i = ORDER.findIndex((p) => (p.endsWith('.') ? id.startsWith(p) : id === p));
    return i < 0 ? ORDER.length : i;
  };
  const metas = [...META].sort((a, b) => rank(a.id) - rank(b.id));
  for (const m of metas) {
    const cur = getSetting(c, m.id);
    const dflt = getSetting(d, m.id);
    let next: unknown = cur;
    if (m.type === 'enum') next = m.options!.includes(cur as string) ? cur : dflt;
    else if (m.type === 'bool') next = typeof cur === 'boolean' ? cur : dflt;
    else if (m.type === 'mix6') {
      const arr = Array.isArray(cur) && cur.length === 6 ? (cur as number[]) : (dflt as number[]);
      next = arr.map((x) => (Number.isFinite(x) ? Math.min(100, Math.max(0, Math.round(x))) : 0));
    } else {
      let lo = m.min, hi = m.max;
      if (m.id === 'crowd.windowEnd') { lo = c.crowd.windowStart + 30; hi = c.crowd.windowStart + 300; }
      if (m.id === 'crowd.peakTime') { lo = c.crowd.windowStart; hi = c.crowd.windowEnd; }
      if (m.id === 'reserve.shareMinEmpty') hi = 2 * c.layout.seatsPerSide;
      if (m.id === 'seed') next = Number.isFinite(cur as number) ? (Math.floor(cur as number) >>> 0) : dflt;
      else next = snap(m, typeof cur === 'number' ? cur : Number.NaN, lo, hi, Math.min(hi, Math.max(lo, dflt as number)));
    }
    if (JSON.stringify(next) !== JSON.stringify(cur)) {
      setSetting(c, m.id, next as never);
      changed.push(m.id);
    }
  }
  return changed;
}
