import { CLASS_LABELS, OBJECT_NAMES, SEAT_LABELS, seatOpenLabel } from './labels';
import { applied, controller, hover, tick } from './store';

/** Hover / tap card for a person or a table (spec §11.7). */
export function HoverCard() {
  void tick.value;
  const h = hover.value;
  if (!h) return null;
  const e = h.side === 0 ? controller.A : controller.B;
  const v = e.view();
  const s = e.static;
  const style = { left: `${Math.min(h.x + 14, window.innerWidth - 260)}px`, top: `${Math.min(h.y + 14, window.innerHeight - 180)}px` };
  if (h.kind === 'person') {
    const p = h.person;
    if (!v.active[p]) return null;
    const mins = Math.max(0, Math.floor((e.nowMs - v.since[p]) / 60_000));
    return (
      <div class="hovercard" style={style} role="status">
        <b>{h.side === 0 ? 'A' : 'B'} · group {s.groupId[s.personGroup[p]]}</b>
        <span>Group of {s.groupSize[p]}{h.side === 0 && s.isReserver[p] ? (v.isClaimer[p] ? ' · claimer' : ' · reserver') : ''}</span>
        <span>{CLASS_LABELS[v.cls[p]]}, {mins} min</span>
      </div>
    );
  }
  const t = h.table;
  const k2 = 2 * e.layout.seatsPerSide;
  const states = Array.from({ length: k2 }, (_, j) => v.seatState[t * k2 + j]);
  const free = states.filter((x) => x === 0 || x === 1 || x === 2).length;
  const claimed = v.tableClaimed[t] === 1;
  return (
    <div class="hovercard" style={style} role="status">
      <b>{h.side === 0 ? 'A' : 'B'} · table {t + 1}</b>
      {claimed && <span>Reserved with a {OBJECT_NAMES[v.tableObject[t]]} for {Math.floor((e.nowMs - v.tableClaimSince[t]) / 60_000)} min</span>}
      <ul class="hovercard-seats">
        {states.map((st, j) => (
          <li key={j}><span class="sw" style={{ background: `var(--seat-${st})` }} /> {st === 1 ? seatOpenLabel(Math.min(applied.value.reserve.shareMaxParty, free)) : SEAT_LABELS[st]}</li>
        ))}
      </ul>
    </div>
  );
}
