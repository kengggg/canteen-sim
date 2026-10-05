import { localise, msg as trText } from '../i18n';
import type { Live } from '../sim/engine';
import { int, num } from './format';
import { COUNTERS, SEAT_LABELS } from './labels';
import { controller, tick } from './store';

const SEAT_ORDER = [5, 4, 3, 1, 2, 0]; // occupied, held, claimedEmpty, openToSmall, blockedLeftover, free

function SeatBar({ live, seats }: { live: Live; seats: number }) {
  return (
    <div class="seatbar" role="img" aria-label={trText((SEAT_ORDER.map((s) => `${trText(SEAT_LABELS[s])}: ${live.seatsByState[s]}`).join(', ')))}>
      <div class="seatbar-track">
        {localise(SEAT_ORDER.map((s) => {
          const n = live.seatsByState[s];
          const w = (100 * n) / seats;
          return n > 0 ? (
            <span key={s} class="seatbar-seg" style={{ width: `${w}%`, background: `var(--seat-${s})` }} title={trText((`${trText(SEAT_LABELS[s])}: ${n}`))}>
              {localise(w > 9 ? <span class="seatbar-n num" style={s === 0 ? { color: 'var(--ink)' } : undefined}>{localise(n)}</span> : null)}
            </span>
          ) : null;
        }))}
      </div>
      <ul class="seatbar-key">
        {localise(SEAT_ORDER.map((s) => (
          <li key={s}>
            <span class="sw" style={{ background: `var(--seat-${s})` }} />
            {localise(SEAT_LABELS[s])} <b class="num">{localise(live.seatsByState[s])}</b>
          </li>
        )))}
      </ul>
    </div>
  );
}

function values(live: Live, isA: boolean): string[] {
  return [
    int(live.queuing),
    int(live.searchingWithFood),
    isA ? int(live.claiming) : '—',
    int(live.standingWithFood),
    trText("{v0} (door {v1} · queue {v2})", { v0: (int(live.left)), v1: (int(live.leftDoor)), v2: (int(live.leftQueue)) }),
    int(live.sitStartsLast60),
    live.entranceToSeatMeanMin === null ? '—' : trText("{v0} min", { v0: (num(live.entranceToSeatMeanMin, 1)) }),
  ];
}

function Info({ text }: { text: string }) {
  return (
    <button type="button" class="info" aria-label={trText((text))} title={trText((text))}>
      ⓘ
    </button>
  );
}

/** Live counters (spec §7.6): under each viewport when wide, one merged metric | A | B table when narrow. */
export function LiveStats() {
  void tick.value;
  const A = controller.A.live(), B = controller.B.live();
  const seats = controller.A.layout.seats.length;
  const vA = values(A, true), vB = values(B, false);
  return (
    <section class="live" aria-label={trText("Live counters")}>
      {localise([A, B].map((live, side) => (
        <div class={`live-col live-${side === 0 ? 'a' : 'b'}`} key={side}>
          <SeatBar live={live} seats={seats} />
          <dl class="counters">
            {localise(COUNTERS.map((c, i) => (
              <div class="counter" key={c.id}>
                <dt>{localise(c.label)} <Info text={trText((c.help))} /></dt>
                <dd class="num">{localise((side === 0 ? vA : vB)[i])}</dd>
              </div>
            )))}
          </dl>
        </div>
      )))}
      <table class="live-merged">
        <thead>
          <tr><th scope="col">{trText("Now")}</th><th scope="col">{trText("A")}</th><th scope="col">{trText("B")}</th></tr>
        </thead>
        <tbody>
          {localise(SEAT_ORDER.map((s) => (
            <tr key={`s${s}`}>
              <th scope="row"><span class="sw" style={{ background: `var(--seat-${s})` }} /> {localise(SEAT_LABELS[s])}</th>
              <td class="num">{localise(A.seatsByState[s])}</td>
              <td class="num">{localise(B.seatsByState[s])}</td>
            </tr>
          )))}
          {localise(COUNTERS.map((c, i) => (
            <tr key={c.id}>
              <th scope="row">{localise(c.label)}</th>
              <td class="num">{localise(vA[i])}</td>
              <td class="num">{localise(vB[i])}</td>
            </tr>
          )))}
        </tbody>
      </table>
    </section>
  );
}
