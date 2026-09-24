/** UI formatting with integer math or an explicit en-GB locale (spec §12.3), so every browser locale renders alike. */

const pad2 = (n: number) => (n < 10 ? '0' : '') + n;

/** Clock time "HH:MM" for sim ms after the window start (minutes since midnight). */
export function clock(windowStartMin: number, simMs: number): string {
  const total = windowStartMin + Math.floor(simMs / 60_000);
  const h = Math.floor(total / 60) % 24;
  return `${pad2(h)}:${pad2(total % 60)}`;
}

/** "HHMM" / "HH:MM" → minutes since midnight, or null. */
export function parseClock(s: string): number | null {
  const m = /^(\d{1,2}):?(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

/** Fixed decimals, "." separator, "—" for null. */
export function num(x: number | null | undefined, digits = 1): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return '—';
  const s = x.toFixed(digits);
  return /^-0(\.0+)?$/.test(s) ? s.slice(1) : s;
}

/** Integer with thin grouping (1,801 style, en-GB). */
export function int(x: number | null | undefined): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return '—';
  const s = String(Math.round(Math.abs(x)));
  const g = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (x < 0 ? '-' : '') + g;
}

export const pct = (x: number | null | undefined, digits = 1) => (x === null || x === undefined ? '—' : `${num(x, digits)}%`);

/** Axis tick labels with "." decimals whatever the browser locale (uPlot's default uses Intl). */
export function axisNumber(v: number): string {
  if (!Number.isFinite(v)) return '';
  const a = Math.abs(v);
  const digits = a === 0 || a >= 10 ? 0 : a >= 1 ? 1 : a >= 0.1 ? 2 : 3;
  return num(v, digits);
}
