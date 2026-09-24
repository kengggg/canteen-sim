import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { axisNumber } from './format';

/** Chart helpers (uPlot). Colours come from the CSS tokens so both themes read correctly. */
export function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const axis = () => ({
  stroke: token('--muted'),
  grid: { stroke: token('--line'), width: 1 },
  ticks: { stroke: token('--line'), width: 1 },
  font: `12px ${token('--font') || 'system-ui'}`,
});

/**
 * Stacked seat-state areas (spec §7.6): series drawn from the top of the stack down so each fill covers the one below.
 * `layers[k][i]` is the mean seat count of state k in minute i (bottom layer first).
 */
export function stackedChart(el: HTMLElement, x: number[], layers: number[][], colors: string[], names: string[], ymax: number, fmtX: (v: number) => string, shade?: [number, number] | null): uPlot {
  const cum: number[][] = [];
  layers.forEach((l, k) => cum.push(l.map((v, i) => v + (k > 0 ? cum[k - 1][i] : 0))));
  const order = [...cum.keys()].reverse();
  const opts: uPlot.Options = {
    width: Math.max(200, el.clientWidth),
    height: 170,
    legend: { show: false },
    cursor: { drag: { x: false, y: false }, points: { show: false } },
    scales: { x: { time: false }, y: { range: [0, ymax] } },
    axes: [{ ...axis(), values: (_u, vals) => vals.map((v) => fmtX(v)) }, { ...axis(), size: 44, values: (_u, vals) => vals.map(axisNumber) }],
    series: [{}, ...order.map((k) => ({ label: names[k], stroke: colors[k], fill: colors[k], width: 0, points: { show: false } }))],
    hooks: shade
      ? {
          drawClear: [
            (u: uPlot) => {
              const ctx = u.ctx;
              const x0 = u.valToPos(shade[0], 'x', true), x1 = u.valToPos(shade[1], 'x', true);
              ctx.save();
              ctx.fillStyle = token('--panel-2');
              ctx.fillRect(x0, u.bbox.top, x1 - x0, u.bbox.height);
              ctx.restore();
            },
          ],
        }
      : {},
  };
  return new uPlot(opts, [x, ...order.map((k) => cum[k])], el);
}

/** Mean paired difference per level with its 95% CI band (spec §10.3 charts). */
export function diffChart(el: HTMLElement, x: number[], mean: (number | null)[], lo: (number | null)[], hi: (number | null)[], fmtX: (v: number) => string, unit: string): uPlot {
  const accent = token('--accent');
  const opts: uPlot.Options = {
    width: Math.max(220, el.clientWidth),
    height: 180,
    legend: { show: false },
    cursor: { drag: { x: false, y: false } },
    scales: { x: { time: false } },
    axes: [{ ...axis(), values: (_u, vals) => vals.map((v) => fmtX(v)) }, { ...axis(), size: 52, label: unit, labelSize: 16, values: (_u, vals) => vals.map(axisNumber) }],
    series: [
      {},
      { label: 'hi', stroke: 'transparent', points: { show: false } },
      { label: 'lo', stroke: 'transparent', points: { show: false } },
      { label: 'mean', stroke: accent, width: 2, points: { show: true, size: 6, fill: accent } },
      { label: 'zero', stroke: token('--muted'), width: 1, dash: [4, 4], points: { show: false } },
    ],
    bands: [{ series: [1, 2], fill: `${accent}33` }],
  };
  const zero = x.map(() => 0);
  return new uPlot(opts, [x, hi as number[], lo as number[], mean as number[], zero], el);
}
