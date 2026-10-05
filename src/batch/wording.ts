import { language, msg } from '../i18n';
import type { MetricDef } from './catalog';
import type { PairedStat } from './stats';

/** Fixed-decimal display of a stored metric value (UI side; locale-independent). */
export function fmt(x: number, m: MetricDef): string {
  const v = x * m.scale;
  const digits = m.unit === 'people/h' || m.unit === 'people' || m.unit === 'groups' || m.unit === 'asks' || m.unit === 'events' ? 0 : m.unit === 'min' ? 2 : 1;
  const s = v.toFixed(digits);
  return s === '-0' || /^-0\.0+$/.test(s) ? s.slice(1) : s;
}

const diffUnit = (m: MetricDef) => (m.unit === '%' ? 'percentage points' : m.unit === 'people/h' ? 'people per hour' : m.unit);

/** Like fmt, but a non-zero value never prints as zero: add decimals (up to 4) until it shows. */
export function fmtNonZero(x: number, m: MetricDef): string {
  let s = fmt(x, m);
  if (x === 0 || Number(s) !== 0) return s;
  for (let d = 1; d <= 4; d++) {
    s = (x * m.scale).toFixed(d);
    if (Number(s) !== 0) return s;
  }
  return s;
}
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Result sentences (spec §10.4), neutral in both directions. `stat` is over free-flow advantages. */
export function sentence(m: MetricDef, fraction: number, stat: PairedStat, wins: { W: number; T: number; L: number; n: number } | null, prefix?: string): string {
  const at = prefix ?? msg('At {fraction}% reservation', { fraction: Math.round(fraction * 100) });
  const name = language.value === 'th' ? msg(m.label) : m.phrase ?? lowerFirst(m.label);
  const u = diffUnit(m);
  if (stat.nUsed === 0 || stat.mean === null) return msg('{at}, no usable lunches for {name}.', { at, name });
  const dir = stat.mean >= 0 ? 'better' : 'worse';
  const abs = fmt(Math.abs(stat.mean), m);
  if (stat.allZero) return msg('{at}, {name} was identical in all {n} lunches.', { at, name, n: stat.nUsed });
  if (stat.allEqual) return msg('{at}, {name} was {abs} {unit} {direction} under free flow, the same in every lunch.', { at, name, abs, unit: u, direction: dir });
  if (stat.tooFew) return msg('{at}, {n} usable lunches are too few for an interval; mean difference {mean} {unit}.', { at, n: stat.nUsed, mean: fmt(stat.mean, m), unit: u });
  const ties = stat.mostlyTies ? msg(' (mostly ties — interval approximate)') : '';
  if (stat.lo! <= 0 && stat.hi! >= 0) return msg('{at}, these {n} lunches show no clear difference in {name}{ties}.', { at, n: stat.nUsed, name, ties });
  const w = wins ? msg(' Free flow better in {wins}, tied in {ties}, reservation better in {losses}.', { wins: wins.W, ties: wins.T, losses: wins.L }) : '';
  // The interval is shown on the same scale as the magnitude: for "worse", the advantage interval is negated.
  const [lo, hi] = stat.mean >= 0 ? [stat.lo!, stat.hi!] : [-stat.hi!, -stat.lo!];
  return msg('{at}, {name} was {abs} {unit} {direction} under free flow (95% CI {lo} to {hi}) across {n} paired lunches{ties}.{wins}', { at, name, abs: fmtNonZero(Math.abs(stat.mean), m), unit: u, direction: dir, lo: fmtNonZero(lo, m), hi: fmtNonZero(hi, m), n: stat.nUsed, ties, wins: w });
}
