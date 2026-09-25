import type { ComponentChildren } from 'preact';
import type { Findings, ReserveLevelKey } from '../batch/findings-data';
import { presetConfig } from '../config/presets';
import { defaultConfig } from '../config/schema';
import findingsJson from '../generated/findings.json';
import { MODEL_VERSION } from '../sim/version';
import { EVIDENCE, evidenceBatch } from './evidence';
import { ChartFigure, GroupedBars, Lines, StackedBars, type Series } from './findcharts';
import { findingsModel, LEVELS, levelKey, RESERVE_LEVELS, type FindingsModel, type Gap } from './findings-model';
import { clock, int, num } from './format';
import { SEAT_LABELS } from './labels';
import { applied, drawer } from './store';

/** Findings panel (spec §11.13): what the default evidence shows, with every number taken from the data. */

const FINDINGS = findingsJson as unknown as Findings;
const CFG = defaultConfig();
let cached: FindingsModel | null = null;
export function getFindingsModel(): FindingsModel {
  cached ??= findingsModel(evidenceBatch(), FINDINGS, CFG);
  return cached;
}

const MINUS = '−';
const sgn = (x: number, d = 1) => {
  const s = num(Math.abs(x), d);
  return Number(s) === 0 ? s : `${x < 0 ? MINUS : '+'}${s}`;
};
const neg = (x: number, d = 1) => (x < 0 ? `${MINUS}${num(-x, d)}` : num(x, d));
const pc = (share: number, d = 0) => `${num(share * 100, d)}%`;
const lvl = (f: number) => `${Math.round(f * 100)}%`;
const at = (m: number) => clock(CFG.crowd.windowStart, m * 60_000);
const range = (a: string, b: string) => (a === b ? a : `${a}–${b}`);
const rng = (xs: [number, number], d = 0, k = 1) => range(num(xs[0] * k, d), num(xs[1] * k, d));
const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const interval = (g: Gap, d: number) => (g.lo === null || g.hi === null ? '' : ` [${neg(g.lo, d)}, ${neg(g.hi, d)}]`);

const LEVEL_COLORS = ['var(--lvl-0)', 'var(--lvl-1)', 'var(--lvl-2)', 'var(--lvl-3)', 'var(--lvl-4)'];
const levelColor = (f: number) => LEVEL_COLORS[LEVELS.indexOf(f as (typeof LEVELS)[number])];
const pctTick = (v: number) => `${Math.round(v * 100)}%`;

function Section({ id, title, children }: { id: string; title: string; children: ComponentChildren }) {
  return (
    <section class="fsection" aria-labelledby={`f-${id}`}>
      <h3 id={`f-${id}`}>{title}</h3>
      {children}
    </section>
  );
}

function InShort({ m }: { m: FindingsModel }) {
  const [b, , , , all] = m.head;
  const gaps = m.robust.map((r) => r.walkAway.adv);
  return (
    <Section id="short" title="In short">
      <ul class="fbullets">
        <li><b>Walk-aways nearly triple.</b> When every group reserves, {num(all.walkPct, 1)}% of diners walk away instead of {num(b.walkPct, 1)}% ({int(b.walkPeople)} to {int(all.walkPeople)} people per lunch): {sgn(all.walk!.mean)} percentage points{interval(all.walk!, 1)}.</li>
        <li><b>Seats and throughput fall; time barely moves.</b> Peak seat use drops from {num(b.utilPct, 0)}% to {num(all.utilPct, 0)}%, and the best hour seats {int(-all.thrGap!.mean)} fewer people. The trip from entrance to seat grows by only {num(all.e2sS!.mean, 0)} seconds.</li>
        <li><b>A quarter reserving does most of the damage:</b> about two-thirds of the walk-away, seat-use and throughput losses ({range(num(Math.min(m.shareAt25.walk, m.shareAt25.util, m.shareAt25.thr) * 100, 0), num(Math.max(m.shareAt25.walk, m.shareAt25.util, m.shareAt25.thr) * 100, 0))}%).</li>
        <li><b>The cause is idle seats.</b> With every group reserving, {pc(m.reservedEmpty['1'])} of seats at the busiest hour are reserved with nobody in them ({pc(m.reservedEmpty['0.25'])} at 25%), and the empty tables reservers need run out early in the rush.</li>
        <li><b>Who pays:</b> a group that gets a table never walks away; everyone else walks away more often, and reservers who find no table most of all.</li>
        <li><b>It holds beyond the defaults.</b> Free flow had fewer walk-aways in all {m.robust.length} settings tried, by {num(Math.min(...gaps), 1)} to {num(Math.max(...gaps), 1)} percentage points.</li>
      </ul>
    </Section>
  );
}

function HowItWorks({ m }: { m: FindingsModel }) {
  return (
    <Section id="how" title="How the comparison works">
      <ul class="fbullets">
        <li><b>Free flow (canteen B).</b> Each member queues at a stall. The first to get food looks for a table with room for the whole group, seeing {num(CFG.search.visibility, 0)} m around. If none turns up within {num(CFG.search.patience / 60, 0)} minutes, the group walks away with its food as takeaway.</li>
        <li><b>Reservation (canteen A).</b> One member, the claimer, looks for a completely empty table and leaves an object on it while the others queue. A group that finds one has claimed it; after {num(CFG.reserve.claimSearchLimit, 0)} seconds without one, it falls back to free flow.</li>
        <li><b>Sharing.</b> Strangers may join a reserved table only after the group is seated, in parties of up to {CFG.reserve.shareMaxParty}, while at least {CFG.reserve.shareMinEmpty} of its {2 * CFG.layout.seatsPerSide} seats are empty.</li>
        <li><b>The sweep.</b> Each of {m.n} lunches is replayed with 0% (free flow), 25%, 50%, 75% and 100% of groups reserving: the same diners arriving at the same times. Groups that reserve at 25% also reserve at every higher level.</li>
      </ul>
      <div class="table-scroll">
        <table class="data">
          <caption>The four headline measures, fixed in advance</caption>
          <thead><tr><th scope="col">Measure</th><th scope="col">What it counts</th><th scope="col">Better</th></tr></thead>
          <tbody>
            <tr><th scope="row">Walk-aways</th><td>Share of diners whose group gave up on finding seats</td><td>Lower</td></tr>
            <tr><th scope="row">Entrance to seat</th><td>Average minutes from the entrance to sitting down, or to giving up</td><td>Lower</td></tr>
            <tr><th scope="row">Peak seat use</th><td>Average share of seats with someone sitting in them, during the busiest hour</td><td>Higher</td></tr>
            <tr><th scope="row">Peak throughput</th><td>Most people sitting down in any 60 minutes (each run's own best hour)</td><td>Higher</td></tr>
          </tbody>
        </table>
      </div>
      <details class="fdetails">
        <summary>How to read the numbers</summary>
        <ul class="fbullets">
          <li>“pp” means percentage points, the difference between two percentages.</li>
          <li>Each gap is the average of the {m.n} lunch-by-lunch gaps, worked out before rounding, so it can differ by 0.1 from the difference of the rounded averages.</li>
          <li>The 95% range in brackets shows how precisely {m.n} lunches pin down the average gap. Single lunches vary much more, and the range says nothing about whether the model's rules match a real canteen.</li>
          <li>Comparing each level with free flow on the same lunch cancels the variation the two replays share: nearly all of it for time, about half or less for the other three.</li>
          <li>The busiest hour is the 60 minutes in which a reservation run and the free-flow run of the same lunch together have the fewest free seats (a seat counts as taken if someone sits in it, it is saved for a groupmate, or it is reserved).</li>
        </ul>
      </details>
    </Section>
  );
}

function Headline({ m }: { m: FindingsModel }) {
  const all = m.head[4];
  return (
    <Section id="r1" title="1. Reservation loses on every headline measure">
      <p>Each cell shows the level's average over {m.n} lunches, then its gap from free flow, with the 95% range in brackets.</p>
      <div class="table-scroll">
        <table class="data fhead">
          <thead>
            <tr><th scope="col">Groups reserving</th><th scope="col">Walk-aways</th><th scope="col">Entrance to seat</th><th scope="col">Peak seat use</th><th scope="col">Peak throughput</th></tr>
          </thead>
          <tbody>
            {m.head.map((r) => (
              <tr key={r.f}>
                <th scope="row">{r.f === 0 ? '0% (free flow)' : lvl(r.f)}</th>
                <td class="num">{num(r.walkPct, 1)}%{r.walk ? `: ${sgn(r.walk.mean)} pp${interval(r.walk, 1)}` : ` (${int(r.walkPeople)} people)`}</td>
                <td class="num">{num(r.e2sMin, 2)} min{r.e2sS ? `: ${sgn(r.e2sS.mean, 0)} s${interval(r.e2sS, 0)}` : ''}</td>
                <td class="num">{num(r.utilPct, 1)}%{r.util ? `: ${sgn(r.util.mean)} pp${interval(r.util, 1)}` : ''}</td>
                <td class="num">{int(r.thr)}{r.thrGap ? `: ${sgn(r.thrGap.mean, 0)}${interval(r.thrGap, 0)}` : ' per hour'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul class="fbullets">
        <li><b>Consistent across lunches.</b> Free flow had fewer walk-aways, higher peak seat use and higher peak throughput in {m.head.slice(1).every((r) => r.walk!.W === m.n && r.util!.W === m.n && r.thrGap!.W === m.n) ? `all ${m.n} lunches at every level` : 'most lunches'}. Entrance to seat was slower under reservation in {list(m.head.slice(1).map((r) => `${r.e2sS!.W} at ${lvl(r.f)}`))} (of {m.n}).</li>
        <li><b>Big where it matters.</b> Walk-aways nearly triple, from {int(m.head[0].walkPeople)} to {int(all.walkPeople)} people per lunch; the time cost is {num(all.e2sS!.mean, 0)} seconds on an {num(m.head[0].e2sMin, 0)}-minute trip.</li>
        <li><b>Most of the damage is done once a quarter of groups reserve.</b> At 25%, walk-aways have already risen {num(m.head[1].walk!.mean, 1)} of the {num(all.walk!.mean, 1)} points they rise at 100% ({pc(m.shareAt25.walk)}); the seat-use and throughput losses are {range(pc(Math.min(m.shareAt25.util, m.shareAt25.thr)).replace('%', ''), pc(Math.max(m.shareAt25.util, m.shareAt25.thr)))} of their full size. Only the small time cost keeps growing ({pc(m.shareAt25.e2s)} at 25%).</li>
        <li><b>Little changes near the top.</b> From 75% to 100%, walk-aways change by {sgn(m.topStep.walk.mean!)} pp [{neg(m.topStep.walk.lo!, 1)}, {sgn(m.topStep.walk.hi!)}] and throughput by {sgn(m.topStep.thr.mean!, 0)} per hour: too small to tell from no change. Time still rises, by {num(m.topStep.e2sS.mean!, 0)} seconds [{num(m.topStep.e2sS.lo!, 0)}, {num(m.topStep.e2sS.hi!, 0)}].</li>
      </ul>
    </Section>
  );
}

function Why({ m }: { m: FindingsModel }) {
  const seatSeries: Series[] = [
    { label: SEAT_LABELS[5], color: 'var(--seat-5)', values: LEVELS.map((f) => m.seats[levelKey(f)].occupied) },
    { label: SEAT_LABELS[4], color: 'var(--seat-4)', values: LEVELS.map((f) => m.seats[levelKey(f)].held) },
    { label: `${SEAT_LABELS[3]}: kept for members still getting food`, color: 'var(--seat-3)', values: LEVELS.map((f) => m.seats[levelKey(f)].waiting) },
    { label: `${SEAT_LABELS[3]}: beyond the group's size`, color: 'var(--seat-3)', hatch: true, values: LEVELS.map((f) => m.seats[levelKey(f)].beyondSize) },
    { label: SEAT_LABELS[2], color: 'var(--seat-2)', values: LEVELS.map((f) => m.seats[levelKey(f)].blocked) },
    { label: SEAT_LABELS[1], color: 'var(--seat-1)', values: LEVELS.map((f) => m.seats[levelKey(f)].open) },
    { label: SEAT_LABELS[0], color: 'var(--seat-0)', values: LEVELS.map((f) => m.seats[levelKey(f)].free) },
  ];
  const cats = LEVELS.map((f) => (f === 0 ? 'Free flow' : lvl(f)));
  const s100 = m.seats['1'];
  const emptyLevels = [0, 0.25, 0.5, 1];
  const emptySeries: Series[] = emptyLevels.map((f) => ({ label: f === 0 ? 'Free flow' : `${lvl(f)} reserving`, color: levelColor(f), values: m.empty.byLevel[levelKey(f)] }));
  const e1210 = RESERVE_LEVELS.map((f) => m.emptyAt1210[levelKey(f)]);
  const rush = RESERVE_LEVELS.map((f) => m.rushClaims[String(f) as ReserveLevelKey]);
  return (
    <Section id="r2" title="2. Why: idle seats in the rush">
      <p>Reservation leaves seats idle at the very hour they are needed. With every group reserving, {pc(m.reservedEmpty['1'])} of seats at the busiest hour are reserved with nobody sitting in them ({pc(m.reservedEmpty['0.25'])} when a quarter of groups reserve), and free seats fall from {pc(m.seats['0'].free)} to {pc(s100.free)}.</p>
      <ChartFigure
        title="Seats at the busiest hour"
        label={`Stacked bars of seat states at the busiest hour for free flow and each reservation level. Free seats fall from ${pc(m.seats['0'].free)} to ${pc(s100.free)} as reserved-but-empty seats rise to ${pc(m.reservedEmpty['1'])}.`}
        legend={seatSeries.slice().reverse()}
        note={`Share of seat-time in the busiest hour (about 12:09 to 13:09), average of ${m.n} lunches. The free-flow bar is the baseline of the 100% comparisons.`}
        table={
          <table class="data">
            <thead><tr><th scope="col">Seat state</th>{cats.map((c) => <th scope="col" key={c}>{c}</th>)}</tr></thead>
            <tbody>{seatSeries.slice().reverse().map((s) => <tr key={s.label}><th scope="row">{s.label}</th>{s.values.map((v, i) => <td class="num" key={i}>{pc(v ?? 0, 1)}</td>)}</tr>)}</tbody>
          </table>
        }
      >
        <StackedBars categories={cats} series={seatSeries} ticks={[0, 0.25, 0.5, 0.75, 1]} fmt={pctTick} />
      </ChartFigure>
      <p>At 100% reserving, the reserved-but-empty seats are, as shares of all seats:</p>
      <ul class="fbullets">
        <li><b>Beyond the group's size, {pc(s100.beyondSize, 1)}.</b> A reserving group takes a whole {2 * CFG.layout.seatsPerSide}-seat table whatever its size, so a pair's claim keeps 4 seats empty until the pair has sat down.</li>
        <li><b>Kept for members still getting food, {pc(s100.waiting, 1)}.</b> The table is claimed within about {num(m.claimMedianS100, 0)} seconds of arrival, before anyone has food, so its seats wait out the whole queue.</li>
        <li><b>Spare seats nobody may use, {pc(s100.blocked, 1)}.</b> A group of 3 to 5 leaves too few empty seats to share ({pc(m.blockedNoJoiners100, 1)}), and a solo's or pair's table stops taking strangers once joiners leave fewer than {CFG.reserve.shareMinEmpty} seats empty ({pc(m.blockedAfterJoiners100, 1)}).</li>
        <li><b>Open to solos and pairs only, {pc(s100.open, 1)}.</b> They can be used, but never by the groups of 3 or more who walk away.</li>
      </ul>
      <p>Free flow saves seats too: {pc(m.baselineHeld, 1)} of seats at the busiest hour, {pc(m.baselineHeldNoFood, 1)} of them for groupmates still getting food. But a free-flow group saves seats only once its searcher has food and a table, and only as many as it needs. Over the whole lunch, at the moments when someone holding food was stuck looking for a table, {pc(m.blockedWhileNeeded.b, 1)} of seats were saved for others under free flow, against {pc(m.blockedWhileNeeded.a100, 1)} saved or reserved with every group reserving.</p>
      <ChartFigure
        title="Completely empty tables through lunch"
        label={`Line chart of completely empty tables from 11:00 to 14:00. Under free flow ${num(m.emptyAt1210['0'], 0)} tables are empty at 12:10; with reservation only ${rng([Math.min(...e1210), Math.max(...e1210)])} are.`}
        legend={emptySeries}
        note={`Tables with nobody seated, no seat saved and no reservation object: the only tables a claimer may take. Average of ${m.n} lunches; the rush peaks at 12:15.`}
        table={
          <table class="data">
            <thead><tr><th scope="col">Time</th>{emptySeries.map((s) => <th scope="col" key={s.label}>{s.label}</th>)}</tr></thead>
            <tbody>{m.empty.minutes.map((t, i) => (i % 2 === 0 ? <tr key={t}><th scope="row" class="num">{at(t)}</th>{emptySeries.map((s) => <td class="num" key={s.label}>{num(s.values[i], 1)}</td>)}</tr> : null))}</tbody>
          </table>
        }
      >
        <Lines x={m.empty.minutes} series={emptySeries} yMax={100} ticks={[0, 25, 50, 75, 100]} fmt={(v) => String(v)} xTicks={[0, 30, 60, 90, 120, 150, 180]} xFmt={at} rule={{ x: 75, label: '12:15' }} yTitle="Empty tables (of 100)" />
      </ChartFigure>
      <p>Under free flow, {num(m.emptyAt1210['0'], 0)} of 100 tables are still completely empty at 12:10; with reservation only {rng([Math.min(...e1210), Math.max(...e1210)])} are.{m.scarce100 && ` When every group reserves, fewer than 1.5 remain on average from ${at(m.scarce100[0])} to ${at(m.scarce100[1])}.`} So {pc(m.fallbackNoTarget100)} of the reservers who fall back had no empty table left to head for when their {num(CFG.reserve.claimSearchLimit, 0)} seconds ran out.</p>
      <p><b>Why a quarter does most of the damage, and 75% looks like 100%.</b> Reservers arriving between 12:00 and 13:00 claim nearly the same number of tables at every level, {rng([Math.min(...rush), Math.max(...rush)])} per lunch, so a quarter of groups reserving already puts almost as many reserved tables into the rush as everyone reserving. Extra reservers arriving in the rush add fallbacks ({int(m.rushFallbacks['0.25'])} per lunch at 25%, {int(m.rushFallbacks['1'])} at 100%), not claims. Claims per lunch therefore grow ever more slowly: {list(RESERVE_LEVELS.map((f) => `${int(m.claimsPerLunch[String(f) as ReserveLevelKey])} at ${lvl(f)}`))}.</p>
    </Section>
  );
}

function WhoPays({ m }: { m: FindingsModel }) {
  const rows = [
    ['Reservers who got a table', m.cohorts.Rclaimed],
    ['Reservers who found no table', m.cohorts.Rfallback],
    ['Non-reservers', m.cohorts.N],
    ['All reservers', m.cohorts.R],
  ] as const;
  const arrivalLevels = [0.25, 0.5, 1];
  const bins = m.claimByArrival['0.5'].map((_, i) => i * 10);
  const claimSeries: Series[] = arrivalLevels.map((f) => ({ label: `${lvl(f)} reserving`, color: levelColor(f), values: m.claimByArrival[String(f) as ReserveLevelKey].map((v) => (Number.isFinite(v) ? v : null)) }));
  const sizeSeries: Series[] = LEVELS.map((f) => ({ label: f === 0 ? 'Free flow' : `${lvl(f)} reserving`, color: levelColor(f), values: m.bySize.map((s) => s.pct[levelKey(f)] / 100) }));
  const sizeMax = Math.ceil(Math.max(...m.bySize.map((s) => Math.max(...Object.values(s.pct)))) / 10) * 10 / 100;
  const baseClaimed = Object.values(m.cohorts.Rclaimed).map((c) => c!.baseline);
  const sameTime = m.fallbackVsSameTime;
  const a = m.anatomy;
  return (
    <Section id="r3" title="3. Who pays">
      <p>A group that secures a table never walks away. Everyone else walks away more often than under free flow, and reservers who find no table most of all. Each cell shows walk-aways under reservation, then the same groups in the free-flow replay of the same lunch.</p>
      <div class="table-scroll">
        <table class="data">
          <thead><tr><th scope="col">Group</th>{RESERVE_LEVELS.map((f) => <th scope="col" key={f}>{lvl(f)} reserving</th>)}</tr></thead>
          <tbody>
            {rows.map(([label, cells]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                {RESERVE_LEVELS.map((f) => {
                  const c = cells[String(f) as ReserveLevelKey];
                  return <td class="num" key={f}>{c ? `${num(c.level, 1)}% vs ${num(c.baseline, 1)}%` : '(none)'}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>The share of reserving groups that got a table falls from {list(RESERVE_LEVELS.map((f) => `${pc(m.claimShare[String(f) as ReserveLevelKey])} at ${lvl(f)}`))}.</p>
      <ul class="fbullets">
        <li><b>A table protects its group completely, but the gain is small.</b> The same groups walked away only {rng([Math.min(...baseClaimed), Math.max(...baseClaimed)], 1)}% of the time under free flow. They are not faster either: they reach their seats {rng(m.claimedDelayS)} seconds later, because the claimer searches before queueing and the walk to the claimed table takes a little longer than free flow's search and walk.</li>
        <li><b>Getting a table depends on when you arrive, not on group size.</b> Groups that got a table and groups that did not average {num(m.meanSize.claimed, 1)} and {num(m.meanSize.fallback, 1)} people. At 50% reserving, {m.claimAllBeforeMin50 !== null ? `every reserver arriving before ${at(m.claimAllBeforeMin50)} got a table, against ` : ''}{rng(m.claimShare1210to1250at50, 0, 100)}% of those arriving between 12:10 and 12:50.</li>
        <li><b>Reservers who find no table arrive at the worst time.</b> Half arrive before about {range(at(Math.round(m.fallbackMedianArrival[0])), at(Math.round(m.fallbackMedianArrival[1])))}, when no empty table is left, and then look for seats in a canteen where many tables are reserved. Non-reservers arriving in the same ten minutes walk away almost as often ({list(sameTime.map((s) => `${num(s.atNonReserverRates, 1)}% against ${num(s.actual, 1)}% at ${lvl(s.f)}`))}), so their loss comes mainly from when they arrive.</li>
        <li><b>Non-reservers walk away more often than reservers as a whole</b> ({num(m.cohorts.N['0.25']!.level, 1)}% against {num(m.cohorts.R['0.25']!.level, 1)}% at 25%), yet both walk away more often than when nobody reserves.</li>
      </ul>
      <ChartFigure
        title="Reservers who got a table, by arrival time"
        label="Line chart: nearly every reserver arriving before about 11:50 gets a table; during the rush only a small share do; after about 13:00 most do again."
        legend={claimSeries}
        note={`Share of reserving groups that claimed a table, by the 10 minutes in which they arrived; ${m.n} lunches.`}
        table={
          <table class="data">
            <thead><tr><th scope="col">Arrived</th>{claimSeries.map((s) => <th scope="col" key={s.label}>{s.label}</th>)}</tr></thead>
            <tbody>{bins.map((b, i) => <tr key={b}><th scope="row" class="num">{at(b)}</th>{claimSeries.map((s) => <td class="num" key={s.label}>{s.values[i] === null ? '—' : pc(s.values[i]!)}</td>)}</tr>)}</tbody>
          </table>
        }
      >
        <Lines x={bins} series={claimSeries} yMax={1} ticks={[0, 0.25, 0.5, 0.75, 1]} fmt={pctTick} xTicks={[0, 30, 60, 90, 120]} xFmt={at} yTitle="Got a table" />
      </ChartFigure>
      <p>Reservation also changes which groups give up. Under free flow, groups of 5 and 6 make up {pc(m.bigGroupsWalkShare0)} of the people who walk away, though they are only {pc(m.bigGroupsGroupShare)} of groups ({pc(m.bigGroupsPeopleShare)} of diners). With every group reserving, groups of 3 and 4 make up {pc(m.midGroupsWalkShare.a100)} of the people who walk away, up from {pc(m.midGroupsWalkShare.b)}, because reserved tables leave fewer tables where the whole group fits.</p>
      <ChartFigure
        title="Walk-aways by group size"
        label="Grouped bar chart of walk-away rates for groups of 3 to 6 at each reservation level; rates rise with group size and with the share reserving."
        legend={sizeSeries}
        note={`Share of people in groups of each size whose group walked away; average of ${m.n} lunches. Solos never walked away${m.pairWalkAways.groups === 0 ? ', and neither did pairs.' : m.pairWalkAways.groups === 1 && m.pairWalkAways.level !== null ? `; one pair did, once in the whole sweep (at ${lvl(m.pairWalkAways.level)}).` : `; pairs did ${m.pairWalkAways.groups} times in the whole sweep.`}`}
        table={
          <table class="data">
            <thead><tr><th scope="col">Group size</th>{sizeSeries.map((s) => <th scope="col" key={s.label}>{s.label}</th>)}</tr></thead>
            <tbody>{m.bySize.map((s, i) => <tr key={s.size}><th scope="row">{s.size}</th>{sizeSeries.map((ss) => <td class="num" key={ss.label}>{pc(ss.values[i]!, 1)}</td>)}</tr>)}</tbody>
          </table>
        }
      >
        <GroupedBars categories={m.bySize.map((s) => `Groups of ${s.size}`)} series={sizeSeries} yMax={sizeMax} ticks={[0, sizeMax / 2, sizeMax]} fmt={pctTick} />
      </ChartFigure>
      <p><b>Why groups give up.</b> Of the {int(a.totalGroups)} times a group gave up across all {5 * m.n} runs, {a.tooFew === 0 ? 'every one' : `all but ${a.tooFew}`} happened while the canteen had enough free seats in total for the whole group. Under free flow, one table could have seated the whole group in {pc(a.oneTable0)} of cases; the searcher simply had not found it. Under reservation that share falls to {rng(a.oneTableReserve, 0, 100)}%, and in the other cases the free seats were split across tables, none with room for the whole group.</p>
    </Section>
  );
}

function Time({ m }: { m: FindingsModel }) {
  const t = m.time;
  const rows = [
    ['Entrance to joining a queue', t.baseline.toQueueS, 'toQueueS'],
    ['Queueing and being served', t.baseline.queueAndServiceS, 'queueAndServiceS'],
    ['Food to seat, or to giving up', t.baseline.afterServiceS, 'afterServiceS'],
  ] as const;
  const shares = RESERVE_LEVELS.map((f) => t.byLevel[String(f) as ReserveLevelKey].fallbackClaimerShare);
  const persons = RESERVE_LEVELS.map((f) => t.byLevel[String(f) as ReserveLevelKey].fallbackClaimerPersonS);
  const people = RESERVE_LEVELS.map((f) => t.byLevel[String(f) as ReserveLevelKey].fallbackClaimerPeopleShare);
  const queue = RESERVE_LEVELS.slice(1).map((f) => -t.byLevel[String(f) as ReserveLevelKey].queueAndServiceS);
  return (
    <Section id="r4" title="4. Where the time goes">
      <p>Reservation adds {range(num(t.byLevel['0.25'].totalS, 0), num(t.byLevel['1'].totalS, 0))} seconds to the average trip from entrance to seat, and nearly all of it comes from reservers whose claimer searched for a table and found none. Changes per person against the same person under free flow, in seconds:</p>
      <div class="table-scroll">
        <table class="data">
          <thead><tr><th scope="col">Part of the trip (free-flow time)</th>{RESERVE_LEVELS.map((f) => <th scope="col" key={f}>{lvl(f)}</th>)}</tr></thead>
          <tbody>
            {rows.map(([label, base, k]) => (
              <tr key={k}><th scope="row">{label} ({num(base, 0)} s)</th>{RESERVE_LEVELS.map((f) => <td class="num" key={f}>{sgn(t.byLevel[String(f) as ReserveLevelKey][k])}</td>)}</tr>
            ))}
            <tr class="total"><th scope="row">Whole trip ({num(t.baseline.toQueueS + t.baseline.queueAndServiceS + t.baseline.afterServiceS, 0)} s)</th>{RESERVE_LEVELS.map((f) => <td class="num" key={f}>{sgn(t.byLevel[String(f) as ReserveLevelKey].totalS)}</td>)}</tr>
          </tbody>
        </table>
      </div>
      <ul class="fbullets">
        <li><b>The queue sets the pace.</b> Under free flow, {num(t.baseline.queueWaitS / 60, 0)} of the {num(m.head[0].e2sMin, 0)} minutes are spent queueing and another {num(CFG.stalls.serviceMean / 60, 1)} being served. At the peak the stalls are busy {num(t.stallBusyPeakPct, 0)}% of the time, so no seating rule can shorten the queue.</li>
        <li><b>Reservers who find no table account for nearly all of it.</b> Their claimer searches the full {num(CFG.reserve.claimSearchLimit, 0)} seconds before queueing and ends up {rng([Math.min(...persons), Math.max(...persons)])} seconds later than under free flow. Though only {rng([Math.min(...people), Math.max(...people)], 0, 100)}% of diners, these claimers add {rng([Math.min(...shares), Math.max(...shares)], 0, 100)}% of the extra time (over 100% where everyone else's time falls slightly).</li>
        <li><b>The queue gets {rng([Math.min(...queue), Math.max(...queue)])} seconds shorter, but nobody is served faster.</b> Late claimers let the people behind them move up, then join at the back: waiting moves out of the queue and into the claim search.</li>
        <li><b>This is why time keeps rising after walk-aways level off.</b> Every extra reserver who falls back adds a minute of searching, whether or not a table is left to claim, and fallbacks grow from {int(m.fallbacks75)} to {int(m.fallbacks100)} groups per lunch between 75% and 100%.</li>
        <li><b>The measure understates the cost a little.</b> The clock stops when a group gives up, sometimes before a member's food is ready. Counting those members' full wait for food, the increase would be {list(RESERVE_LEVELS.map((f) => num(t.byLevel[String(f) as ReserveLevelKey].totalWithoutCutoffS, 0)))} seconds.</li>
      </ul>
    </Section>
  );
}

function Meaning({ m }: { m: FindingsModel }) {
  const baseRange = [...Object.values(m.cohorts.R), ...Object.values(m.cohorts.N)].map((c) => c!.baseline);
  return (
    <Section id="meaning" title="What it means">
      <ul class="fbullets">
        <li><b>Idle seats in the rush explain the damage.</b> A free-flow group takes seats only once it has food, and only as many as it needs. A reserving group holds a whole table from the moment it arrives: seats sit empty while its members queue, and seats beyond its size stay closed to most other diners, in the hour when seats are scarcest.</li>
        <li><b>Reserving is a social dilemma.</b> Each group is less likely to walk away if it reserves ({num(m.cohorts.R['0.25']!.level, 1)}% against {num(m.cohorts.N['0.25']!.level, 1)}% for non-reservers at 25%), but reservers as a whole and non-reservers both walk away more often than when nobody reserves (about {rng([Math.min(...baseRange), Math.max(...baseRange)], 1)}%). That would explain why the habit persists, and why a house rule may work where persuasion does not.</li>
        <li><b>A little reservation is not a mild compromise.</b> A quarter of groups reserving already makes almost as many claims in the rush as when everyone reserves ({num(m.rushClaims['0.25'], 0)} against {num(m.rushClaims['1'], 0)} per lunch between 12:00 and 13:00).</li>
        <li><b>The kitchen sets the pace.</b> {CFG.layout.stallCount} stalls at {num(CFG.stalls.serviceMean, 0)} seconds per person serve about {int(m.stallCapacityPerHour)} people an hour, and free flow already seats {int(m.head[0].thr)} in its best hour. No seating rule can make lunch much faster; it can only change how many groups end up sitting down.</li>
        <li><b>Free flow's own walk-aways are mostly failed searches.</b> When a free-flow group gave up, one table could have seated it in {pc(m.anatomy.oneTable0)} of cases, nearly always a completely empty table{m.anatomy.nearestFitM0 !== null ? `, typically ${num(m.anatomy.nearestFitM0, 0)} m away and beyond the searcher's ${num(m.visibilityM, 0)} m view` : ''}. Helping searchers find free tables, for example with a board showing empty tables, might cut walk-aways below free flow's {num(m.head[0].walkPct, 1)}%, which no level of reservation does. The model has not tested this.</li>
      </ul>
    </Section>
  );
}

function Generalises({ m }: { m: FindingsModel }) {
  const rows = m.robust;
  const gaps = rows.map((r) => r.walkAway.adv);
  const lo = rows[gaps.indexOf(Math.min(...gaps))], hi = rows[gaps.indexOf(Math.max(...gaps))];
  const rf = rows.find((r) => r.id === 'reservationFriendly');
  const crush = rows.find((r) => r.id === 'crush');
  const fast = rows.find((r) => r.id === 'service60');
  const rfCfg = presetConfig('reservationFriendly');
  const mix = rfCfg.crowd.groupMix, mixSum = mix.reduce((s, x) => s + x, 0);
  const sizes = ['solos', 'pairs', 'threes', 'fours', 'fives', 'sixes'];
  const allBetter = rows.every((r) => r.walkAway.lo > 0 && r.peakUtilPct.lo > 0);
  return (
    <Section id="general" title="How far it generalises">
      <p>The comparison of 100% against 0% reserving was also run under {rows.length - 1} other settings, {m.n} lunches each. {allBetter ? 'In every setting, free flow had fewer walk-aways and higher peak seat use, and every 95% range lies on free flow’s side of zero.' : 'Free flow did not win everywhere; see the table.'}</p>
      <div class="table-scroll">
        <table class="data">
          <thead>
            <tr><th scope="col">Setting</th><th scope="col">Walk-aways, free flow → all reserve</th><th scope="col">Extra walk-aways, pp</th><th scope="col">Lunches with fewer walk-aways under free flow</th><th scope="col">Peak seat use lost, pp</th><th scope="col">Entrance to seat (+ = slower)</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <th scope="row">{r.label}</th>
                <td class="num">{num(r.walkAway.b, 1)}% → {num(r.walkAway.a, 1)}%</td>
                <td class="num">{sgn(r.walkAway.adv)} [{num(r.walkAway.lo, 1)}, {num(r.walkAway.hi, 1)}]</td>
                <td class="num">{r.walkAway.W} of {m.n}{r.walkAway.T ? ` (${r.walkAway.T} tied)` : ''}</td>
                <td class="num">{num(r.peakUtilPct.adv, 1)}</td>
                <td class="num">{sgn(r.e2sMin.adv * 60, 0)} s</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul class="fbullets">
        <li><b>The size of the effect varies more than tenfold:</b> {sgn(lo.walkAway.adv)} pp with “{lo.label}”, {sgn(hi.walkAway.adv)} pp with “{hi.label}”.</li>
        {rf && <li><b>Relative to free flow's own walk-aways, reservation comes closest with the Reservation-friendly settings:</b> mostly big groups ({list(mix.map((x, i) => `${Math.round((100 * x) / mixSum)}% ${sizes[i]}`))}), stalls at {num(rfCfg.stalls.serviceMean, 0)} seconds per person and equally popular, slower tray walking and {num(rfCfg.search.visibility, 0)} m visibility. Walk-aways rise only from {num(rf.walkAway.b, 1)}% to {num(rf.walkAway.a, 1)}%, and reservation wins {rf.walkAway.L} of {m.n} lunches.</li>}
        {crush && crush.e2sMin.adv < 0 && crush.seatedE2sDeltaMin > 0 && <li><b>In a crush, entrance to seat averages {num(-crush.e2sMin.adv * 60, 0)} seconds less under reservation, but not because anyone sits sooner.</b> Diners seated in both runs wait about {num(crush.seatedE2sDeltaMin * 60, 0)} seconds longer. The average falls because {num(crush.walkAway.adv, 1)} pp more people give up, and a walk-away's clock stops when the group gives up.</li>}
        {fast && <li><b>Faster stalls make seats the bottleneck.</b> Food arrives sooner than tables free up, so even under free flow {num(fast.walkAway.b, 0)}% of diners give up on a seat.</li>}
      </ul>
    </Section>
  );
}

function Limits({ m }: { m: FindingsModel }) {
  return (
    <Section id="limits" title="Limitations">
      <ul class="fbullets">
        <li><b>This is a model, not a measurement.</b> Groups never split up, one member searches for a table, nobody waits beside diners who are about to leave, strangers never move a reservation object, and nobody reserves before arriving. Some rules favour reservation (never splitting; groupmates with food waiting at their stall), others favour free flow (shortest routes; searchers see every table within {num(CFG.search.visibility, 0)} m). <button type="button" class="linklike" onClick={() => (drawer.value = 'assumptions')}>See all assumptions</button></li>
        <li><b>The study set out to test a belief that free flow is better.</b> To guard against that bias, reservation's real benefit is modelled (a group with a claimed table always gets a seat and walks straight to it with food), the headline measures were fixed before any results were seen, and one set of settings is built to favour reservation. The rules still deserve checking against a real canteen.</li>
        <li><b>The 95% ranges cover chance only.</b> The data support about {m.comparisons} comparisons (the batch charts alone show {m.chartIntervals}); among so many, a few could look real by chance. This does not touch the main result: 100% against 0% on the four headline measures was chosen in advance{m.allFourAt100 ? `, and free flow won all four in all ${m.n} lunches` : ''}.</li>
        <li><b>Single lunches are noisy.</b> The lunch the app plays on screen is a busy one: its free-flow walk-aways ({num(m.lunch1.walkB, 1)}%) are number {m.lunch1.rank} of {m.n}. There, 50% reserving adds {num(m.lunch1.gap50, 1)} pp, against {num(m.lunch1.meanGap50, 1)} pp on average. In {m.lunches100BelowAt75} of the {m.n} lunches, 100% reserving had fewer walk-aways than 75%.</li>
        <li><b>A walk-away is a lost seat, not a lost sale.</b> Everyone still buys food, and walk-aways leave with it as takeaway; about {pc(m.servedAfterShare)} were still queueing when their group gave up.</li>
      </ul>
    </Section>
  );
}

function CsvGuide() {
  return (
    <details class="fdetails">
      <summary>Reading a CSV export</summary>
      <ul class="fbullets">
        <li>Three comment lines (title; model, build and export time; the settings as JSON), a header row, then <code>run</code> rows (one per lunch and level) and <code>pair</code> rows (one per lunch and level above 0%).</li>
        <li><code>run</code> rows hold three of the four headline measures, times, seat-time shares, reservation counts and results by group size (<code>bySize_s1</code>…<code>bySize_s6</code>). Peak seat use needs both runs of a comparison, so it is on <code>pair</code> rows (<code>pair_p3Level</code> = reservation, <code>pair_p3Baseline</code> = free flow).</li>
        <li><code>reserveFraction</code> is the share of groups reserving (0 = free flow). <code>seed</code> generates a lunch's crowd and <code>seedIndex</code> numbers the lunches; <code>runHash</code> fingerprints a run so a replay can be checked.</li>
        <li>Cohort columns read <code>pair_cohort&lt;name&gt;_&lt;side&gt;_&lt;measure&gt;</code>: <code>R</code> reservers, <code>N</code> the rest, <code>Rclaimed</code> and <code>Rfallback</code> reservers who did and did not get a table; <code>level</code> is measured in the reservation run, <code>baseline</code> on the same groups in the free-flow run.</li>
        <li>Blank cells are expected: pair columns on run rows and the reverse, <code>sweepSetting</code> and <code>sweepValue</code> in a reservation sweep, claim search time at 0%, and cohort <code>N</code> at 100%. The file holds raw values; the batch panel computes the gaps.</li>
      </ul>
    </details>
  );
}

export function FindingsPanel() {
  const m = getFindingsModel();
  const cfg = applied.value;
  const isDefault = JSON.stringify({ ...cfg, seed: 1 }) === JSON.stringify(CFG);
  const stale = FINDINGS.model !== MODEL_VERSION || EVIDENCE.model !== MODEL_VERSION;
  return (
    <div class="findings">
      <p class="flead">In this model, at the default settings, letting groups reserve tables makes the canteen worse on all four headline measures. When every group reserves, {num(m.head[4].walkPct, 1)}% of diners walk away instead of {num(m.head[0].walkPct, 1)}%, and free flow does better in all {m.n} lunches.</p>
      <p class="fscope muted">
        From the built-in evidence: the default settings, {m.n} lunches at each of 0, 25, 50, 75 and 100% of groups reserving, model {EVIDENCE.model}.{' '}
        {!isDefault && <>Your current settings differ from the defaults, so your lunches may behave differently. <button type="button" class="linklike" onClick={() => (drawer.value = 'batch')}>Test your settings in Batch runs</button></>}
      </p>
      {stale && <p class="warn-text">These findings were computed for another model version and may be out of date.</p>}
      <InShort m={m} />
      <HowItWorks m={m} />
      <Headline m={m} />
      <Why m={m} />
      <WhoPays m={m} />
      <Time m={m} />
      <Meaning m={m} />
      <Generalises m={m} />
      <Limits m={m} />
      <CsvGuide />
    </div>
  );
}
