import { language, localise, msg as trText, rich } from '../i18n';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type uPlot from 'uplot';
import { pairMetrics } from '../sim/engine';
import { stackedChart, token } from './charts';
import { clock, num } from './format';
import { ADVANTAGE_HELP, SEAT_LABELS, STRIP_CAPTION, STRIP_TITLE } from './labels';
import { applied, controller, themeGen, tick } from './store';

const STACK = [5, 4, 3, 1, 2, 0];

interface Row { id: string; label: string; unit: string; better: 'lower' | 'higher'; a: number | null; b: number | null; digits: number; scale: number }

/** The four primary endpoints for this lunch: provisional from live() until done (spec §7.6). */
function endpointRows(): Row[] {
  const A = controller.A, B = controller.B;
  const done = A.done && B.done;
  const lA = A.live(), lB = B.live();
  const mA = done ? A.metrics() : null, mB = done ? B.metrics() : null;
  let p3a: number | null = null, p3b: number | null = null;
  if (done) {
    const pm = pairMetrics(A.pairInput(), B.pairInput(), applied.value.reserve.percentA);
    p3a = pm.p3Level;
    p3b = pm.p3Baseline;
  }
  return [
    { id: 'p1', label: 'Left without eating', unit: 'pp', better: 'lower', a: mA ? mA.leftPct : lA.leftPct, b: mB ? mB.leftPct : lB.leftPct, digits: 1, scale: 1 },
    { id: 'p2', label: 'Time carrying a plate', unit: 'min', better: 'lower', a: mA ? mA.plateMeanMin : lA.plateMeanMin, b: mB ? mB.plateMeanMin : lB.plateMeanMin, digits: 2, scale: 1 },
    { id: 'p3', label: 'Peak seat utilization', unit: 'pp', better: 'higher', a: p3a, b: p3b, digits: 1, scale: 100 },
    { id: 'p4', label: 'Peak throughput', unit: '/h', better: 'higher', a: mA ? mA.peakThroughputPerHour : lA.peakThroughputPerHour, b: mB ? mB.peakThroughputPerHour : lB.peakThroughputPerHour, digits: 0, scale: 1 },
  ];
}

function adv(r: Row): number | null {
  if (r.a === null || r.b === null) return null;
  return (r.better === 'lower' ? r.a - r.b : r.b - r.a) * r.scale;
}

export function AdvantageStrip() {
  void tick.value;
  const minute = Math.floor(controller.tickNow / 60_000);
  const done = controller.bothDone;
  const rows = useMemo(endpointRows, [minute, done, controller.generation]);
  return (
    <section class="strip" aria-label={trText((STRIP_TITLE))}>
      <header class="strip-head">
        <h2 class="eyebrow">{localise(STRIP_TITLE)}</h2>
        <p class="muted strip-cap">{localise(STRIP_CAPTION)} {localise(ADVANTAGE_HELP)}</p>
      </header>
      <ul class="strip-cells">
        {localise(rows.map((r) => {
          const v = adv(r);
          return (
            <li key={r.id} class={`cell ${v === null ? '' : v > 0 ? 'pos' : v < 0 ? 'neg' : ''}`}>
              <span class="cell-label">{localise(r.label)}</span>
              <span class="cell-value num">{localise(v === null ? '—' : `${v > 0 ? '+' : ''}${num(v, r.digits)} ${trText(r.unit)}`)}</span>
              <span class="cell-sub num muted">{rich("A {v0} · B {v1}", { v0: (r.a === null ? '—' : num(r.a * r.scale, r.digits)), v1: (r.b === null ? '—' : num(r.b * r.scale, r.digits)) })}</span>
            </li>
          );
        }))}
      </ul>
    </section>
  );
}

function SeriesPanel({ side }: { side: 0 | 1 }) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<uPlot | null>(null);
  const [table, setTable] = useState(false);
  void tick.value;
  const e = side === 0 ? controller.A : controller.B;
  const s = e.series();
  const minutes = s.minutes;
  const cfg = applied.value;
  const seats = e.layout.seats.length;
  const done = controller.bothDone;
  const shade = useMemo(() => {
    if (!done) return null;
    const pm = pairMetrics(controller.A.pairInput(), controller.B.pairInput(), cfg.reserve.percentA);
    return [pm.peakWindowStartMin, pm.peakWindowStartMin + pm.peakWindowLengthMin] as [number, number];
  }, [done, controller.generation]);

  useEffect(() => {
    const node = el.current;
    if (!node || table) return;
    const x = Array.from({ length: minutes }, (_, i) => i);
    const layers = STACK.map((st) => x.map((i) => s.states[i * 6 + st]));
    chart.current?.destroy();
    chart.current = stackedChart(node, x.length ? x : [0], x.length ? layers : STACK.map(() => [0]), STACK.map((st) => token(`--seat-${st}`)), STACK.map((st) => trText(SEAT_LABELS[st])), seats, (v) => clock(cfg.crowd.windowStart, v * 60_000), shade);
    return () => { chart.current?.destroy(); chart.current = null; };
  }, [minutes, shade, table, controller.generation, themeGen.value, language.value]);

  return (
    <figure class="series">
      <figcaption>{rich("{v0} Seat states over time{v1}", { v0: (<span class="pane-key">{localise(side === 0 ? 'A' : 'B')}</span>), v1: (<button type="button" class="linklike" onClick={() => setTable(!table)} aria-pressed={table}>{localise(table ? 'Show chart' : 'Show table')}</button>) })}</figcaption>
      {localise(table ? (
        <div class="table-scroll">
          <table class="data">
            <thead><tr><th scope="col">{trText("Time")}</th>{localise(STACK.map((st) => <th scope="col" key={st}>{localise(SEAT_LABELS[st])}</th>))}</tr></thead>
            <tbody>
              {localise(Array.from({ length: minutes }, (_, i) => (
                <tr key={i}><th scope="row" class="num">{localise(clock(cfg.crowd.windowStart, i * 60_000))}</th>{localise(STACK.map((st) => <td class="num" key={st}>{localise(num(s.states[i * 6 + st], 1))}</td>))}</tr>
              )))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={el} class="chart" role="img" aria-label={trText((trText("Seat states over time in canteen {v0}", { v0: (side === 0 ? 'A' : 'B') })))} />
      ))}
    </figure>
  );
}

export function BottomStrip() {
  return (
    <div class="bottom">
      <AdvantageStrip />
      <div class="series-row">
        <SeriesPanel side={0} />
        <SeriesPanel side={1} />
      </div>
    </div>
  );
}
