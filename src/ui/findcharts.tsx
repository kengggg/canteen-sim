import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';

/**
 * Small inline-SVG charts for the Findings panel (spec §11.13). Colours are CSS custom properties, so a theme switch
 * restyles them without a redraw. Lines also differ by dash pattern, so levels never rely on colour alone. Each chart
 * sits in a ChartFigure with a table alternative; the SVG is aria-hidden and the figure carries the accessible name.
 */

export interface Series {
  label: string;
  /** Short name for a direct label beside the last stacked bar. */
  short?: string;
  /** A CSS colour, normally `var(--token)`. */
  color: string;
  values: (number | null)[];
  /** Diagonal hatching over the colour (a sub-part of a state that has the same colour). */
  hatch?: boolean;
  /** An outline for a fill close to the chart background. */
  outline?: boolean;
  /** SVG stroke-dasharray for lines. */
  dash?: string;
}

const H = 230;
const PAD = { l: 44, r: 10, t: 10, b: 26 };
let uid = 0;

function useWidth(): [{ current: HTMLDivElement | null }, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(560);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => setW(Math.max(240, Math.floor(el.clientWidth)));
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function Hatch({ id, color }: { id: string; color: string }) {
  // The pale stripe lies wholly inside the tile, so bars and the legend swatch show the same 2-in-6 stripes.
  return (
    <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="6" height="6" style={{ fill: color }} />
      <rect x="0" y="0" width="2" height="6" style={{ fill: 'var(--panel)' }} />
    </pattern>
  );
}

export function Legend({ series, lines = false }: { series: Series[]; lines?: boolean }) {
  return (
    <ul class="flegend">
      {series.map((s) => (
        <li key={s.label}>
          {lines ? (
            <svg class="sw-line" width="26" height="10" aria-hidden="true">
              <line x1="1" y1="5" x2="25" y2="5" style={{ stroke: s.color, strokeWidth: 2.5, strokeDasharray: s.dash ?? 'none' }} />
            </svg>
          ) : (
            <span class={`sw${s.hatch ? ' sw-hatch' : ''}${s.outline ? ' sw-outline' : ''}`} style={{ '--sw': s.color } as Record<string, string>} />
          )}
          {s.label}
        </li>
      ))}
    </ul>
  );
}

function YAxis({ ticks, y, x0, x1, fmt, title }: { ticks: number[]; y: (v: number) => number; x0: number; x1: number; fmt: (v: number) => string; title?: string }) {
  return (
    <g class="faxis">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x0} x2={x1} y1={y(t)} y2={y(t)} class="fgrid" />
          <text x={x0 - 6} y={y(t)} dy="0.32em" text-anchor="end">{fmt(t)}</text>
        </g>
      ))}
      {title && <text x={4} y={12} class="ftitle">{title}</text>}
    </g>
  );
}

/** Stacked bars, one per category; `series` bottom first; values are shares of `yMax`. */
export function StackedBars({ categories, series, yMax = 1, ticks, fmt, labelLast = false }: {
  categories: string[]; series: Series[]; yMax?: number; ticks: number[]; fmt: (v: number) => string; labelLast?: boolean;
}) {
  const [ref, w] = useWidth();
  const [id] = useState(() => `fc${++uid}`);
  const direct = labelLast && w >= 520;
  const padR = direct ? 190 : PAD.r;
  const plotW = w - PAD.l - padR, plotH = H - PAD.t - PAD.b;
  const y = (v: number) => PAD.t + plotH - (v / yMax) * plotH;
  const band = plotW / categories.length, barW = Math.min(64, band * 0.62);
  const last = categories.length - 1;
  const lastX = PAD.l + band * last + (band - barW) / 2 + barW;
  // Direct labels for the last bar: segments of at least 2% of the scale, pushed apart to 12 px, top to bottom.
  const labels: { y: number; text: string; mid: number }[] = [];
  if (direct) {
    let acc = 0;
    for (const s of series) {
      const v = s.values[last] ?? 0;
      if (v >= 0.02 * yMax) labels.push({ mid: y(acc + v / 2), y: y(acc + v / 2), text: `${s.short ?? s.label} ${fmt(v)}` });
      acc += v;
    }
    labels.sort((a, b) => a.mid - b.mid);
    for (let i = 1; i < labels.length; i++) labels[i].y = Math.max(labels[i].y, labels[i - 1].y + 12);
    const overflow = labels.length ? labels[labels.length - 1].y - (PAD.t + plotH) : 0;
    if (overflow > 0) for (const l of labels) l.y -= overflow;
  }
  return (
    <div ref={ref} class="fsvg">
      <svg width={w} height={H} aria-hidden="true">
        <defs>{series.map((s, k) => s.hatch && <Hatch key={k} id={`${id}-h${k}`} color={s.color} />)}</defs>
        <YAxis ticks={ticks} y={y} x0={PAD.l} x1={w - padR} fmt={fmt} />
        {categories.map((c, i) => {
          const x = PAD.l + band * i + (band - barW) / 2;
          let acc = 0;
          return (
            <g key={c}>
              {series.map((s, k) => {
                const v = s.values[i] ?? 0;
                const y0 = y(acc), y1 = y(acc + v);
                acc += v;
                return v > 0 ? (
                  <rect key={k} x={x} y={y1} width={barW} height={Math.max(0, y0 - y1)} class={s.outline ? 'fseg fseg-outline' : 'fseg'} style={{ fill: s.hatch ? `url(#${id}-h${k})` : s.color }}>
                    <title>{`${c} · ${s.label}: ${fmt(v)}`}</title>
                  </rect>
                ) : null;
              })}
              <text x={x + barW / 2} y={H - 8} text-anchor="middle" class="flabel">{c}</text>
            </g>
          );
        })}
        {labels.map((l) => (
          <g key={l.text} class="fdirect">
            <line x1={lastX + 2} x2={lastX + 10} y1={l.mid} y2={l.y} />
            <text x={lastX + 13} y={l.y} dy="0.32em">{l.text}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/** Grouped bars: one group per category, one bar per series. */
export function GroupedBars({ categories, series, yMax, ticks, fmt }: { categories: string[]; series: Series[]; yMax: number; ticks: number[]; fmt: (v: number) => string }) {
  const [ref, w] = useWidth();
  const plotW = w - PAD.l - PAD.r, plotH = H - PAD.t - PAD.b;
  const y = (v: number) => PAD.t + plotH - (Math.min(v, yMax) / yMax) * plotH;
  const band = plotW / categories.length, inner = band * 0.8, barW = inner / series.length;
  return (
    <div ref={ref} class="fsvg">
      <svg width={w} height={H} aria-hidden="true">
        <YAxis ticks={ticks} y={y} x0={PAD.l} x1={w - PAD.r} fmt={fmt} />
        {categories.map((c, i) => {
          const x0 = PAD.l + band * i + (band - inner) / 2;
          return (
            <g key={c}>
              {series.map((s, k) => {
                const v = s.values[i];
                if (v === null || v === undefined) return null;
                return (
                  <rect key={k} x={x0 + k * barW + 0.5} y={y(v)} width={Math.max(1, barW - 1)} height={Math.max(0, y(0) - y(v))} style={{ fill: s.color }}>
                    <title>{`${c} · ${s.label}: ${fmt(v)}`}</title>
                  </rect>
                );
              })}
              <text x={x0 + inner / 2} y={H - 8} text-anchor="middle" class="flabel">{c}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Lines over a numeric x axis (minutes); null values break a line. An optional vertical rule marks one x. */
export function Lines({ x, series, yMax, ticks, fmt, xTicks, xFmt, xRange, rule, yTitle }: {
  x: number[]; series: Series[]; yMax: number; ticks: number[]; fmt: (v: number) => string;
  xTicks: number[]; xFmt: (v: number) => string; xRange?: [number, number]; rule?: { x: number; label: string }; yTitle?: string;
}) {
  const [ref, w] = useWidth();
  const top = yTitle ? 26 : PAD.t;
  const plotW = w - PAD.l - PAD.r, plotH = H - top - PAD.b;
  const [x0, x1] = xRange ?? [x[0], x[x.length - 1]];
  const sx = (v: number) => PAD.l + ((v - x0) / (x1 - x0)) * plotW;
  const sy = (v: number) => top + plotH - (Math.min(v, yMax) / yMax) * plotH;
  const path = (vals: (number | null)[]) => {
    let d = '', pen = false;
    vals.forEach((v, i) => {
      if (v === null || !Number.isFinite(v)) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${sx(x[i]).toFixed(1)},${sy(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const stepEvery = w < 420 ? 2 : 1;
  return (
    <div ref={ref} class="fsvg">
      <svg width={w} height={H} aria-hidden="true">
        <YAxis ticks={ticks} y={sy} x0={PAD.l} x1={w - PAD.r} fmt={fmt} title={yTitle} />
        {xTicks.filter((_, i) => i % stepEvery === 0).map((t) => {
          // Edge labels anchor inward so they are never clipped.
          const px = sx(t);
          const anchor = px - PAD.l < 16 ? 'start' : w - PAD.r - px < 16 ? 'end' : 'middle';
          return <text key={t} x={anchor === 'end' ? w - 2 : px} y={H - 8} text-anchor={anchor} class="flabel">{xFmt(t)}</text>;
        })}
        {rule && (
          <g class="frule">
            <line x1={sx(rule.x)} x2={sx(rule.x)} y1={top} y2={top + plotH} />
            <text x={sx(rule.x) + 4} y={top + 10}>{rule.label}</text>
          </g>
        )}
        {series.map((s) => (
          <path key={s.label} d={path(s.values)} style={{ fill: 'none', stroke: s.color, strokeWidth: 2.25, strokeLinejoin: 'round', strokeDasharray: s.dash ?? 'none' }}>
            <title>{s.label}</title>
          </path>
        ))}
      </svg>
    </div>
  );
}

/** A table that may scroll sideways: focusable and named, so keyboard users can scroll it too. */
export function ScrollTable({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <div class="table-scroll" tabIndex={0} role="region" aria-label={label}>
      {children}
    </div>
  );
}

/** A captioned chart with a legend, a note and a Show table / Show chart switch. */
export function ChartFigure({ title, label, note, legend, lineLegend = false, table, children }: {
  title: string; label: string; note?: ComponentChildren; legend?: Series[]; lineLegend?: boolean; table: ComponentChildren; children: ComponentChildren;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <figure class="fchart">
      <figcaption>
        <b>{title}</b>
        <button type="button" class="linklike" onClick={() => setAsTable(!asTable)}>{asTable ? 'Show chart' : 'Show table'}</button>
      </figcaption>
      {asTable ? (
        <ScrollTable label={`${title}: table`}>{table}</ScrollTable>
      ) : (
        <div role="img" aria-label={label}>
          {children}
          {legend && <Legend series={legend} lines={lineLegend} />}
        </div>
      )}
      {note && <p class="fchart-note muted">{note}</p>}
    </figure>
  );
}
