import type { Live } from '../sim/engine';
import { int, num } from './format';
import { COUNTERS, SEAT_LABELS } from './labels';
import { controller, tick } from './store';

const SEAT_ORDER = [5, 4, 3, 1, 2, 0]; // occupied, held, claimedEmpty, openToSmall, blockedLeftover, free

function SeatBar({ live, seats }: { live: Live; seats: number }) {
  return (
    <div class="seatbar" role="img" aria-label={SEAT_ORDER.map((s) => `${SEAT_LABELS[s]}: ${live.seatsByState[s]}`).join(', ')}>
      <div class="seatbar-track">
        {SEAT_ORDER.map((s) => {
          const n = live.seatsByState[s];
          const w = (100 * n) / seats;
          return n > 0 ? (
            <span key={s} class="seatbar-seg" style={{ width: `${w}%`, background: `var(--seat-${s})` }} title={`${SEAT_LABELS[s]}: ${n}`}>
              {w > 9 ? <span class="seatbar-n num">{n}</span> : null}
            </span>
          ) : null;
        })}
      </div>
      <ul class="seatbar-key">
        {SEAT_ORDER.map((s) => (
          <li key={s}>
            <span class="sw" style={{ background: `var(--seat-${s})` }} />
            {SEAT_LABELS[s]} <b class="num">{live.seatsByState[s]}</b>
          </li>
        ))}
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
    int(live.walkAways),
    int(live.sitStartsLast60),
    live.entranceToSeatMeanMin === null ? '—' : `${num(live.entranceToSeatMeanMin, 1)} min`,
  ];
}

function Info({ text }: { text: string }) {
  return (
    <button type="button" class="info" aria-label={text} title={text}>
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
    <section class="live" aria-label="Live counters">
      {[A, B].map((live, side) => (
        <div class={`live-col live-${side === 0 ? 'a' : 'b'}`} key={side}>
          <SeatBar live={live} seats={seats} />
          <dl class="counters">
            {COUNTERS.map((c, i) => (
              <div class="counter" key={c.id}>
                <dt>{c.label} <Info text={c.help} /></dt>
                <dd class="num">{(side === 0 ? vA : vB)[i]}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
      <table class="live-merged">
        <thead>
          <tr><th scope="col">Now</th><th scope="col">A</th><th scope="col">B</th></tr>
        </thead>
        <tbody>
          {SEAT_ORDER.map((s) => (
            <tr key={`s${s}`}>
              <th scope="row"><span class="sw" style={{ background: `var(--seat-${s})` }} /> {SEAT_LABELS[s]}</th>
              <td class="num">{A.seatsByState[s]}</td>
              <td class="num">{B.seatsByState[s]}</td>
            </tr>
          ))}
          {COUNTERS.map((c, i) => (
            <tr key={c.id}>
              <th scope="row">{c.label}</th>
              <td class="num">{vA[i]}</td>
              <td class="num">{vB[i]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
