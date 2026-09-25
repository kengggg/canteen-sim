import type { Config } from '../config/schema';
import type { PairMetrics } from '../sim/pairmetrics';
import type { RunMetrics } from '../sim/runmetrics';
import type { BatchResult } from './runner';

const STATE_NAMES = ['free', 'openToSmall', 'blockedLeftover', 'claimedEmpty', 'held', 'occupied'];
type Cell = number | string | boolean | null | undefined;

const cell = (v: Cell): string => (v === null || v === undefined ? '' : typeof v === 'number' ? v.toString() : String(v));

function runColumns(r: RunMetrics): [string, Cell][] {
  const out: [string, Cell][] = [];
  for (const [k, v] of Object.entries(r)) {
    if (k === 'eventsPerKind') (v as number[]).forEach((x, i) => out.push([`eventsPerKind_k${i + 1}`, x]));
    else if (k === 'splitFeasibleGroupsBySize') (v as number[]).forEach((x, i) => out.push([`splitFeasibleGroups_s${i + 1}`, x]));
    else if (k === 'splitFeasiblePeopleBySize') (v as number[]).forEach((x, i) => out.push([`splitFeasiblePeople_s${i + 1}`, x]));
    else if (k === 'stallServed') (v as number[]).forEach((x, i) => out.push([`stallServed_${i + 1}`, x]));
    else if (k === 'bySize') {
      for (const b of v as RunMetrics['bySize']) for (const [f, x] of Object.entries(b)) if (f !== 'size') out.push([`bySize_s${b.size}_${f}`, x as Cell]);
    } else out.push([k, v as Cell]);
  }
  return out;
}

function pairColumns(pm: PairMetrics): [string, Cell][] {
  const out: [string, Cell][] = [
    ['pair_peakWindowStart', pm.peakWindowStartMin],
    ['pair_peakWindowLength', pm.peakWindowLengthMin],
    ['pair_p3Level', pm.p3Level],
    ['pair_p3Baseline', pm.p3Baseline],
  ];
  pm.sharesLevel.forEach((x, i) => out.push([`pair_sharesLevel_${STATE_NAMES[i]}`, x]));
  pm.sharesBaseline.forEach((x, i) => out.push([`pair_sharesBaseline_${STATE_NAMES[i]}`, x]));
  for (const [name, c] of Object.entries(pm.cohorts)) {
    for (const side of ['level', 'baseline'] as const) for (const [f, x] of Object.entries(c[side])) out.push([`pair_cohort${name}_${side}_${f}`, x as Cell]);
  }
  return out;
}

/** CSV export (spec §10.7): header comment, one row per run and one pair_ row per (seed, level ≠ 0). */
export function toCsv(b: BatchResult, cfg: Config, meta: { model: number; sha: string; exportedAt: string }): string {
  const rows: Map<string, Cell>[] = [];
  const common = (row: string, seedIndex: number, seed: number, fraction: number, value: number | null) =>
    new Map<string, Cell>([['row', row], ['kind', b.kind], ['seedIndex', seedIndex + 1], ['seed', seed], ['isLiveSeed', seedIndex === 0], ['reserveFraction', fraction], ['sweepSetting', b.setting], ['sweepValue', value]]);
  for (const r of b.runs) {
    const m = common('run', r.seedIndex, r.seed, r.fraction, r.value);
    m.set('runHash', r.hash);
    m.set('effectiveShareMinEmpty', r.shareMinEmpty ?? cfg.reserve.shareMinEmpty);
    for (const [k, v] of runColumns(r.metrics)) m.set(k, v);
    rows.push(m);
  }
  for (const p of b.pairs) {
    const m = common('pair', p.seedIndex, p.seed, p.fraction, p.value);
    for (const [k, v] of pairColumns(p.pm)) m.set(k, v);
    rows.push(m);
  }
  const header: string[] = [];
  const seen = new Set<string>();
  for (const m of rows) for (const k of m.keys()) if (!seen.has(k)) { seen.add(k); header.push(k); }
  const lines = [
    '# Canteen Sim batch export',
    `# model ${meta.model}, build ${meta.sha}, exported ${meta.exportedAt}`,
    `# settings ${JSON.stringify(cfg)}`,
    header.join(','),
    ...rows.map((m) => header.map((k) => cell(m.get(k))).join(',')),
  ];
  return lines.join('\n') + '\n';
}
