import type { ComponentChildren } from 'preact';
import type { Findings, ReserveLevelKey } from '../batch/findings-data';
import { presetConfig } from '../config/presets';
import { defaultConfig, type Config } from '../config/schema';
import findingsJson from '../generated/findings.json';
import { MODEL_VERSION } from '../sim/version';
import { EVIDENCE, evidenceBatch } from './evidence';
import { ChartFigure, GroupedBars, Lines, ScrollTable, StackedBars, type Series } from './findcharts';
import { findingsModel, LEVELS, levelKey, RESERVE_LEVELS, type FindingsModel } from './findings-model';
import { aboutTwoThirds, bracket, fold, list, pc, range, sgn, straddlesZero } from './findings-text';
import { clock, int, num } from './format';
import { SEAT_LABELS } from './labels';
import { applied, openDrawer } from './store';

/** Findings panel (spec §11.13): what the default evidence shows. Every number comes from the data; the text only formats it. */

const FINDINGS = findingsJson as unknown as Findings;
const CFG = defaultConfig();
let cached: FindingsModel | null = null;
export function getFindingsModel(): FindingsModel {
  cached ??= findingsModel(evidenceBatch(), FINDINGS, CFG);
  return cached;
}

const rk = (f: number) => String(f) as ReserveLevelKey;
const lvl = (f: number) => `${Math.round(f * 100)}%`;
const at = (m: number) => clock(CFG.crowd.windowStart, m * 60_000);
const ordinal = (k: number) => `${k}${k % 100 >= 11 && k % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][k % 10] ?? 'th'}`;
/** Settings the findings apply to: the evidence ignores the seed and the live slider (the sweep sets its own levels). */
const normal = (c: Config) => JSON.stringify({ ...c, seed: CFG.seed, reserve: { ...c.reserve, percentA: CFG.reserve.percentA } });

const LEVEL_STYLE: Record<string, { color: string; dash?: string }> = {
  '0': { color: 'var(--lvl-0)' },
  '0.25': { color: 'var(--lvl-1)', dash: '7 4' },
  '0.5': { color: 'var(--lvl-2)', dash: '2 3' },
  '0.75': { color: 'var(--lvl-3)', dash: '10 3 2 3' },
  '1': { color: 'var(--lvl-4)' },
};
const levelName = (f: number) => (f === 0 ? 'Free flow' : `${lvl(f)} reserving`);
const pctTick = (v: number) => `${Math.round(v * 100)}%`;

function Section({ id, title, children }: { id: string; title: string; children: ComponentChildren }) {
  return (
    <section class="fsection" aria-labelledby={`f-${id}`}>
      <h3 id={`f-${id}`}>{title}</h3>
      {children}
    </section>
  );
}

/** Facts several sections rely on, each checked against the data before any sentence states it. */
function checks(m: FindingsModel) {
  const reserve = m.head.slice(1);
  const all = m.head[4];
  const shares25 = [m.shareAt25.left, m.shareAt25.util, m.shareAt25.thr];
  const l0 = m.leave['0'], l1 = m.leave['1'];
  return {
    worseEverywhere: reserve.every((r) => r.left!.mean > 0 && r.plateS!.mean > 0 && r.util!.mean < 0 && r.thrGap!.mean < 0),
    worseAt100: all.left!.mean > 0 && all.plateS!.mean > 0 && all.util!.mean < 0 && all.thrGap!.mean < 0,
    leftAllLunches100: all.left!.W === m.n,
    threeAllLunchesEveryLevel: reserve.every((r) => r.left!.W === m.n && r.util!.W === m.n && r.thrGap!.W === m.n),
    shares25,
    minShare25: Math.min(...shares25),
    claimedSafest: RESERVE_LEVELS.every((f) => {
      const c = m.cohorts.Rclaimed[rk(f)], n = m.cohorts.N[rk(f)];
      return c !== undefined && c.level <= c.baseline && (!n || c.level < n.level);
    }),
    claimedHelped: RESERVE_LEVELS.every((f) => m.cohorts.Rclaimed[rk(f)]!.level < m.cohorts.Rclaimed[rk(f)]!.baseline),
    reserversHurt: RESERVE_LEVELS.every((f) => m.cohorts.R[rk(f)]!.level > m.cohorts.R[rk(f)]!.baseline),
    othersHurt: RESERVE_LEVELS.every((f) => { const n = m.cohorts.N[rk(f)]; return !n || n.level > n.baseline; }),
    fallbackBelowBaseline: RESERVE_LEVELS.every((f) => m.cohorts.Rfallback[rk(f)]!.level < m.cohorts.Rfallback[rk(f)]!.baseline),
    /** The queues-only setting (no seating check at the door) shows no clear difference in leaving. */
    dependsOnDoorView: (() => { const q = m.robust.find((r) => r.id === 'queuesOnly'); return q !== undefined && straddlesZero(q.left.lo, q.left.hi); })(),
    fallbackWorst: RESERVE_LEVELS.every((f) => {
      const fb = m.cohorts.Rfallback[rk(f)]!.level, n = m.cohorts.N[rk(f)];
      return fb > m.cohorts.Rclaimed[rk(f)]!.level && (!n || fb >= n.level);
    }),
    robustAllBetter: m.robust.every((r) => r.left.lo > 0 && r.peakUtilPct.lo > 0),
    /** More people turn round at the door, and fewer give up in queues, under reservation. */
    doorUpQueueDown: l1.door > l0.door && l1.queue < l0.queue,
    seatedFaster: RESERVE_LEVELS.every((f) => m.seatedE2s.gapS[rk(f)].hi !== null && m.seatedE2s.gapS[rk(f)].hi! < 0),
  };
}

function InShort({ m }: { m: FindingsModel }) {
  const [b, , , , all] = m.head;
  const c = checks(m);
  const gaps = m.robust.map((r) => r.left.adv);
  const betterIn = m.robust.filter((r) => r.left.adv > 0).length;
  const l0 = m.leave['0'], l1 = m.leave['1'];
  return (
    <Section id="short" title="In short">
      <ul class="fbullets">
        <li><b>More people leave without eating.</b> When every group reserves, {num(all.leftPct, 1)}% of the people who come to lunch leave before getting food, instead of {num(b.leftPct, 1)}% ({int(b.leftPeople)} to {int(all.leftPeople)} people per lunch): {sgn(all.left!.mean)} percentage points{bracket(all.left!.lo, all.left!.hi, 1)}.</li>
        {all.util!.mean < 0 && all.thrGap!.mean < 0 && (
          <li><b>Seats and throughput fall; plates wait a little longer.</b> Peak seat use drops from {num(b.utilPct, 0)}% to {num(all.utilPct, 0)}%, and {int(-all.thrGap!.mean)} fewer people sit down in the best hour. The time from getting food to sitting down changes by {sgn(all.plateS!.mean, 0)} seconds.</li>
        )}
        <li>
          <b>{c.minShare25 >= 0.5 ? 'A quarter reserving does most of the damage:' : 'A quarter reserving already does part of the damage:'}</b>{' '}
          {aboutTwoThirds(c.shares25) ? 'about two-thirds of ' : ''}the leaving, seat-use and throughput losses ({range(Math.min(...c.shares25), Math.max(...c.shares25), 0, 100, '%')}).
        </li>
        <li><b>The cause is idle seats that look taken.</b> With every group reserving, {pc(m.reservedEmpty['1'])} of seats at the busiest hour are reserved with nobody in them ({pc(m.reservedEmpty['0.25'])} at 25%). From the door a table with an object looks taken, so {pc(l1.door, 1)} of arrivals turn round at once, against {pc(l0.door, 1)} under free flow.</li>
        {c.claimedHelped && c.reserversHurt && c.othersHurt && (
          <li><b>Who pays:</b> groups that get a table leave less often than the same groups under free flow (they got past the door and met shorter queues), but reserving groups as a whole, and everyone else, leave more often.</li>
        )}
        {c.dependsOnDoorView && (() => {
          const q = m.robust.find((r) => r.id === 'queuesOnly')!;
          return <li><b>It depends on how full the hall looks.</b> The extra leaving happens at the door ({sgn((m.leave['1'].door - m.leave['0'].door) * 100)} pp), partly offset by fewer people giving up in the shorter queues ({sgn((m.leave['1'].queue - m.leave['0'].queue) * 100)} pp). If arriving groups judged only the queues, reservation would make no clear difference to leaving ({sgn(q.left.adv)} pp{bracket(q.left.lo, q.left.hi, 1)}), though it would still cost {num(q.peakUtilPct.adv, 1)} pp of peak seat use.</li>;
        })()}
        {c.robustAllBetter ? (
          <li><b>It holds beyond the defaults.</b> Fewer people left without eating under free flow in all {m.robust.length} settings tried, by {range(Math.min(...gaps), Math.max(...gaps), 1)} percentage points.</li>
        ) : (
          <li><b>Beyond the defaults, results vary.</b> Fewer people left without eating under free flow in {betterIn} of the {m.robust.length} settings tried; the difference is not clear with {list(m.robust.filter((r) => r.left.lo <= 0).map((r) => `“${r.label}”`))}.</li>
        )}
      </ul>
    </Section>
  );
}

function HowItWorks({ m }: { m: FindingsModel }) {
  const utilBase = m.head.slice(1).map((r) => r.utilPct - r.util!.mean);
  return (
    <Section id="how" title="How the comparison works">
      <ul class="fbullets">
        <li><b>Free flow (canteen B).</b> Each member queues at a stall. The first to get food looks for a table with room for the whole group, seeing {num(CFG.search.visibility, 0)} m around. After {num(CFG.search.splitAfter / 60, 0)} minutes of circling the group takes a table with room for some of them, and the rest keep looking. Food comes on a plate, so nobody leaves holding food.</li>
        <li><b>Reservation (canteen A).</b> One member, the claimer, looks for a completely empty table and leaves an object on it while the others queue. A group that finds one has claimed it; after {num(CFG.reserve.claimSearchLimit, 0)} seconds without one, it falls back to free flow.</li>
        <li><b>Leaving before food (both canteens).</b> On arrival a group looks at the queues and the tables. It leaves at once if even the shortest queue looks longer than it will wait ({num(CFG.leave.waitMean / 60, 0)} minutes on average; groups vary), or if too few tables look free for it (about {CFG.leave.roomNeeded} for a group of average patience). A table with an object looks taken. Anyone still queuing past the group's limit gives up alone.</li>
        <li><b>Sharing.</b> Strangers may join a reserved table only after the group is seated, in parties of up to {CFG.reserve.shareMaxParty}, while at least {CFG.reserve.shareMinEmpty} of its {m.seatsPerTable} seats are empty.</li>
        <li><b>Five versions of each lunch.</b> Each of {m.n} lunches is replayed with 0% (free flow), 25%, 50%, 75% and 100% of groups reserving: the same diners arriving at the same times, with the same patience. Groups that reserve at 25% also reserve at every higher level.</li>
      </ul>
      <ScrollTable label="The four headline measures">
        <table class="data fdefs">
          <caption>The four headline measures, fixed before any result was seen</caption>
          <thead><tr><th scope="col">Measure</th><th scope="col">What it counts</th><th scope="col">Better</th></tr></thead>
          <tbody>
            <tr><th scope="row">Left without eating</th><td>Share of the people who came who left before getting food: at the door, or after queuing too long</td><td>Lower</td></tr>
            <tr><th scope="row">Time carrying a plate</th><td>Average minutes from getting food to sitting down, over everyone who got food</td><td>Lower</td></tr>
            <tr><th scope="row">Peak seat use</th><td>Average share of seats with someone sitting in them, during the busiest hour</td><td>Higher</td></tr>
            <tr><th scope="row">Peak throughput</th><td>Most people sitting down in any 60 minutes (each lunch's own best hour)</td><td>Higher</td></tr>
          </tbody>
        </table>
      </ScrollTable>
      <details class="fdetails">
        <summary>How to read the numbers</summary>
        <ul class="fbullets">
          <li>“pp” means percentage points, the difference between two percentages.</li>
          <li>Each gap is the average of the {m.n} lunch-by-lunch gaps, worked out before rounding, so it can differ by one in the last digit from the difference of the rounded averages. Free flow's peak seat use also shifts slightly ({range(Math.min(...utilBase), Math.max(...utilBase), 1, 1, '%')}) with the level it is compared with, because each comparison picks its own busiest hour.</li>
          <li>The 95% range in brackets shows how precisely {m.n} lunches pin down the average gap. Single lunches vary much more, and the range says nothing about whether the model's rules match a real canteen.</li>
          <li>Comparing each level with free flow on the same lunch cancels the variation the two versions share.</li>
          <li>The busiest hour is the 60 minutes (on average {at(m.peakWindow[0])} to {at(m.peakWindow[1])}) in which the two versions of a lunch together have the fewest free seats; a seat counts as taken if someone sits in it, it is saved for a groupmate, or it is reserved.</li>
        </ul>
      </details>
    </Section>
  );
}

function Headline({ m }: { m: FindingsModel }) {
  const all = m.head[4], q = m.head[1];
  const c = checks(m);
  const reserve = m.head.slice(1);
  const minW = Math.min(...reserve.flatMap((r) => [r.left!.W, r.util!.W, r.thrGap!.W]));
  const flat = straddlesZero(m.topStep.left.lo, m.topStep.left.hi) && straddlesZero(m.topStep.thr.lo, m.topStep.thr.hi);
  const s100 = m.seatedE2s.gapS['1'];
  return (
    <Section id="r1" title={c.worseEverywhere ? '1. Reservation loses on every headline measure' : '1. The headline measures at each level'}>
      <p>Each cell shows the level's average over {m.n} lunches, then its gap from free flow in percentage points (pp), seconds or people per hour, with the 95% range in brackets.</p>
      <ScrollTable label="Headline measures by share of groups reserving">
        <table class="data fhead">
          <thead>
            <tr><th scope="col">Groups reserving</th><th scope="col">Left without eating</th><th scope="col">Time carrying a plate</th><th scope="col">Peak seat use</th><th scope="col">Peak throughput</th></tr>
          </thead>
          <tbody>
            {m.head.map((r) => (
              <tr key={r.f}>
                <th scope="row">{r.f === 0 ? '0% (free flow)' : lvl(r.f)}</th>
                <td class="num">{num(r.leftPct, 1)}%{r.left ? `: ${sgn(r.left.mean)} pp${bracket(r.left.lo, r.left.hi, 1)}` : ` (${int(r.leftPeople)} people)`}</td>
                <td class="num">{num(r.plateMin * 60, 0)} s{r.plateS ? `: ${sgn(r.plateS.mean, 0)} s${bracket(r.plateS.lo, r.plateS.hi, 0)}` : ''}</td>
                <td class="num">{num(r.utilPct, 1)}%{r.util ? `: ${sgn(r.util.mean)} pp${bracket(r.util.lo, r.util.hi, 1)}` : ''}</td>
                <td class="num">{int(r.thr)}{r.thrGap ? `: ${sgn(r.thrGap.mean, 0)}${bracket(r.thrGap.lo, r.thrGap.hi, 0)}` : ' per hour'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollTable>
      <ul class="fbullets">
        <li><b>Consistent across lunches.</b> Fewer people left without eating, and peak seat use and throughput were higher, under free flow in {c.threeAllLunchesEveryLevel ? `all ${m.n} lunches at every level` : `at least ${minW} of the ${m.n} lunches at each level`}. Plates were carried longer under reservation in {list(reserve.map((r) => `${r.plateS!.W} at ${lvl(r.f)}`))} (of {m.n}).</li>
        <li><b>The size of it.</b> Leaving without eating goes from {num(m.head[0].leftPct, 1)}% to {num(all.leftPct, 1)}% ({int(m.head[0].leftPeople)} to {int(all.leftPeople)} people per lunch). The plate cost is small: {sgn(all.plateS!.mean, 0)} seconds on a {num(m.head[0].plateMin * 60, 0)}-second wait.</li>
        <li>
          <b>{c.minShare25 >= 0.5 ? 'Most of the damage is done once a quarter of groups reserve.' : 'A quarter of groups reserving already does part of the damage.'}</b> At 25%, leaving has already risen {num(q.left!.mean, 1)} of the {num(all.left!.mean, 1)} points it rises at 100% ({pc(m.shareAt25.left)}); the seat-use and throughput losses are {range(Math.min(m.shareAt25.util, m.shareAt25.thr), Math.max(m.shareAt25.util, m.shareAt25.thr), 0, 100, '%')} of their full size. The plate cost grows more steadily ({pc(m.shareAt25.plate)} of it at 25%).
        </li>
        <li><b>{flat ? 'Little changes near the top.' : 'From 75% to 100%.'}</b> Leaving changes by {sgn(m.topStep.left.mean!)} pp{bracket(m.topStep.left.lo, m.topStep.left.hi, 1, true)} and throughput by {sgn(m.topStep.thr.mean!, 0)} per hour{bracket(m.topStep.thr.lo, m.topStep.thr.hi, 0, true)}{flat ? ': too small to tell from no change' : ''}. Plate time changes by {sgn(m.topStep.plateS.mean!, 0)} seconds{bracket(m.topStep.plateS.lo, m.topStep.plateS.hi, 0, true)}.</li>
        {c.seatedFaster && c.doorUpQueueDown && (
          <li><b>People who do sit reach a seat sooner under reservation, because fewer come in.</b> Entrance to seat for people who sat (a secondary measure) is {num(-s100.mean, 0)} seconds shorter at 100%{bracket(-s100.hi!, -s100.lo!, 0)}. More people turn round at the door, so the queues are shorter: {num(m.queueWait.a100, 1)} minutes of queueing on average against {num(m.queueWait.b, 1)} under free flow.</li>
        )}
      </ul>
    </Section>
  );
}

function Why({ m }: { m: FindingsModel }) {
  const seat = (get: (f: number) => number) => LEVELS.map((f) => get(f));
  const s = (f: number) => m.seats[levelKey(f)];
  const seatSeries: Series[] = [
    { label: SEAT_LABELS[5], short: 'Seated', color: 'var(--seat-5)', values: seat((f) => s(f).occupied) },
    { label: SEAT_LABELS[4], short: 'Saved for a groupmate', color: 'var(--seat-4)', values: seat((f) => s(f).held) },
    { label: `${SEAT_LABELS[3]}: kept for members still getting food`, short: 'Reserved, members getting food', color: 'var(--seat-3)', values: seat((f) => s(f).waiting) },
    { label: `${SEAT_LABELS[3]}: beyond the group's size`, short: 'Reserved, beyond group size', color: 'var(--seat-3)', hatch: true, values: seat((f) => s(f).beyondSize) },
    { label: SEAT_LABELS[2], short: 'Spare, nobody may use', color: 'var(--seat-2)', values: seat((f) => s(f).blocked) },
    { label: SEAT_LABELS[1], short: 'Solos and pairs only', color: 'var(--seat-1)', values: seat((f) => s(f).open) },
    { label: SEAT_LABELS[0], short: 'Free', color: 'var(--seat-0)', outline: true, values: seat((f) => s(f).free) },
  ];
  const cats = LEVELS.map((f) => (f === 0 ? 'Free flow' : lvl(f)));
  const s100 = s(1);
  const emptyLevels = [0, 0.25, 0.5, 1];
  const emptySeries: Series[] = emptyLevels.map((f) => ({ label: levelName(f), ...LEVEL_STYLE[String(f)], values: m.empty.byLevel[levelKey(f)] }));
  const e1210 = RESERVE_LEVELS.map((f) => m.emptyAt1210[levelKey(f)]);
  const rush = RESERVE_LEVELS.map((f) => m.rushClaims[rk(f)]);
  const rushSimilar = Math.max(...rush) / Math.min(...rush) <= 1.2;
  const T = m.tables;
  const l0 = m.leave['0'], l1 = m.leave['1'];
  const c = checks(m);
  const bin = FINDINGS.claims.binMin;
  const doorSeries: Series[] = [0, 1].map((f) => ({ label: `${levelName(f)}: at the door`, ...LEVEL_STYLE[String(f)], values: m.leaveByArrival.door[levelKey(f)] }));
  const queueSeries: Series[] = [0, 1].map((f) => ({ label: `${levelName(f)}: from a queue`, color: LEVEL_STYLE[String(f)].color, dash: '2 3', values: m.leaveByArrival.queue[levelKey(f)] }));
  const leaveSeries = [...doorSeries, ...queueSeries];
  const leaveMax = Math.max(0.1, Math.ceil(Math.max(...leaveSeries.flatMap((x) => x.values.map((v) => v ?? 0))) * 10) / 10);
  const span = m.leaveByArrival.binMid.length * bin;
  return (
    <Section id="r2" title="2. Why: idle seats in the rush, and a hall that looks full">
      <p>Reservation leaves seats idle at the very hour they are needed. With every group reserving, {pc(m.reservedEmpty['1'])} of seats at the busiest hour are reserved with nobody sitting in them ({pc(m.reservedEmpty['0.25'])} when a quarter of groups reserve), and free seats fall from {pc(s(0).free)} to {pc(s100.free)}.</p>
      <ChartFigure
        title="Seats at the busiest hour"
        label={`Stacked bars of seat states at the busiest hour for free flow and each reservation level. Free seats fall from ${pc(s(0).free)} to ${pc(s100.free)} as reserved-but-empty seats rise to ${pc(m.reservedEmpty['1'])}.`}
        legend={seatSeries.slice().reverse()}
        note={`Share of the time seats spent in each state during the busiest hour (on average ${at(m.peakWindow[0])} to ${at(m.peakWindow[1])}); average of ${m.n} lunches. The free-flow bar comes from the lunches compared with 100% reserving.`}
        table={
          <table class="data">
            <thead><tr><th scope="col">Seat state</th>{cats.map((x) => <th scope="col" key={x}>{x}</th>)}</tr></thead>
            <tbody>{seatSeries.slice().reverse().map((x) => <tr key={x.label}><th scope="row">{x.label}</th>{x.values.map((v, i) => <td class="num" key={i}>{pc(v ?? 0, 1)}</td>)}</tr>)}</tbody>
          </table>
        }
      >
        <StackedBars categories={cats} series={seatSeries} ticks={[0, 0.25, 0.5, 0.75, 1]} fmt={pctTick} labelLast />
      </ChartFigure>
      <p>At 100% reserving, the reserved-but-empty seats are, as shares of all seats:</p>
      <ul class="fbullets">
        <li><b>Beyond the group's size, {pc(s100.beyondSize, 1)}.</b> A reserving group takes a whole {m.seatsPerTable}-seat table whatever its size, so a pair's claim keeps {m.seatsPerTable - 2} seats empty until the pair has sat down.</li>
        <li><b>Kept for members still getting food, {pc(s100.waiting, 1)}.</b> The table is claimed typically about {num(m.claimMedianS100, 0)} seconds after arrival, before anyone has food, so its seats wait out the whole queue.</li>
        <li><b>Spare seats nobody may use, {pc(s100.blocked, 1)}.</b> A group of 3 to 5 leaves too few empty seats to share ({pc(m.blockedNoJoiners100, 1)}), and a solo's or pair's table stops taking strangers once joiners leave fewer than {CFG.reserve.shareMinEmpty} seats empty ({pc(m.blockedAfterJoiners100, 1)}).</li>
        <li><b>Open to solos and pairs only, {pc(s100.open, 1)}.</b> They can be used, but never by groups of 3 or more.</li>
      </ul>
      <p>Free flow saves seats too: {pc(m.baselineHeld, 1)} of seats at the busiest hour, most of them ({pc(m.baselineHeldNoFood / m.baselineHeld)}) for groupmates still getting food. But a free-flow group saves seats only once its searcher has food and a table, and only as many as it needs. Over the whole lunch, at the moments when someone holding food was stuck looking for a table, {pc(m.blockedWhileNeeded.b, 1)} of seats were saved for others under free flow, against {pc(m.blockedWhileNeeded.a100, 1)} saved or reserved with every group reserving.</p>
      <p><b>From the door the hall looks full.</b> {pc(l1.door, 1)} of the people arriving at a canteen where every group reserves turn round at once, against {pc(l0.door, 1)} under free flow; for {m.doorSeatingShare['1'] >= 0.995 ? 'nearly all of them' : `${pc(m.doorSeatingShare['1'])} of them`} the reason includes the seating: too few tables look free, because a table with an object looks taken even when its group is seated.{c.doorUpQueueDown ? ` With fewer people inside, the queues are shorter, so fewer give up in a queue (${pc(l1.queue, 1)} against ${pc(l0.queue, 1)}): in all, ${pc(l1.all, 1)} leave without eating against ${pc(l0.all, 1)}.` : ''}</p>
      <ChartFigure
        title="Leaving without eating, by arrival time"
        label={`Line chart of the share of people who left at the door and from a queue, by arrival time, under free flow and with every group reserving. At the door: ${pc(l0.door, 1)} under free flow, ${pc(l1.door, 1)} with every group reserving.`}
        legend={leaveSeries}
        lineLegend
        note={`Share of the people arriving in each ${bin} minutes (plotted mid-interval) who turned round at the door, or who gave up in a queue; ${m.n} lunches.`}
        table={
          <table class="data">
            <thead><tr><th scope="col">Arrived</th>{leaveSeries.map((x) => <th scope="col" key={x.label}>{x.label}</th>)}</tr></thead>
            <tbody>{m.leaveByArrival.binMid.map((mm, i) => <tr key={mm}><th scope="row" class="num">{at(mm - bin / 2)}–{at(mm + bin / 2)}</th>{leaveSeries.map((x) => <td class="num" key={x.label}>{x.values[i] === null ? '—' : pc(x.values[i]!, 1)}</td>)}</tr>)}</tbody>
          </table>
        }
      >
        <Lines x={m.leaveByArrival.binMid} xRange={[0, span]} series={leaveSeries} yMax={leaveMax} ticks={[0, leaveMax / 2, leaveMax]} fmt={pctTick} xTicks={[0, 30, 60, 90, 120, 150].filter((t) => t <= span)} xFmt={at} yTitle="Left without eating" />
      </ChartFigure>
      <ChartFigure
        title="Completely empty tables through lunch"
        label={`Line chart of completely empty tables from ${at(0)} to ${at(180)}. Under free flow ${num(m.emptyAt1210['0'], 0)} tables are empty at 12:10; with reservation only ${range(Math.min(...e1210), Math.max(...e1210))} are.`}
        legend={emptySeries}
        lineLegend
        note={`Tables with nobody seated, no seat saved and no reservation object: the only tables a claimer may take. Average of ${m.n} lunches; the rush peaks at ${at(m.rushPeakMin)}.`}
        table={
          <table class="data">
            <thead><tr><th scope="col">Time</th>{emptySeries.map((x) => <th scope="col" key={x.label}>{x.label}</th>)}</tr></thead>
            <tbody>{m.empty.minutes.map((t, i) => (i % 2 === 0 ? <tr key={t}><th scope="row" class="num">{at(t)}</th>{emptySeries.map((x) => <td class="num" key={x.label}>{num(x.values[i], 1)}</td>)}</tr> : null))}</tbody>
          </table>
        }
      >
        <Lines x={m.empty.minutes} series={emptySeries} yMax={T} ticks={[0, T / 4, T / 2, (3 * T) / 4, T]} fmt={(v) => String(Math.round(v))} xTicks={[0, 30, 60, 90, 120, 150, 180]} xFmt={at} rule={{ x: m.rushPeakMin, label: at(m.rushPeakMin) }} yTitle={`Empty tables (of ${T})`} />
      </ChartFigure>
      <p>Under free flow, {num(m.emptyAt1210['0'], 0)} of {T} tables are still completely empty at 12:10; with reservation only {range(Math.min(...e1210), Math.max(...e1210))} are.{m.scarce100 && ` When every group reserves, fewer than 1.5 remain on average from ${at(m.scarce100[0])} to ${at(m.scarce100[1])}.`} So {pc(m.fallbackNoTarget100)} of the reservers who find no table had not seen an empty table to head for when their {num(CFG.reserve.claimSearchLimit, 0)} seconds ran out.</p>
      <p><b>Why a quarter does most of the damage.</b> Reservers arriving between 12:00 and 13:00 claim {rushSimilar ? 'nearly the same number of tables at every level, ' : ''}{range(Math.min(...rush), Math.max(...rush))} per lunch: once empty tables run out, more reservers {rushSimilar ? `only add groups that find no table (${int(m.rushFallbacks['0.25'])} per lunch at 25%, ${int(m.rushFallbacks['1'])} at 100%)` : `mostly add groups that find no table (+${int(m.rushClaims['1'] - m.rushClaims['0.25'])} claims per lunch against +${int(m.rushFallbacks['1'] - m.rushFallbacks['0.25'])} groups with no table, from 25% to 100%)`}. Extra claims come before 12:00 and after 13:00, when seats are plentiful, so claims per lunch grow ever more slowly: {list(RESERVE_LEVELS.map((f) => `${int(m.claimsPerLunch[rk(f)])} at ${lvl(f)}`))}.</p>
    </Section>
  );
}

function WhoPays({ m }: { m: FindingsModel }) {
  const c = checks(m);
  const rows = [
    ['Reservers who got a table', m.cohorts.Rclaimed],
    ['Reservers who found no table', m.cohorts.Rfallback],
    ['Non-reservers', m.cohorts.N],
    ['All reserving groups', m.cohorts.R],
  ] as const;
  const bin = FINDINGS.claims.binMin;
  const span = m.claimBinMid.length * bin;
  const arrivalLevels = [0.25, 0.5, 1];
  const claimSeries: Series[] = arrivalLevels.map((f) => ({ label: levelName(f), ...LEVEL_STYLE[String(f)], values: m.claimByArrival[rk(f)].map((v) => (Number.isFinite(v) ? v : null)) }));
  const sizeSeries: Series[] = LEVELS.map((f) => ({ label: levelName(f), color: LEVEL_STYLE[String(f)].color, values: m.bySize.map((x) => x.pct[levelKey(f)] / 100) }));
  const sizeMax = (Math.ceil(Math.max(...m.bySize.map((x) => Math.max(...Object.values(x.pct)))) / 10) * 10) / 100;
  const sizesRise = m.bySize.every((x) => x.pct['1'] > x.pct['0']);
  const mid = range(m.claimShare1210to1250at50[0], m.claimShare1210to1250at50[1], 0, 100, '%');
  const size = (x: number) => num(x, 1);
  const n25 = m.cohorts.N['0.25']!.level, r25 = m.cohorts.R['0.25']!.level;
  const [fa0, fa1] = m.fallbackMedianArrival.map((x) => Math.round(x));
  const claimed = RESERVE_LEVELS.map((f) => m.cohorts.Rclaimed[rk(f)]!);
  const later = m.claimedDelayS[0] > 0, sooner = m.claimedDelayS[1] < 0;
  const big = m.bySize.filter((x) => x.size >= 5), small = m.bySize.filter((x) => x.size <= 2);
  const bigRise = big.every((x) => x.pct['1'] > x.pct['0']), smallFall = small.every((x) => x.pct['1'] < x.pct['0']);
  const pctList = (xs: typeof big, f: string) => list(xs.map((x) => `${num(x.pct[f as '0'], 1)}%`));
  return (
    <Section id="r3" title="3. Who pays">
      <p>
        {c.claimedSafest ? 'A group that secures a table is the least likely to leave.' : 'Getting a table helps a group less than one might expect.'}{' '}
        {c.othersHurt ? 'Non-reservers leave more often than under free flow' : 'Non-reservers do not always leave more often than under free flow'}{c.reserversHurt ? ', and so do reserving groups as a whole.' : '.'}{' '}
        Each cell shows the share leaving without eating under reservation, then the same groups in the free-flow version of the same lunch.
      </p>
      <ScrollTable label="Left without eating by group of diners">
        <table class="data">
          <thead><tr><th scope="col">Group</th>{RESERVE_LEVELS.map((f) => <th scope="col" key={f}>{lvl(f)} reserving</th>)}</tr></thead>
          <tbody>
            {rows.map(([label, cells]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                {RESERVE_LEVELS.map((f) => {
                  const x = cells[rk(f)];
                  return <td class="num" key={f}>{x ? `${num(x.level, 1)}% vs ${num(x.baseline, 1)}%` : '(none)'}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollTable>
      {c.fallbackBelowBaseline && <p>Reservers who found no table leave less often than the same groups under free flow, but they are a selected set: they all got past the door. Reserving groups that turned round at the door never tried to claim, and they count only in “All reserving groups”.</p>}
      <p>The share of reserving groups that got a table is {list(RESERVE_LEVELS.map((f) => `${pc(m.claimShare[rk(f)])} at ${lvl(f)}`))}. Per lunch, {int(m.doorLeftReservers['0.25'])} reserving groups turn round at the door before trying at 25%, and {list(RESERVE_LEVELS.slice(1).map((f) => `${int(m.doorLeftReservers[rk(f)])} at ${lvl(f)}`))}.</p>
      <ul class="fbullets">
        <li><b>Reservers who got a table leave less often.</b> They left without eating {range(Math.min(...claimed.map((x) => x.level)), Math.max(...claimed.map((x) => x.level)), 1, 1, '%')} of the time; the same groups left {range(Math.min(...claimed.map((x) => x.baseline)), Math.max(...claimed.map((x) => x.baseline)), 1, 1, '%')} of the time under free flow. They all got past the door and then met shorter queues; the table itself keeps no one in a queue. {later ? `They are not faster, though: they reach their seats ${range(m.claimedDelayS[0], m.claimedDelayS[1])} seconds later, because the claimer searches before queueing.` : sooner ? `They also reach their seats ${range(-m.claimedDelayS[1], -m.claimedDelayS[0])} seconds sooner.` : ''}</li>
        <li><b>Getting a table depends on when you arrive.</b> Groups that got a table and groups that did not {size(m.meanSize.claimed) === size(m.meanSize.fallback) ? `both average ${size(m.meanSize.claimed)} people` : `average ${size(m.meanSize.claimed)} and ${size(m.meanSize.fallback)} people`}. At 50% reserving, {m.claimAllBeforeMin50 !== null ? `every reserver arriving before ${at(m.claimAllBeforeMin50)} got a table, but only ${mid} of those arriving between 12:10 and 12:50 did` : `only ${mid} of reservers arriving between 12:10 and 12:50 got a table`}.</li>
        <li><b>Reservers who find no table arrive at the worst time.</b> Their typical arrival time is {fa0 === fa1 ? at(fa0) : `${at(fa0)}–${at(fa1)}`}, when no empty table is left, and they then queue in the rush after a minute spent searching.{m.fallbackSameTimeMaxGap <= 1 ? ` Non-reservers who arrive at the same times leave almost as often (within ${num(m.fallbackSameTimeMaxGap, 1)} percentage points), so their extra leaving comes from when they arrive.` : ''}</li>
        <li><b>{n25 > r25 ? 'Non-reservers leave more often than reserving groups as a whole' : 'Reserving groups as a whole leave at least as often as non-reservers'}</b> ({n25 > r25 ? `${num(n25, 1)}% against ${num(r25, 1)}%` : `${num(r25, 1)}% against ${num(n25, 1)}%`} at 25%){c.reserversHurt && c.othersHurt ? ', yet both leave more often than when nobody reserves' : ''}.</li>
      </ul>
      <ChartFigure
        title="Reservers who got a table, by arrival time"
        label={`Line chart of the share of reserving groups that got a table by arrival time. At 50% reserving, ${m.claimAllBeforeMin50 !== null ? `every reserver arriving before ${at(m.claimAllBeforeMin50)} got one, while ` : ''}only ${mid} of those arriving between 12:10 and 12:50 did.`}
        legend={claimSeries}
        lineLegend
        note={`Share of reserving groups that claimed a table, by the ${bin} minutes in which they arrived (plotted mid-interval); ${m.n} lunches. Groups that turned round at the door count as not getting one.`}
        table={
          <table class="data">
            <thead><tr><th scope="col">Arrived</th>{claimSeries.map((x) => <th scope="col" key={x.label}>{x.label}</th>)}</tr></thead>
            <tbody>{m.claimBinMid.map((mm, i) => <tr key={mm}><th scope="row" class="num">{at(mm - bin / 2)}–{at(mm + bin / 2)}</th>{claimSeries.map((x) => <td class="num" key={x.label}>{x.values[i] === null ? '—' : pc(x.values[i]!)}</td>)}</tr>)}</tbody>
          </table>
        }
      >
        <Lines x={m.claimBinMid} xRange={[0, span]} series={claimSeries} yMax={1} ticks={[0, 0.25, 0.5, 0.75, 1]} fmt={pctTick} xTicks={[0, 30, 60, 90, 120, 150].filter((t) => t <= span)} xFmt={at} yTitle="Got a table" />
      </ChartFigure>
      <p>{bigRise ? `Reservation turns big groups away: with every group reserving, groups of 5 and 6 leave without eating ${pctList(big, '1')} of the time, against ${pctList(big, '0')} under free flow. A group that size needs a table with at least that many seats nobody sits on, and from the door few look like that.` : 'Groups of every size leave without eating.'}{smallFall ? ` Solos and pairs leave less often (${pctList(small, '1')} against ${pctList(small, '0')}), because the queues are shorter for whoever comes in.` : ''}{sizesRise ? ' Reservation raises the share leaving for every group size.' : ''}</p>
      <ChartFigure
        title="Left without eating, by group size (people per group)"
        label={`Grouped bar chart of the share of people leaving without eating for groups of 1 to 6 people, for free flow and each reservation level${sizesRise ? '; reservation raises every size' : ''}.`}
        legend={sizeSeries}
        note={`Share of people in groups of each size who left without eating; average of ${m.n} lunches.`}
        table={
          <table class="data">
            <thead><tr><th scope="col">Group size</th>{sizeSeries.map((x) => <th scope="col" key={x.label}>{x.label}</th>)}</tr></thead>
            <tbody>{m.bySize.map((x, i) => <tr key={x.size}><th scope="row">{x.size}</th>{sizeSeries.map((ss) => <td class="num" key={ss.label}>{pc(ss.values[i]!, 1)}</td>)}</tr>)}</tbody>
          </table>
        }
      >
        <GroupedBars categories={m.bySize.map((x) => String(x.size))} series={sizeSeries} yMax={sizeMax} ticks={[0, sizeMax / 2, sizeMax]} fmt={pctTick} />
      </ChartFigure>
    </Section>
  );
}

function Time({ m }: { m: FindingsModel }) {
  const t = m.time;
  const by = (f: number) => t.byLevel[rk(f)];
  const rows = [
    ['Entrance to joining a queue', t.baseline.toQueueS, 'toQueueS'],
    ['Queueing and being served', t.baseline.queueAndServiceS, 'queueAndServiceS'],
    ['Carrying a plate to a seat', t.baseline.afterServiceS, 'afterServiceS'],
  ] as const;
  const shares = RESERVE_LEVELS.map((f) => by(f).fallbackClaimerShare);
  const persons = RESERVE_LEVELS.map((f) => by(f).fallbackClaimerPersonS);
  const people = RESERVE_LEVELS.map((f) => by(f).fallbackClaimerPeopleShare);
  const queue = RESERVE_LEVELS.map((f) => -by(f).queueAndServiceS);
  const plate = RESERVE_LEVELS.map((f) => by(f).afterServiceS);
  const totals = RESERVE_LEVELS.map((f) => by(f).totalS);
  const plateLevels = [0, 0.5, 1];
  const plateSeries: Series[] = plateLevels.map((f) => ({ label: levelName(f), ...LEVEL_STYLE[String(f)], values: m.plates.byLevel[levelKey(f)] }));
  const plateMax = Math.max(10, Math.ceil(Math.max(...plateSeries.flatMap((x) => x.values.map((v) => v ?? 0))) / 10) * 10);
  const allPositive = totals.every((x) => x > 0), allNegative = totals.every((x) => x < 0);
  return (
    <Section id="r4" title="4. Where the time goes">
      <p>For people who ate in both versions of a lunch, reservation {allNegative ? `shortens the trip from entrance to seat by ${range(-Math.max(...totals), -Math.min(...totals))} seconds, because the queues are shorter` : allPositive ? `lengthens the trip from entrance to seat by ${range(Math.min(...totals), Math.max(...totals))} seconds` : `changes the trip from entrance to seat by ${sgn(Math.min(...totals), 0)} to ${sgn(Math.max(...totals), 0)} seconds`}. Changes per person against the same person under free flow, in seconds:</p>
      <ScrollTable label="Change in each part of the trip">
        <table class="data">
          <thead><tr><th scope="col">Part of the trip (free-flow time)</th>{RESERVE_LEVELS.map((f) => <th scope="col" key={f}>{lvl(f)}</th>)}</tr></thead>
          <tbody>
            {rows.map(([label, base, k]) => (
              <tr key={k}><th scope="row">{label} ({num(base, 0)} s)</th>{RESERVE_LEVELS.map((f) => <td class="num" key={f}>{sgn(by(f)[k])}</td>)}</tr>
            ))}
            <tr class="total"><th scope="row">Whole trip ({num(t.baseline.toQueueS + t.baseline.queueAndServiceS + t.baseline.afterServiceS, 0)} s)</th>{RESERVE_LEVELS.map((f) => <td class="num" key={f}>{sgn(by(f).totalS)}</td>)}</tr>
          </tbody>
        </table>
      </ScrollTable>
      <ul class="fbullets">
        <li><b>The queue sets the pace.</b> Under free flow, {num(t.baseline.queueWaitS / 60, 1)} of the {num(m.seatedE2s.b, 1)} minutes from entrance to seat are spent queueing and another {num(CFG.stalls.serviceMean / 60, 1)} being served. At the peak the stalls are busy {num(t.stallBusyPeakPct, 0)}% of the time, so no seating rule can speed up service.</li>
        {queue.every((x) => x >= 0) && <li><b>Time in the queue falls by {range(Math.min(...queue), Math.max(...queue))} seconds.</b> More people turn round at the door, so those who stay find shorter queues. Late claimers also let the people behind them move up, then join at the back.</li>}
        {persons.every((x) => x > 0) && <li><b>Reservers who find no table lose their search time.</b> Their claimer searches up to {num(CFG.reserve.claimSearchLimit, 0)} seconds before queueing and ends up {range(Math.min(...persons), Math.max(...persons))} seconds later than under free flow. They are {range(Math.min(...people), Math.max(...people), 0, 100, '%')} of the people compared here.{Math.min(...shares) > 0 && Math.max(...shares) <= 1 ? ` They account for ${range(Math.min(...shares), Math.max(...shares), 0, 100, '%')} of the change.` : ''}</li>}
        {persons.every((x) => x <= 0) && <li><b>Even reservers who find no table lose nothing overall.</b> Their claimer searches up to {num(CFG.reserve.claimSearchLimit, 0)} seconds before queueing, but the shorter queues make up for it: they reach a seat {range(-Math.max(...persons), -Math.min(...persons))} seconds sooner than under free flow.</li>}
        {plate.every((x) => x > 0) && <li><b>Carrying a plate takes {range(Math.min(...plate), Math.max(...plate))} seconds longer.</b> With fewer free tables, searchers walk further before they find room; at 100%, {pc(m.groupsSplitPct['1'] / 100, 1)} of groups with food end up split across tables, against {pc(m.groupsSplitPct['0'] / 100, 1)} under free flow.</li>}
      </ul>
      <ChartFigure
        title="People holding a plate with no seat"
        label={`Line chart of how many people hold food with no seat found or kept for them, from ${at(0)} to ${at(180)}, for free flow, 50% and 100% reserving. The lunch peak averages ${num(m.plates.peak['0'], 0)} people under free flow and ${num(m.plates.peak['1'], 0)} with every group reserving.`}
        legend={plateSeries}
        lineLegend
        note={`People carrying food who have not yet found a seat (searching, or waiting for a groupmate to find one), at each minute; average of ${m.n} lunches. The busiest moment of each lunch averages ${num(m.plates.peak['0'], 0)} under free flow and ${num(m.plates.peak['1'], 0)} with every group reserving.`}
        table={
          <table class="data">
            <thead><tr><th scope="col">Time</th>{plateSeries.map((x) => <th scope="col" key={x.label}>{x.label}</th>)}</tr></thead>
            <tbody>{m.plates.minutes.map((tt, i) => (i % 2 === 0 ? <tr key={tt}><th scope="row" class="num">{at(tt)}</th>{plateSeries.map((x) => <td class="num" key={x.label}>{num(x.values[i] ?? 0, 1)}</td>)}</tr> : null))}</tbody>
          </table>
        }
      >
        <Lines x={m.plates.minutes} series={plateSeries} yMax={plateMax} ticks={[0, plateMax / 2, plateMax]} fmt={(v) => String(Math.round(v))} xTicks={[0, 30, 60, 90, 120, 150, 180]} xFmt={at} rule={{ x: m.rushPeakMin, label: at(m.rushPeakMin) }} yTitle="People holding a plate" />
      </ChartFigure>
    </Section>
  );
}

function Meaning({ m }: { m: FindingsModel }) {
  const baseRange = [...Object.values(m.cohorts.R), ...Object.values(m.cohorts.N)].map((x) => x!.baseline);
  const n25 = m.cohorts.N['0.25']!, r25 = m.cohorts.R['0.25']!;
  const dilemma = r25.level < n25.level && r25.level > r25.baseline && n25.level > n25.baseline;
  const rushRatio = m.rushClaims['0.25'] / m.rushClaims['1'];
  const l0 = m.leave['0'];
  const fast = m.robust.find((r) => r.id === 'service60');
  return (
    <Section id="meaning" title="What it means">
      <ul class="fbullets">
        <li><b>Idle seats in the rush explain the damage.</b> A free-flow group takes seats only once it has food, and only as many as it needs. A reserving group holds a whole table from the moment it arrives: seats sit empty while its members queue, seats beyond its size stay closed to most other diners, and from the door the hall looks full, in the hour when seats are scarcest.</li>
        {dilemma && <li><b>Reserving is a social dilemma.</b> Each group is less likely to leave if it reserves ({num(r25.level, 1)}% against {num(n25.level, 1)}% for non-reservers at 25%), but reserving groups as a whole and non-reservers both leave more often than when nobody reserves (about {range(Math.min(...baseRange), Math.max(...baseRange), 1, 1, '%')}). That would explain why the habit persists, and why a house rule may work where persuasion does not.</li>}
        {rushRatio >= 0.85 && <li><b>A little reservation is not a mild compromise.</b> A quarter of groups reserving already makes almost as many claims in the rush as when everyone reserves ({num(m.rushClaims['0.25'], 0)} against {num(m.rushClaims['1'], 0)} per lunch between 12:00 and 13:00).</li>}
        <li><b>The kitchen sets the pace.</b> {CFG.layout.stallCount} stalls at {num(CFG.stalls.serviceMean, 0)} seconds per person serve about {int(m.stallCapacityPerHour)} people an hour, and free flow already seats {int(m.head[0].thr)} in its best hour. No seating rule can make lunch much faster; it can only change how many people end up eating.</li>
        {l0.queue > l0.door && <li><b>Under free flow, the queues turn people away, not the seats.</b> Most people who leave give up in a queue ({pc(l0.queue, 1)} of arrivals, against {pc(l0.door, 1)} at the door).{fast && fast.left.b < m.head[0].leftPct ? ` Faster stalls (${num(CFG.stalls.serviceMean, 0)} → 60 seconds per person) cut free flow's leaving from ${num(m.head[0].leftPct, 1)}% to ${num(fast.left.b, 1)}%.` : ''}</li>}
      </ul>
    </Section>
  );
}

function Generalises({ m }: { m: FindingsModel }) {
  const rows = m.robust;
  const gaps = rows.map((r) => r.left.adv);
  const lo = rows[gaps.indexOf(Math.min(...gaps))], hi = rows[gaps.indexOf(Math.max(...gaps))];
  const rf = rows.find((r) => r.id === 'reservationFriendly');
  const base = rows.find((r) => r.id === 'default');
  const queuesOnly = rows.find((r) => r.id === 'queuesOnly');
  const rise = (r: (typeof rows)[number]) => r.left.a / Math.max(r.left.b, 1e-9);
  const rfClosest = rf !== undefined && rows.every((r) => rise(rf) <= rise(r));
  const rfCfg = presetConfig('reservationFriendly');
  const mix = rfCfg.crowd.groupMix, mixSum = mix.reduce((acc, x) => acc + x, 0);
  const sizes = ['solos', 'pairs', 'threes', 'fours', 'fives', 'sixes'];
  const allBetter = checks(m).robustAllBetter;
  return (
    <Section id="general" title="How far it generalises">
      <p>The comparison of 100% against 0% reserving was also run under {rows.length - 1} other settings, {m.n} lunches each. {allBetter ? 'In every setting, fewer people left without eating under free flow and peak seat use was higher, and every 95% range lies on free flow’s side of zero.' : 'Free flow did not win everywhere; see the table.'}</p>
      <ScrollTable label="100% against 0% reserving under other settings">
        <table class="data">
          <thead>
            <tr><th scope="col">Setting</th><th scope="col">Left without eating, free flow → all reserve</th><th scope="col">Extra leaving, pp</th><th scope="col">Lunches with fewer leavers under free flow</th><th scope="col">Peak seat use lost, pp</th><th scope="col">Time carrying a plate (+ = longer)</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <th scope="row">{r.label}</th>
                <td class="num">{num(r.left.b, 1)}% → {num(r.left.a, 1)}%</td>
                <td class="num">{sgn(r.left.adv)}{bracket(r.left.lo, r.left.hi, 1)}</td>
                <td class="num">{r.left.W} of {m.n}{r.left.T ? ` (${r.left.T} tied)` : ''}</td>
                <td class="num">{num(r.peakUtilPct.adv, 1)}</td>
                <td class="num">{sgn(r.plate.adv * 60, 0)} s</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollTable>
      <ul class="fbullets">
        {lo.left.adv > 0 && <li><b>The size of the effect varies {fold(hi.left.adv / lo.left.adv)}:</b> {sgn(lo.left.adv)} pp with “{lo.label}”, {sgn(hi.left.adv)} pp with “{hi.label}”.</li>}
        {queuesOnly && base && <li><b>How much comes from the view at the door.</b> If arriving groups judged only the queues, not the seating, the gap in leaving would be {sgn(queuesOnly.left.adv)} pp{bracket(queuesOnly.left.lo, queuesOnly.left.hi, 1)} instead of {sgn(base.left.adv)} pp{straddlesZero(queuesOnly.left.lo, queuesOnly.left.hi) ? ': no clear difference' : ''}{queuesOnly.peakUtilPct.lo > 0 ? `; reservation would still cost ${num(queuesOnly.peakUtilPct.adv, 1)} pp of peak seat use` : ''}. How arriving groups judge a canteen with reserved tables is the assumption this result rests on most.</li>}
        {rf && <li><b>{rfClosest ? 'Relative to free flow’s own leaving, reservation comes closest with the Reservation-friendly settings:' : 'The Reservation-friendly settings:'}</b> mostly big groups ({list(mix.map((x, i) => `${Math.round((100 * x) / mixSum)}% ${sizes[i]}`))}), stalls at {num(rfCfg.stalls.serviceMean, 0)} seconds per person and equally popular, slower tray walking and {num(rfCfg.search.visibility, 0)} m visibility. Leaving rises from {num(rf.left.b, 1)}% to {num(rf.left.a, 1)}%, and reservation wins {rf.left.L} of {m.n} lunches.</li>}
      </ul>
    </Section>
  );
}

function Limits({ m, onScreenIsLunch1 }: { m: FindingsModel; onScreenIsLunch1: boolean }) {
  return (
    <Section id="limits" title="Limitations">
      <ul class="fbullets">
        <li><b>This is a model, not a measurement.</b> Each group's patience is drawn, not measured; a group judges the queues and the whole hall at a glance; one member searches for a table; nobody waits beside diners who are about to leave; strangers never move a reservation object; and nobody reserves before arriving. Some rules favour reservation (groups circle {num(CFG.search.splitAfter / 60, 0)} minutes before splitting; groupmates with food wait at their stall), others favour free flow (shortest routes; searchers see every table within {num(CFG.search.visibility, 0)} m; a table with an object looks fully taken from the door). <button type="button" class="linklike" onClick={() => openDrawer('assumptions')}>See all assumptions</button></li>
        <li><b>The study set out to test a belief that free flow is better.</b> To guard against that bias, reservation's real benefit is modelled (a group with a claimed table always has a seat waiting and walks straight to it with food), the headline measures were fixed before any results were seen, and one set of settings is built to favour reservation. The rules changed once, when the owner pointed out that food comes on plates that cannot be taken away (model 2); the new rules, settings and headline measures were written down, and a check of free flow alone passed, before any comparison was run. The rules still deserve checking against a real canteen.</li>
        <li><b>The 95% ranges cover chance only.</b> The panel and the export allow about {m.comparisons} such comparisons (the batch charts alone show {m.chartIntervals}); among so many, a few could look real by chance. This does not touch the main result: 100% against 0% on the four headline measures was chosen in advance{m.allFourAt100 ? `, and free flow won all four in all ${m.n} lunches` : ''}.</li>
        <li><b>Single lunches are noisy.</b> {onScreenIsLunch1 ? 'The lunch the app plays on screen' : 'Lunch 1 of the evidence (the one the app plays with the default settings and seed)'} has free-flow leaving of {num(m.lunch1.leftB, 1)}%, the {ordinal(m.lunch1.rank)} highest of {m.n}. There, 50% reserving adds {num(m.lunch1.gap50, 1)} pp, against {num(m.lunch1.meanGap50, 1)} pp on average. In {m.lunches100BelowAt75} of the {m.n} lunches, 100% reserving had fewer people leaving than 75%.</li>
        <li><b>Someone who leaves is a lost meal, not only a lost seat.</b> Food cannot be taken away, so nobody who leaves buys anything.</li>
      </ul>
    </Section>
  );
}

function CsvGuide() {
  return (
    <Section id="csv" title="Reading a CSV export">
      <ul class="fbullets">
        <li>Three comment lines (title; model, build and export time; the settings as JSON), a header row, then <code>run</code> rows (one per lunch and level) and <code>pair</code> rows (one per lunch and level above 0%).</li>
        <li><code>run</code> rows hold three of the four headline measures, times, seat-time shares, reservation counts and results by group size (<code>bySize_s1</code>…<code>bySize_s6</code>). Peak seat use needs both versions of a lunch, so it is on <code>pair</code> rows (<code>pair_p3Level</code> = reservation, <code>pair_p3Baseline</code> = free flow).</li>
        <li><code>reserveFraction</code> is the share of groups reserving (0 = free flow). <code>seed</code> generates a lunch's crowd and <code>seedIndex</code> numbers the lunches; <code>runHash</code> fingerprints a simulation so a replay can be checked.</li>
        <li>Cohort columns read <code>pair_cohort&lt;name&gt;_&lt;side&gt;_&lt;measure&gt;</code>: <code>R</code> reservers, <code>N</code> the rest, <code>Rclaimed</code> and <code>Rfallback</code> reservers who did and did not get a table; <code>level</code> is measured in the reservation version, <code>baseline</code> on the same groups in the free-flow version.</li>
        <li>Blank cells are expected: pair columns on run rows and the reverse, <code>sweepSetting</code> and <code>sweepValue</code> in a reservation sweep, claim search time at 0%, and cohort <code>N</code> at 100%. The file holds raw values; the batch panel computes the gaps.</li>
      </ul>
    </Section>
  );
}

export function FindingsPanel() {
  const m = getFindingsModel();
  const cfg = applied.value;
  const settingsMatch = normal(cfg) === normal(CFG);
  const onScreenIsLunch1 = settingsMatch && cfg.seed === CFG.seed;
  const stale = FINDINGS.model !== MODEL_VERSION || EVIDENCE.model !== MODEL_VERSION;
  const c = checks(m);
  const [b, , , , all] = m.head;
  return (
    <div class="findings">
      <p class="flead">
        In this model, at the default settings, letting groups reserve tables makes the canteen worse on {c.worseAt100 ? 'all four headline measures' : 'most headline measures'}. When every group reserves, {num(all.leftPct, 1)}% of the people who come to lunch leave without eating instead of {num(b.leftPct, 1)}%, and fewer leave under free flow in {c.leftAllLunches100 ? `all ${m.n}` : `${all.left!.W} of the ${m.n}`} lunches.{c.dependsOnDoorView ? ' The difference comes from groups turning round at the door, where tables with an object make the hall look full.' : ''}
      </p>
      <p class="fscope muted">
        From the built-in evidence and findings data: the default settings, {m.n} lunches at each of 0, 25, 50, 75 and 100% of groups reserving (model version {EVIDENCE.model}).{' '}
        {!settingsMatch && <>Your current settings differ from the defaults, so your lunches may behave differently. <button type="button" class="linklike" onClick={() => openDrawer('batch')}>Test your settings in Batch runs</button></>}
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
      <Limits m={m} onScreenIsLunch1={onScreenIsLunch1} />
      <CsvGuide />
    </div>
  );
}
