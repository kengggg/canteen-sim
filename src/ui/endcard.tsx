import { useEffect } from 'preact/hooks';
import { pairMetrics } from '../sim/engine';
import { defaultConfig } from '../config/schema';
import { num } from './format';
import { MSG } from './labels';
import { applied, controller, drawer, endCardOpen, evidenceOpen, tick } from './store';

/** End of lunch (spec §11.4): P1–P4 for A, B and the free-flow advantage for this one lunch. */
export function EndCard() {
  void tick.value;
  const done = controller.bothDone;
  useEffect(() => {
    if (done) endCardOpen.value = true;
  }, [done, controller.generation]);
  if (!done || !endCardOpen.value) return null;
  const a = controller.A.metrics(), b = controller.B.metrics();
  const pm = pairMetrics(controller.A.pairInput(), controller.B.pairInput(), applied.value.reserve.percentA);
  const rows: [string, number | null, number | null, 'lower' | 'higher', string, number][] = [
    ['Walk-aways (%)', a.walkAwayPct, b.walkAwayPct, 'lower', 'pp', 1],
    ['Entrance to seat or giving up (min)', a.entranceToSeatMeanMin, b.entranceToSeatMeanMin, 'lower', 'min', 2],
    ['Peak seat utilization (%)', pm.p3Level * 100, pm.p3Baseline * 100, 'higher', 'pp', 1],
    ['Peak throughput (people/h)', a.peakThroughputPerHour, b.peakThroughputPerHour, 'higher', '/h', 0],
  ];
  const isDefault = JSON.stringify({ ...applied.value, seed: 1 }) === JSON.stringify(defaultConfig());
  return (
    <aside class="endcard" role="dialog" aria-label="End of lunch">
      <header>
        <h2>Lunch finished</h2>
        <button type="button" aria-label="Close" onClick={() => (endCardOpen.value = false)}>×</button>
      </header>
      <table class="data">
        <thead><tr><th scope="col">Primary endpoint</th><th scope="col">A</th><th scope="col">B</th><th scope="col">Free-flow advantage</th></tr></thead>
        <tbody>
          {rows.map(([label, va, vb, better, unit, d]) => {
            const adv = va === null || vb === null ? null : better === 'lower' ? va - vb : vb - va;
            return (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td class="num">{num(va, d)}</td>
                <td class="num">{num(vb, d)}</td>
                <td class="num">{adv === null ? '—' : `${adv > 0 ? '+' : ''}${num(adv, d)} ${unit}`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p class="muted">{MSG.oneLunch}</p>
      <button type="button" class="primary" onClick={() => { endCardOpen.value = false; evidenceOpen.value = isDefault; drawer.value = 'batch'; }}>
        See 30 lunches
      </button>
    </aside>
  );
}
