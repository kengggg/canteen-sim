export interface LayoutParams {
  cols: number;
  rows: number;
  seatsPerSide: number;
  verticalAisleMm: number; // multiple of 50
  horizontalAisleMm: number; // multiple of 50
  stallCount: number;
  queueDepthMm: number; // multiple of 100
}

export const STALL_BAND_MM = 3000;
export const WALKWAY_MM = 1400;
export const CONCOURSE_MM = 3000;
export const TABLE_DEPTH_MM = 800;
export const CHAIR_ZONE_MM = 500;
export const SEAT_PITCH_MM = 600;
export const LANE_MM = 600;
export const MIN_FRONTAGE_MM = 1800;
export const DOOR_MM = 2000;

export interface Table { id: number; row: number; col: number; x0: number; y0: number; x1: number; y1: number; cx: number; cy: number }
export interface Seat { id: number; table: number; side: 0 | 1; i: number; x: number; y: number; line: number }
export interface Stall {
  id: number;
  band: 'top' | 'left';
  start: number; // xw for top stalls, yn for left stalls
  frontage: number;
  stopX: number;
  stopY: number;
  slots: { x: number; y: number }[]; // slots[j] is queue position j + 1
}
export interface HLine { index: number; y: number; x0: number; x1: number; widthMm: number }
export interface VLine { index: number; x: number; y0: number; y1: number; widthMm: number; kind: 'leftWalkway' | 'aisle' }

export interface Layout {
  params: LayoutParams;
  W: number;
  H: number;
  blockX: number;
  blockY: number;
  tableLength: number;
  tables: Table[];
  seats: Seat[];
  stalls: Stall[];
  topStalls: number;
  leftStalls: number;
  slotsPerLine: number;
  queueCapacity: number;
  entranceX: number;
  exitX: number;
  trayX: number;
  hLines: HLine[];
  vLines: VLine[];
}

const ROW_UNIT_MM = TABLE_DEPTH_MM + 2 * CHAIR_ZONE_MM;

export function buildLayout(p: LayoutParams): Layout {
  const { cols: C, rows: R, seatsPerSide: k, verticalAisleMm: Wv, horizontalAisleMm: Wh, stallCount: S, queueDepthMm: Q } = p;
  const Lt = SEAT_PITCH_MM * k;
  const Bw = C * Lt + (C + 1) * Wv;
  const Bh = R * ROW_UNIT_MM + (R - 1) * Wh;
  const W = STALL_BAND_MM + Q + Bw;
  const H = STALL_BAND_MM + Q + Bh + CONCOURSE_MM;
  const blockX = STALL_BAND_MM + Q;
  const blockY = STALL_BAND_MM + Q;

  const tables: Table[] = [];
  const seats: Seat[] = [];
  for (let row = 0; row < R; row++) {
    for (let col = 0; col < C; col++) {
      const id = row * C + col;
      const x0 = blockX + Wv + col * (Lt + Wv);
      const y0 = blockY + row * (ROW_UNIT_MM + Wh) + CHAIR_ZONE_MM;
      const t: Table = { id, row, col, x0, y0, x1: x0 + Lt, y1: y0 + TABLE_DEPTH_MM, cx: x0 + Lt / 2, cy: y0 + TABLE_DEPTH_MM / 2 };
      tables.push(t);
      for (const side of [0, 1] as const) {
        for (let i = 0; i < k; i++) {
          seats.push({
            id: id * 2 * k + side * k + i,
            table: id,
            side,
            i,
            x: x0 + 300 + SEAT_PITCH_MM * i,
            y: side === 0 ? y0 - 250 : t.y1 + 250,
            line: side === 0 ? row : row + 1,
          });
        }
      }
    }
  }

  const Ft = W;
  const Fl = H - STALL_BAND_MM - Q;
  const top = Math.round((S * Ft) / (Ft + Fl));
  const left = S - top;
  const m = Math.floor((Q - WALKWAY_MM) / LANE_MM);
  const walkwayY = STALL_BAND_MM + Q - 700;
  const walkwayX = STALL_BAND_MM + Q - 700;
  const stalls: Stall[] = [];
  for (let j = 0; j < top; j++) {
    const xw = Math.round((j * Ft) / top);
    const f = Math.round(((j + 1) * Ft) / top) - xw;
    const slots: { x: number; y: number }[] = [];
    for (let s = 0; s < m; s++) slots.push({ x: xw + 300, y: 3300 + 600 * s });
    for (let s = m - 1; s >= 0; s--) slots.push({ x: xw + 900, y: 3300 + 600 * s });
    stalls.push({ id: j, band: 'top', start: xw, frontage: f, stopX: xw + 1200 + Math.round((f - 1200) / 2), stopY: walkwayY, slots });
  }
  for (let j = 0; j < left; j++) {
    const yn = blockY + Math.round((j * Fl) / left);
    const f = blockY + Math.round(((j + 1) * Fl) / left) - yn;
    const slots: { x: number; y: number }[] = [];
    for (let s = 0; s < m; s++) slots.push({ x: 3300 + 600 * s, y: yn + f - 300 });
    for (let s = m - 1; s >= 0; s--) slots.push({ x: 3300 + 600 * s, y: yn + f - 900 });
    stalls.push({ id: top + j, band: 'left', start: yn, frontage: f, stopX: walkwayX, stopY: yn + Math.round((f - 1200) / 2), slots });
  }

  const concourseY = H - 1500;
  const firstAisleX = blockX + Wv / 2;
  const lastAisleX = blockX + C * (Lt + Wv) + Wv / 2;
  const hLines: HLine[] = [{ index: 0, y: walkwayY, x0: 0, x1: W, widthMm: WALKWAY_MM }];
  for (let r = 0; r < R - 1; r++) {
    hLines.push({ index: r + 1, y: blockY + r * (ROW_UNIT_MM + Wh) + ROW_UNIT_MM + Wh / 2, x0: walkwayX, x1: lastAisleX, widthMm: Wh });
  }
  hLines.push({ index: R, y: concourseY, x0: walkwayX, x1: lastAisleX, widthMm: CONCOURSE_MM });
  const vLines: VLine[] = [{ index: 0, x: walkwayX, y0: walkwayY, y1: concourseY, widthMm: WALKWAY_MM, kind: 'leftWalkway' }];
  for (let j = 0; j <= C; j++) {
    vLines.push({ index: j + 1, x: firstAisleX + j * (Lt + Wv), y0: walkwayY, y1: concourseY, widthMm: Wv, kind: 'aisle' });
  }

  return {
    params: p, W, H, blockX, blockY, tableLength: Lt, tables, seats, stalls,
    topStalls: top, leftStalls: left, slotsPerLine: m, queueCapacity: 2 * m,
    entranceX: Math.round(0.7 * W), exitX: Math.round(0.85 * W), trayX: blockX + 2000,
    hLines, vLines,
  };
}
