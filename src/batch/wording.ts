import type { MetricDef } from './catalog';
import type { PairedStat } from './stats';

/** Fixed-decimal display of a stored metric value (UI side; locale-independent). */
export function fmt(x: number, m: MetricDef): string {
  const v = x * m.scale;
  const digits = m.unit === 'people/h' || m.unit === 'people' || m.unit === 'groups' || m.unit === 'asks' || m.unit === 'events' ? 0 : m.unit === 'min' ? 2 : 1;
  const s = v.toFixed(digits);
  return s === '-0' || /^-0\.0+$/.test(s) ? s.slice(1) : s;
}

const diffUnit = (m: MetricDef) => (m.unit === '%' ? 'percentage points' : m.unit);
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Result sentences (spec §10.4), neutral in both directions. `stat` is over free-flow advantages. */
export function sentence(m: MetricDef, fraction: number, stat: PairedStat, wins: { W: number; T: number; L: number; n: number } | null, prefix?: string): string {
  const at = prefix ?? `At ${Math.round(fraction * 100)}% reservation`;
  const name = lowerFirst(m.label);
  const u = diffUnit(m);
  if (stat.nUsed === 0 || stat.mean === null) return `${at}, no usable lunches for ${name}.`;
  const dir = stat.mean >= 0 ? 'better' : 'worse';
  const abs = fmt(Math.abs(stat.mean), m);
  if (stat.allZero) return `${at}, ${name} was identical in all ${stat.nUsed} lunches.`;
  if (stat.allEqual) return `${at}, ${name} was ${abs} ${u} ${dir} under free flow, the same in every lunch.`;
  if (stat.tooFew) return `${at}, ${stat.nUsed} usable lunches are too few for an interval; mean difference ${fmt(stat.mean, m)} ${u}.`;
  const ties = stat.mostlyTies ? ' (mostly ties — interval approximate)' : '';
  if (stat.lo! <= 0 && stat.hi! >= 0) return `${at}, these ${stat.nUsed} lunches show no clear difference in ${name}${ties}.`;
  const w = wins ? ` Free flow better in ${wins.W}, tied in ${wins.T}, reservation better in ${wins.L}.` : '';
  return `${at}, ${name} was ${abs} ${u} ${dir} under free flow (95% CI ${fmt(stat.lo!, m)} to ${fmt(stat.hi!, m)}) across ${stat.nUsed} paired lunches${ties}.${w}`;
}
