import { language, localise, msg as trText, rich } from '../i18n';
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
import { SensitivityExplorer } from './sensitivity';
import { ResearchExplorer } from './research';

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
const ordinal = (k: number) => language.value === 'th' ? String(k) : `${k}${k % 100 >= 11 && k % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][k % 10] ?? 'th'}`;
/** Settings the findings apply to: the evidence ignores the seed and the live slider (the sweep sets its own levels). */
const normal = (c: Config) => JSON.stringify({ ...c, seed: CFG.seed, reserve: { ...c.reserve, percentA: CFG.reserve.percentA } });

const LEVEL_STYLE: Record<string, { color: string; dash?: string }> = {
  '0': { color: 'var(--lvl-0)' },
  '0.25': { color: 'var(--lvl-1)', dash: '7 4' },
  '0.5': { color: 'var(--lvl-2)', dash: '2 3' },
  '0.75': { color: 'var(--lvl-3)', dash: '10 3 2 3' },
  '1': { color: 'var(--lvl-4)' },
};
const levelName = (f: number) => (f === 0 ? 'Free flow' : trText("{v0} reserving", { v0: (lvl(f)) }));
const pctTick = (v: number) => `${Math.round(v * 100)}%`;

function Section({ id, title, children }: { id: string; title: string; children: ComponentChildren }) {
  return (
    <section class="fsection" aria-labelledby={`f-${id}`}>
      <h3 id={`f-${id}`} tabIndex={-1}>{localise(title)}</h3>
      {localise(children)}
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
    <Section id="short" title={trText("In short")}>
      <ul class="fbullets">
        <li>{rich("{v0} When every group reserves, {v1}% of the people who come to lunch leave before getting food, instead of {v2}% ({v3} to {v4} people per lunch): {v5} percentage points{v6}.", { v0: (<b>{trText("More people leave without eating.")}</b>), v1: (num(all.leftPct, 1)), v2: (num(b.leftPct, 1)), v3: (int(b.leftPeople)), v4: (int(all.leftPeople)), v5: (sgn(all.left!.mean)), v6: (bracket(all.left!.lo, all.left!.hi, 1)) })}</li>
        {localise(all.util!.mean < 0 && all.thrGap!.mean < 0 && (
          <li>{rich("{v0} Peak seat use drops from {v1}% to {v2}%, and {v3} fewer people sit down in the best hour. The time from getting food to sitting down changes by {v4} seconds.", { v0: (<b>{trText("Seats and throughput fall; plates wait a little longer.")}</b>), v1: (num(b.utilPct, 0)), v2: (num(all.utilPct, 0)), v3: (int(-all.thrGap!.mean)), v4: (sgn(all.plateS!.mean, 0)) })}</li>
        ))}
        <li>{rich("{v0} {v1}the leaving, seat-use and throughput losses ({v2}).", { v0: (<b>{localise(c.minShare25 >= 0.5 ? 'A quarter reserving does most of the damage:' : 'A quarter reserving already does part of the damage:')}</b>), v1: (aboutTwoThirds(c.shares25) ? 'about two-thirds of ' : ''), v2: (range(Math.min(...c.shares25), Math.max(...c.shares25), 0, 100, '%')) })}</li>
        <li>{rich("{v0} With every group reserving, {v1} of seats at the busiest hour are reserved with nobody in them ({v2} at 25%). From the door a table with an object looks taken, so {v3} of arrivals turn round at once, against {v4} under free flow.", { v0: (<b>{trText("Idle seats can look taken in this model.")}</b>), v1: (pc(m.reservedEmpty['1'])), v2: (pc(m.reservedEmpty['0.25'])), v3: (pc(l1.door, 1)), v4: (pc(l0.door, 1)) })}</li>
        {localise(c.claimedHelped && c.reserversHurt && c.othersHurt && (
          <li>{rich("{v0} groups that get a table leave less often than the same groups under free flow (they got past the door and met shorter queues), but reserving groups as a whole, and everyone else, leave more often.", { v0: (<b>{trText("Who pays:")}</b>) })}</li>
        ))}
        {localise(c.dependsOnDoorView && (() => {
          const q = m.robust.find((r) => r.id === 'queuesOnly')!;
          return <li>{rich("{v0} The extra leaving happens at the door ({v1} pp), partly offset by fewer people giving up in the shorter queues ({v2} pp). If arriving groups judged only the queues, reservation would make no clear difference to leaving ({v3} pp{v4}), though it would still cost {v5} pp of peak seat use.", { v0: (<b>{trText("It depends on how full the hall looks.")}</b>), v1: (sgn((m.leave['1'].door - m.leave['0'].door) * 100)), v2: (sgn((m.leave['1'].queue - m.leave['0'].queue) * 100)), v3: (sgn(q.left.adv)), v4: (bracket(q.left.lo, q.left.hi, 1)), v5: (num(q.peakUtilPct.adv, 1)) })}</li>;
        })())}
        {localise(c.robustAllBetter ? (
          <li>{rich("{v0} Fewer people left without eating under free flow in all {v1} settings tried, by {v2} percentage points.", { v0: (<b>{trText("It holds beyond the defaults.")}</b>), v1: (m.robust.length), v2: (range(Math.min(...gaps), Math.max(...gaps), 1)) })}</li>
        ) : (
          <li>{rich("{v0} In the earlier checks, fewer people left without eating under free flow in {v1} of the {v2} settings tried; the difference is not clear with {v3}. The 36-setting explorer above extends those checks.", { v0: (<b>{trText("Beyond the defaults, results vary.")}</b>), v1: (betterIn), v2: (m.robust.length), v3: (list(m.robust.filter((r) => r.left.lo <= 0).map((r) => `“${trText(r.label)}”`))) })}</li>
        ))}
      </ul>
    </Section>
  );
}

function HowItWorks({ m }: { m: FindingsModel }) {
  const utilBase = m.head.slice(1).map((r) => r.utilPct - r.util!.mean);
  return (
    <Section id="how" title={trText("How the comparison works")}>
      <ul class="fbullets">
        <li>{rich("{v0} Each member queues at a stall. The first to get food looks for a table with room for the whole group, seeing {v1} m around. After {v2} minutes of circling the group takes a table with room for some of them, and the rest keep looking. Food comes on a plate, so nobody leaves holding food.", { v0: (<b>{trText("Free flow (canteen B).")}</b>), v1: (num(CFG.search.visibility, 0)), v2: (num(CFG.search.splitAfter / 60, 0)) })}</li>
        <li>{rich("{v0} One member, the claimer, looks for a completely empty table and leaves an object on it while the others queue. A group that finds one has claimed it; after {v1} seconds without one, it falls back to free flow.", { v0: (<b>{trText("Reservation (canteen A).")}</b>), v1: (num(CFG.reserve.claimSearchLimit, 0)) })}</li>
        <li>{rich("{v0} On arrival a group looks at the queues and the tables. It leaves at once if even the shortest queue looks longer than it will wait ({v1} minutes on average; groups vary), or if too few tables look free for it (about {v2} for a group of average patience). A table with an object looks taken. Anyone still queuing past the group's limit gives up alone.", { v0: (<b>{trText("Leaving before food (both canteens).")}</b>), v1: (num(CFG.leave.waitMean / 60, 0)), v2: (CFG.leave.roomNeeded) })}</li>
        <li>{rich("{v0} Strangers may join a reserved table only after the group is seated, in parties of up to {v1}, while at least {v2} of its {v3} seats are empty.", { v0: (<b>{trText("Sharing.")}</b>), v1: (CFG.reserve.shareMaxParty), v2: (CFG.reserve.shareMinEmpty), v3: (m.seatsPerTable) })}</li>
        <li>{rich("{v0} Each of {v1} lunches is replayed with 0% (free flow), 25%, 50%, 75% and 100% of groups reserving: the same diners arriving at the same times, with the same patience. Groups that reserve at 25% also reserve at every higher level.", { v0: (<b>{trText("Five versions of each lunch.")}</b>), v1: (m.n) })}</li>
      </ul>
      <ScrollTable label={trText("The four headline measures")}>
        <table class="data fdefs">
          <caption>{trText("The four headline measures, fixed before any result was seen")}</caption>
          <thead><tr><th scope="col">{trText("Measure")}</th><th scope="col">{trText("What it counts")}</th><th scope="col">{trText("Better")}</th></tr></thead>
          <tbody>
            <tr><th scope="row">{trText("Left without eating")}</th><td>{trText("Share of the people who came who left before getting food: at the door, or after queuing too long")}</td><td>{trText("Lower")}</td></tr>
            <tr><th scope="row">{trText("Time carrying a plate")}</th><td>{trText("Average minutes from getting food to sitting down, over everyone who got food")}</td><td>{trText("Lower")}</td></tr>
            <tr><th scope="row">{trText("Peak seat use")}</th><td>{trText("Average share of seats with someone sitting in them, during the busiest hour")}</td><td>{trText("Higher")}</td></tr>
            <tr><th scope="row">{trText("Peak throughput")}</th><td>{trText("Most people sitting down in any 60 minutes (each lunch's own best hour)")}</td><td>{trText("Higher")}</td></tr>
          </tbody>
        </table>
      </ScrollTable>
      <details class="fdetails">
        <summary>{trText("How to read the numbers")}</summary>
        <ul class="fbullets">
          <li>{trText("“pp” means percentage points, the difference between two percentages.")}</li>
          <li>{rich("Each gap is the average of the {v0} lunch-by-lunch gaps, worked out before rounding, so it can differ by one in the last digit from the difference of the rounded averages. Free flow's peak seat use also shifts slightly ({v1}) with the level it is compared with, because each comparison picks its own busiest hour.", { v0: (m.n), v1: (range(Math.min(...utilBase), Math.max(...utilBase), 1, 1, '%')) })}</li>
          <li>{rich("The 95% range in brackets shows how precisely {v0} lunches pin down the average gap. Single lunches vary much more, and the range says nothing about whether the model's rules match a real canteen.", { v0: (m.n) })}</li>
          <li>{trText("Comparing each level with free flow on the same lunch cancels the variation the two versions share.")}</li>
          <li>{rich("The busiest hour is the 60 minutes (on average {v0} to {v1}) in which the two versions of a lunch together have the fewest free seats; a seat counts as taken if someone sits in it, it is saved for a groupmate, or it is reserved.", { v0: (at(m.peakWindow[0])), v1: (at(m.peakWindow[1])) })}</li>
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
    <Section id="r1" title={trText((c.worseEverywhere ? '1. Reservation loses on every headline measure' : '1. The headline measures at each level'))}>
      <p>{rich("Each cell shows the level's average over {v0} lunches, then its gap from free flow in percentage points (pp), seconds or people per hour, with the 95% range in brackets.", { v0: (m.n) })}</p>
      <ScrollTable label={trText("Headline measures by share of groups reserving")}>
        <table class="data fhead">
          <thead>
            <tr><th scope="col">{trText("Groups reserving")}</th><th scope="col">{trText("Left without eating")}</th><th scope="col">{trText("Time carrying a plate")}</th><th scope="col">{trText("Peak seat use")}</th><th scope="col">{trText("Peak throughput")}</th></tr>
          </thead>
          <tbody>
            {localise(m.head.map((r) => (
              <tr key={r.f}>
                <th scope="row">{localise(r.f === 0 ? '0% (free flow)' : lvl(r.f))}</th>
                <td class="num">{localise(num(r.leftPct, 1))}%{localise(r.left ? trText(": {v0} pp{v1}", { v0: (sgn(r.left.mean)), v1: (bracket(r.left.lo, r.left.hi, 1)) }) : trText(" ({v0} people)", { v0: (int(r.leftPeople)) }))}</td>
                <td class="num">{rich("{v0} s{v1}", { v0: (num(r.plateMin * 60, 0)), v1: (r.plateS ? `: ${sgn(r.plateS.mean, 0)} ${trText("s")}${bracket(r.plateS.lo, r.plateS.hi, 0)}` : '') })}</td>
                <td class="num">{localise(num(r.utilPct, 1))}%{localise(r.util ? trText(": {v0} pp{v1}", { v0: (sgn(r.util.mean)), v1: (bracket(r.util.lo, r.util.hi, 1)) }) : '')}</td>
                <td class="num">{localise(int(r.thr))}{localise(r.thrGap ? `: ${sgn(r.thrGap.mean, 0)}${bracket(r.thrGap.lo, r.thrGap.hi, 0)}` : ' per hour')}</td>
              </tr>
            )))}
          </tbody>
        </table>
      </ScrollTable>
      <ul class="fbullets">
        <li>{rich("{v0} Fewer people left without eating, and peak seat use and throughput were higher, under free flow in {v1}. Plates were carried longer under reservation in {v2} (of {v3}).", { v0: (<b>{trText("Consistent across lunches.")}</b>), v1: (c.threeAllLunchesEveryLevel ? trText("all {v0} lunches at every level", { v0: (m.n) }) : trText("at least {v0} of the {v1} lunches at each level", { v0: (minW), v1: (m.n) })), v2: (list(reserve.map((r) => trText("{v0} at {v1}", { v0: (r.plateS!.W), v1: (lvl(r.f)) })))), v3: (m.n) })}</li>
        <li>{rich("{v0} Leaving without eating goes from {v1}% to {v2}% ({v3} to {v4} people per lunch). The plate cost is small: {v5} seconds on a {v6}-second wait.", { v0: (<b>{trText("The size of it.")}</b>), v1: (num(m.head[0].leftPct, 1)), v2: (num(all.leftPct, 1)), v3: (int(m.head[0].leftPeople)), v4: (int(all.leftPeople)), v5: (sgn(all.plateS!.mean, 0)), v6: (num(m.head[0].plateMin * 60, 0)) })}</li>
        <li>{rich("{v0} At 25%, leaving has already risen {v1} of the {v2} points it rises at 100% ({v3}); the seat-use and throughput losses are {v4} of their full size. The plate cost grows more steadily ({v5} of it at 25%).", { v0: (<b>{localise(c.minShare25 >= 0.5 ? 'Most of the damage is done once a quarter of groups reserve.' : 'A quarter of groups reserving already does part of the damage.')}</b>), v1: (num(q.left!.mean, 1)), v2: (num(all.left!.mean, 1)), v3: (pc(m.shareAt25.left)), v4: (range(Math.min(m.shareAt25.util, m.shareAt25.thr), Math.max(m.shareAt25.util, m.shareAt25.thr), 0, 100, '%')), v5: (pc(m.shareAt25.plate)) })}</li>
        <li>{rich("{v0} Leaving changes by {v1} pp{v2} and throughput by {v3} per hour{v4}{v5}. Plate time changes by {v6} seconds{v7}.", { v0: (<b>{localise(flat ? 'Little changes near the top.' : 'From 75% to 100%.')}</b>), v1: (sgn(m.topStep.left.mean!)), v2: (bracket(m.topStep.left.lo, m.topStep.left.hi, 1, true)), v3: (sgn(m.topStep.thr.mean!, 0)), v4: (bracket(m.topStep.thr.lo, m.topStep.thr.hi, 0, true)), v5: (flat ? ': too small to tell from no change' : ''), v6: (sgn(m.topStep.plateS.mean!, 0)), v7: (bracket(m.topStep.plateS.lo, m.topStep.plateS.hi, 0, true)) })}</li>
        {localise(c.seatedFaster && c.doorUpQueueDown && (
          <li>{rich("{v0} Entrance to seat for people who sat (a secondary measure) is {v1} seconds shorter at 100%{v2}. More people turn round at the door, so the queues are shorter: {v3} minutes of queueing on average against {v4} under free flow.", { v0: (<b>{trText("People who do sit reach a seat sooner under reservation, because fewer come in.")}</b>), v1: (num(-s100.mean, 0)), v2: (bracket(-s100.hi!, -s100.lo!, 0)), v3: (num(m.queueWait.a100, 1)), v4: (num(m.queueWait.b, 1)) })}</li>
        ))}
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
    { label: trText("{v0}: kept for members still getting food", { v0: (SEAT_LABELS[3]) }), short: 'Reserved, members getting food', color: 'var(--seat-3)', values: seat((f) => s(f).waiting) },
    { label: trText("{v0}: beyond the group's size", { v0: (SEAT_LABELS[3]) }), short: 'Reserved, beyond group size', color: 'var(--seat-3)', hatch: true, values: seat((f) => s(f).beyondSize) },
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
  const doorSeries: Series[] = [0, 1].map((f) => ({ label: trText("{v0}: at the door", { v0: (levelName(f)) }), ...LEVEL_STYLE[String(f)], values: m.leaveByArrival.door[levelKey(f)] }));
  const queueSeries: Series[] = [0, 1].map((f) => ({ label: trText("{v0}: from a queue", { v0: (levelName(f)) }), color: LEVEL_STYLE[String(f)].color, dash: '2 3', values: m.leaveByArrival.queue[levelKey(f)] }));
  const leaveSeries = [...doorSeries, ...queueSeries];
  const leaveMax = Math.max(0.1, Math.ceil(Math.max(...leaveSeries.flatMap((x) => x.values.map((v) => v ?? 0))) * 10) / 10);
  const span = m.leaveByArrival.binMid.length * bin;
  return (
    <Section id="r2" title={trText("2. Why: idle seats in the rush, and a hall that looks full")}>
      <p>{rich("Reservation leaves seats idle at the very hour they are needed. With every group reserving, {v0} of seats at the busiest hour are reserved with nobody sitting in them ({v1} when a quarter of groups reserve), and free seats fall from {v2} to {v3}.", { v0: (pc(m.reservedEmpty['1'])), v1: (pc(m.reservedEmpty['0.25'])), v2: (pc(s(0).free)), v3: (pc(s100.free)) })}</p>
      <ChartFigure
        title={trText("Seats at the busiest hour")}
        label={trText((trText("Stacked bars of seat states at the busiest hour for free flow and each reservation level. Free seats fall from {v0} to {v1} as reserved-but-empty seats rise to {v2}.", { v0: (pc(s(0).free)), v1: (pc(s100.free)), v2: (pc(m.reservedEmpty['1'])) })))}
        legend={seatSeries.slice().reverse()}
        note={trText((trText("Share of the time seats spent in each state during the busiest hour (on average {v0} to {v1}); average of {v2} lunches. The free-flow bar comes from the lunches compared with 100% reserving.", { v0: (at(m.peakWindow[0])), v1: (at(m.peakWindow[1])), v2: (m.n) })))}
        table={
          <table class="data">
            <thead><tr><th scope="col">{trText("Seat state")}</th>{localise(cats.map((x) => <th scope="col" key={x}>{localise(x)}</th>))}</tr></thead>
            <tbody>{localise(seatSeries.slice().reverse().map((x) => <tr key={x.label}><th scope="row">{localise(x.label)}</th>{localise(x.values.map((v, i) => <td class="num" key={i}>{localise(pc(v ?? 0, 1))}</td>))}</tr>))}</tbody>
          </table>
        }
      >
        <StackedBars categories={cats} axisLabels={language.value === 'th' ? LEVELS.map(lvl) : cats} series={seatSeries} ticks={[0, 0.25, 0.5, 0.75, 1]} fmt={pctTick} labelLast />
      </ChartFigure>
      <p>{trText("At 100% reserving, the reserved-but-empty seats are, as shares of all seats:")}</p>
      <ul class="fbullets">
        <li>{rich("{v0} A reserving group takes a whole {v1}-seat table whatever its size, so a pair's claim keeps {v2} seats empty until the pair has sat down.", { v0: (<b>{rich("Beyond the group's size, {v0}.", { v0: (pc(s100.beyondSize, 1)) })}</b>), v1: (m.seatsPerTable), v2: (m.seatsPerTable - 2) })}</li>
        <li>{rich("{v0} The table is claimed typically about {v1} seconds after arrival, before anyone has food, so its seats wait out the whole queue.", { v0: (<b>{rich("Kept for members still getting food, {v0}.", { v0: (pc(s100.waiting, 1)) })}</b>), v1: (num(m.claimMedianS100, 0)) })}</li>
        <li>{rich("{v0} A group of 3 to 5 leaves too few empty seats to share ({v1}), and a solo's or pair's table stops taking strangers once joiners leave fewer than {v2} seats empty ({v3}).", { v0: (<b>{rich("Spare seats nobody may use, {v0}.", { v0: (pc(s100.blocked, 1)) })}</b>), v1: (pc(m.blockedNoJoiners100, 1)), v2: (CFG.reserve.shareMinEmpty), v3: (pc(m.blockedAfterJoiners100, 1)) })}</li>
        <li>{rich("{v0} They can be used, but never by groups of 3 or more.", { v0: (<b>{rich("Open to solos and pairs only, {v0}.", { v0: (pc(s100.open, 1)) })}</b>) })}</li>
      </ul>
      <p>{rich("Free flow saves seats too: {v0} of seats at the busiest hour, most of them ({v1}) for groupmates still getting food. But a free-flow group saves seats only once its searcher has food and a table, and only as many as it needs. Over the whole lunch, at the moments when someone holding food was stuck looking for a table, {v2} of seats were saved for others under free flow, against {v3} saved or reserved with every group reserving.", { v0: (pc(m.baselineHeld, 1)), v1: (pc(m.baselineHeldNoFood / m.baselineHeld)), v2: (pc(m.blockedWhileNeeded.b, 1)), v3: (pc(m.blockedWhileNeeded.a100, 1)) })}</p>
      <p>{rich("{v0} {v1} of the people arriving at a canteen where every group reserves turn round at once, against {v2} under free flow; for {v3} the reason includes the seating: too few tables look free, because a table with an object looks taken even when its group is seated.{v4}", { v0: (<b>{trText("From the door the hall looks full.")}</b>), v1: (pc(l1.door, 1)), v2: (pc(l0.door, 1)), v3: (m.doorSeatingShare['1'] >= 0.995 ? 'nearly all of them' : trText("{v0} of them", { v0: (pc(m.doorSeatingShare['1'])) })), v4: (c.doorUpQueueDown ? trText(" With fewer people inside, the queues are shorter, so fewer give up in a queue ({v0} against {v1}): in all, {v2} leave without eating against {v3}.", { v0: (pc(l1.queue, 1)), v1: (pc(l0.queue, 1)), v2: (pc(l1.all, 1)), v3: (pc(l0.all, 1)) }) : '') })}</p>
      <ChartFigure
        title={trText("Leaving without eating, by arrival time")}
        label={trText((trText("Line chart of the share of people who left at the door and from a queue, by arrival time, under free flow and with every group reserving. At the door: {v0} under free flow, {v1} with every group reserving.", { v0: (pc(l0.door, 1)), v1: (pc(l1.door, 1)) })))}
        legend={leaveSeries}
        lineLegend
        note={trText((trText("Share of the people arriving in each {v0} minutes (plotted mid-interval) who turned round at the door, or who gave up in a queue; {v1} lunches.", { v0: (bin), v1: (m.n) })))}
        table={
          <table class="data">
            <thead><tr><th scope="col">{trText("Arrived")}</th>{localise(leaveSeries.map((x) => <th scope="col" key={x.label}>{localise(x.label)}</th>))}</tr></thead>
            <tbody>{localise(m.leaveByArrival.binMid.map((mm, i) => <tr key={mm}><th scope="row" class="num">{localise(at(mm - bin / 2))}–{localise(at(mm + bin / 2))}</th>{localise(leaveSeries.map((x) => <td class="num" key={x.label}>{localise(x.values[i] === null ? '—' : pc(x.values[i]!, 1))}</td>))}</tr>))}</tbody>
          </table>
        }
      >
        <Lines x={m.leaveByArrival.binMid} xRange={[0, span]} series={leaveSeries} yMax={leaveMax} ticks={[0, leaveMax / 2, leaveMax]} fmt={pctTick} xTicks={[0, 30, 60, 90, 120, 150].filter((t) => t <= span)} xFmt={at} yTitle={trText("Left without eating")} />
      </ChartFigure>
      <ChartFigure
        title={trText("Completely empty tables through lunch")}
        label={trText((trText("Line chart of completely empty tables from {v0} to {v1}. Under free flow {v2} tables are empty at 12:10; with reservation only {v3} are.", { v0: (at(0)), v1: (at(180)), v2: (num(m.emptyAt1210['0'], 0)), v3: (range(Math.min(...e1210), Math.max(...e1210))) })))}
        legend={emptySeries}
        lineLegend
        note={trText((trText("Tables with nobody seated, no seat saved and no reservation object: the only tables a claimer may take. Average of {v0} lunches; the rush peaks at {v1}.", { v0: (m.n), v1: (at(m.rushPeakMin)) })))}
        table={
          <table class="data">
            <thead><tr><th scope="col">{trText("Time")}</th>{localise(emptySeries.map((x) => <th scope="col" key={x.label}>{localise(x.label)}</th>))}</tr></thead>
            <tbody>{localise(m.empty.minutes.map((t, i) => (i % 2 === 0 ? <tr key={t}><th scope="row" class="num">{localise(at(t))}</th>{localise(emptySeries.map((x) => <td class="num" key={x.label}>{localise(num(x.values[i], 1))}</td>))}</tr> : null)))}</tbody>
          </table>
        }
      >
        <Lines x={m.empty.minutes} series={emptySeries} yMax={T} ticks={[0, T / 4, T / 2, (3 * T) / 4, T]} fmt={(v) => String(Math.round(v))} xTicks={[0, 30, 60, 90, 120, 150, 180]} xFmt={at} rule={{ x: m.rushPeakMin, label: at(m.rushPeakMin) }} yTitle={trText((trText("Empty tables (of {v0})", { v0: (T) })))} />
      </ChartFigure>
      <p>{rich("Under free flow, {v0} of {v1} tables are still completely empty at 12:10; with reservation only {v2} are.{v3} So {v4} of the reservers who find no table had not seen an empty table to head for when their {v5} seconds ran out.", { v0: (num(m.emptyAt1210['0'], 0)), v1: (T), v2: (range(Math.min(...e1210), Math.max(...e1210))), v3: (m.scarce100 && trText(" When every group reserves, fewer than 1.5 remain on average from {v0} to {v1}.", { v0: (at(m.scarce100[0])), v1: (at(m.scarce100[1])) })), v4: (pc(m.fallbackNoTarget100)), v5: (num(CFG.reserve.claimSearchLimit, 0)) })}</p>
      <p>{rich("{v0} Reservers arriving between 12:00 and 13:00 claim {v1}{v2} per lunch: once empty tables run out, more reservers {v3}. Extra claims come before 12:00 and after 13:00, when seats are plentiful, so claims per lunch grow ever more slowly: {v4}.", { v0: (<b>{trText("Why a quarter does most of the damage.")}</b>), v1: (rushSimilar ? 'nearly the same number of tables at every level, ' : ''), v2: (range(Math.min(...rush), Math.max(...rush))), v3: (rushSimilar ? trText("only add groups that find no table ({v0} per lunch at 25%, {v1} at 100%)", { v0: (int(m.rushFallbacks['0.25'])), v1: (int(m.rushFallbacks['1'])) }) : trText("mostly add groups that find no table (+{v0} claims per lunch against +{v1} groups with no table, from 25% to 100%)", { v0: (int(m.rushClaims['1'] - m.rushClaims['0.25'])), v1: (int(m.rushFallbacks['1'] - m.rushFallbacks['0.25'])) })), v4: (list(RESERVE_LEVELS.map((f) => trText("{v0} at {v1}", { v0: (int(m.claimsPerLunch[rk(f)])), v1: (lvl(f)) })))) })}</p>
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
    <Section id="r3" title={trText("3. Who pays")}>
      <p>{rich("{v0} {v1}{v2} Each cell shows the share leaving without eating under reservation, then the same groups in the free-flow version of the same lunch.", { v0: (c.claimedSafest ? 'A group that secures a table is the least likely to leave.' : 'Getting a table helps a group less than one might expect.'), v1: (c.othersHurt ? 'Non-reservers leave more often than under free flow' : 'Non-reservers do not always leave more often than under free flow'), v2: (c.reserversHurt ? ', and so do reserving groups as a whole.' : '.') })}</p>
      <ScrollTable label={trText("Left without eating by group of diners")}>
        <table class="data">
          <thead><tr><th scope="col">{trText("Group")}</th>{localise(RESERVE_LEVELS.map((f) => <th scope="col" key={f}>{rich("{v0} reserving", { v0: (lvl(f)) })}</th>))}</tr></thead>
          <tbody>
            {localise(rows.map(([label, cells]) => (
              <tr key={label}>
                <th scope="row">{localise(label)}</th>
                {localise(RESERVE_LEVELS.map((f) => {
                  const x = cells[rk(f)];
                  return <td class="num" key={f}>{localise(x ? trText("{v0}% vs {v1}%", { v0: (num(x.level, 1)), v1: (num(x.baseline, 1)) }) : '(none)')}</td>;
                }))}
              </tr>
            )))}
          </tbody>
        </table>
      </ScrollTable>
      {localise(c.fallbackBelowBaseline && <p>{trText("Reservers who found no table leave less often than the same groups under free flow, but they are a selected set: they all got past the door. Reserving groups that turned round at the door never tried to claim, and they count only in “All reserving groups”.")}</p>)}
      <p>{rich("The share of reserving groups that got a table is {v0}. Per lunch, {v1} reserving groups turn round at the door before trying at 25%, and {v2}.", { v0: (list(RESERVE_LEVELS.map((f) => trText("{v0} at {v1}", { v0: (pc(m.claimShare[rk(f)])), v1: (lvl(f)) })))), v1: (int(m.doorLeftReservers['0.25'])), v2: (list(RESERVE_LEVELS.slice(1).map((f) => trText("{v0} at {v1}", { v0: (int(m.doorLeftReservers[rk(f)])), v1: (lvl(f)) })))) })}</p>
      <ul class="fbullets">
        <li>{rich("{v0} They left without eating {v1} of the time; the same groups left {v2} of the time under free flow. They all got past the door and then met shorter queues; the table itself keeps no one in a queue. {v3}", { v0: (<b>{trText("Reservers who got a table leave less often.")}</b>), v1: (range(Math.min(...claimed.map((x) => x.level)), Math.max(...claimed.map((x) => x.level)), 1, 1, '%')), v2: (range(Math.min(...claimed.map((x) => x.baseline)), Math.max(...claimed.map((x) => x.baseline)), 1, 1, '%')), v3: (later ? trText("They are not faster, though: they reach their seats {v0} seconds later, because the claimer searches before queueing.", { v0: (range(m.claimedDelayS[0], m.claimedDelayS[1])) }) : sooner ? trText("They also reach their seats {v0} seconds sooner.", { v0: (range(-m.claimedDelayS[1], -m.claimedDelayS[0])) }) : '') })}</li>
        <li>{rich("{v0} Groups that got a table and groups that did not {v1}. At 50% reserving, {v2}.", { v0: (<b>{trText("Getting a table depends on when you arrive.")}</b>), v1: (size(m.meanSize.claimed) === size(m.meanSize.fallback) ? trText("both average {v0} people", { v0: (size(m.meanSize.claimed)) }) : trText("average {v0} and {v1} people", { v0: (size(m.meanSize.claimed)), v1: (size(m.meanSize.fallback)) })), v2: (m.claimAllBeforeMin50 !== null ? trText("every reserver arriving before {v0} got a table, but only {v1} of those arriving between 12:10 and 12:50 did", { v0: (at(m.claimAllBeforeMin50)), v1: (mid) }) : trText("only {v0} of reservers arriving between 12:10 and 12:50 got a table", { v0: (mid) })) })}</li>
        <li>{rich("{v0} Their typical arrival time is {v1}, when no empty table is left, and they then queue in the rush after a minute spent searching.{v2}", { v0: (<b>{trText("Reservers who find no table arrive at the worst time.")}</b>), v1: (fa0 === fa1 ? at(fa0) : `${at(fa0)}–${at(fa1)}`), v2: (m.fallbackSameTimeMaxGap <= 1 ? trText(" Non-reservers who arrive at the same times leave almost as often (within {v0} percentage points), so their extra leaving comes from when they arrive.", { v0: (num(m.fallbackSameTimeMaxGap, 1)) }) : '') })}</li>
        <li>{rich("{v0} ({v1} at 25%){v2}.", { v0: (<b>{localise(n25 > r25 ? 'Non-reservers leave more often than reserving groups as a whole' : 'Reserving groups as a whole leave at least as often as non-reservers')}</b>), v1: (n25 > r25 ? trText("{v0}% against {v1}%", { v0: (num(n25, 1)), v1: (num(r25, 1)) }) : trText("{v0}% against {v1}%", { v0: (num(r25, 1)), v1: (num(n25, 1)) })), v2: (c.reserversHurt && c.othersHurt ? ', yet both leave more often than when nobody reserves' : '') })}</li>
      </ul>
      <ChartFigure
        title={trText("Reservers who got a table, by arrival time")}
        label={trText((trText("Line chart of the share of reserving groups that got a table by arrival time. At 50% reserving, {v0}only {v1} of those arriving between 12:10 and 12:50 did.", { v0: (m.claimAllBeforeMin50 !== null ? trText("every reserver arriving before {v0} got one, while ", { v0: (at(m.claimAllBeforeMin50)) }) : ''), v1: (mid) })))}
        legend={claimSeries}
        lineLegend
        note={trText((trText("Share of reserving groups that claimed a table, by the {v0} minutes in which they arrived (plotted mid-interval); {v1} lunches. Groups that turned round at the door count as not getting one.", { v0: (bin), v1: (m.n) })))}
        table={
          <table class="data">
            <thead><tr><th scope="col">{trText("Arrived")}</th>{localise(claimSeries.map((x) => <th scope="col" key={x.label}>{localise(x.label)}</th>))}</tr></thead>
            <tbody>{localise(m.claimBinMid.map((mm, i) => <tr key={mm}><th scope="row" class="num">{localise(at(mm - bin / 2))}–{localise(at(mm + bin / 2))}</th>{localise(claimSeries.map((x) => <td class="num" key={x.label}>{localise(x.values[i] === null ? '—' : pc(x.values[i]!))}</td>))}</tr>))}</tbody>
          </table>
        }
      >
        <Lines x={m.claimBinMid} xRange={[0, span]} series={claimSeries} yMax={1} ticks={[0, 0.25, 0.5, 0.75, 1]} fmt={pctTick} xTicks={[0, 30, 60, 90, 120, 150].filter((t) => t <= span)} xFmt={at} yTitle={trText("Got a table")} />
      </ChartFigure>
      <p>{localise(bigRise ? trText("Reservation turns big groups away: with every group reserving, groups of 5 and 6 leave without eating {v0} of the time, against {v1} under free flow. A group that size needs a table with at least that many seats nobody sits on, and from the door few look like that.", { v0: (pctList(big, '1')), v1: (pctList(big, '0')) }) : 'Groups of every size leave without eating.')}{localise(smallFall ? trText(" Solos and pairs leave less often ({v0} against {v1}), because the queues are shorter for whoever comes in.", { v0: (pctList(small, '1')), v1: (pctList(small, '0')) }) : '')}{localise(sizesRise ? ' Reservation raises the share leaving for every group size.' : '')}</p>
      <ChartFigure
        title={trText("Left without eating, by group size (people per group)")}
        label={trText((trText("Grouped bar chart of the share of people leaving without eating for groups of 1 to 6 people, for free flow and each reservation level{v0}.", { v0: (sizesRise ? '; reservation raises every size' : '') })))}
        legend={sizeSeries}
        note={trText((trText("Share of people in groups of each size who left without eating; average of {v0} lunches.", { v0: (m.n) })))}
        table={
          <table class="data">
            <thead><tr><th scope="col">{trText("Group size")}</th>{localise(sizeSeries.map((x) => <th scope="col" key={x.label}>{localise(x.label)}</th>))}</tr></thead>
            <tbody>{localise(m.bySize.map((x, i) => <tr key={x.size}><th scope="row">{localise(x.size)}</th>{localise(sizeSeries.map((ss) => <td class="num" key={ss.label}>{localise(pc(ss.values[i]!, 1))}</td>))}</tr>))}</tbody>
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
    <Section id="r4" title={trText("4. Where the time goes")}>
      <p>{rich("For people who ate in both versions of a lunch, reservation {v0}. Changes per person against the same person under free flow, in seconds:", { v0: (allNegative ? trText("shortens the trip from entrance to seat by {v0} seconds, because the queues are shorter", { v0: (range(-Math.max(...totals), -Math.min(...totals))) }) : allPositive ? trText("lengthens the trip from entrance to seat by {v0} seconds", { v0: (range(Math.min(...totals), Math.max(...totals))) }) : trText("changes the trip from entrance to seat by {v0} to {v1} seconds", { v0: (sgn(Math.min(...totals), 0)), v1: (sgn(Math.max(...totals), 0)) })) })}</p>
      <ScrollTable label={trText("Change in each part of the trip")}>
        <table class="data">
          <thead><tr><th scope="col">{trText("Part of the trip (free-flow time)")}</th>{localise(RESERVE_LEVELS.map((f) => <th scope="col" key={f}>{localise(lvl(f))}</th>))}</tr></thead>
          <tbody>
            {localise(rows.map(([label, base, k]) => (
              <tr key={k}><th scope="row">{rich("{v0} ({v1} s)", { v0: (label), v1: (num(base, 0)) })}</th>{localise(RESERVE_LEVELS.map((f) => <td class="num" key={f}>{localise(sgn(by(f)[k]))}</td>))}</tr>
            )))}
            <tr class="total"><th scope="row">{rich("Whole trip ({v0} s)", { v0: (num(t.baseline.toQueueS + t.baseline.queueAndServiceS + t.baseline.afterServiceS, 0)) })}</th>{localise(RESERVE_LEVELS.map((f) => <td class="num" key={f}>{localise(sgn(by(f).totalS))}</td>))}</tr>
          </tbody>
        </table>
      </ScrollTable>
      <ul class="fbullets">
        <li>{rich("{v0} Under free flow, {v1} of the {v2} minutes from entrance to seat are spent queueing and another {v3} being served. At the peak the stalls are busy {v4}% of the time, so no seating rule can speed up service.", { v0: (<b>{trText("The queue sets the pace.")}</b>), v1: (num(t.baseline.queueWaitS / 60, 1)), v2: (num(m.seatedE2s.b, 1)), v3: (num(CFG.stalls.serviceMean / 60, 1)), v4: (num(t.stallBusyPeakPct, 0)) })}</li>
        {localise(queue.every((x) => x >= 0) && <li>{rich("{v0} More people turn round at the door, so those who stay find shorter queues. Late claimers also let the people behind them move up, then join at the back.", { v0: (<b>{rich("Time in the queue falls by {v0} seconds.", { v0: (range(Math.min(...queue), Math.max(...queue))) })}</b>) })}</li>)}
        {localise(persons.every((x) => x > 0) && <li>{rich("{v0} Their claimer searches up to {v1} seconds before queueing and ends up {v2} seconds later than under free flow. They are {v3} of the people compared here.{v4}", { v0: (<b>{trText("Reservers who find no table lose their search time.")}</b>), v1: (num(CFG.reserve.claimSearchLimit, 0)), v2: (range(Math.min(...persons), Math.max(...persons))), v3: (range(Math.min(...people), Math.max(...people), 0, 100, '%')), v4: (Math.min(...shares) > 0 && Math.max(...shares) <= 1 ? trText(" They account for {v0} of the change.", { v0: (range(Math.min(...shares), Math.max(...shares), 0, 100, '%')) }) : '') })}</li>)}
        {localise(persons.every((x) => x <= 0) && <li>{rich("{v0} Their claimer searches up to {v1} seconds before queueing, but the shorter queues make up for it: they reach a seat {v2} seconds sooner than under free flow.", { v0: (<b>{trText("Even reservers who find no table lose nothing overall.")}</b>), v1: (num(CFG.reserve.claimSearchLimit, 0)), v2: (range(-Math.max(...persons), -Math.min(...persons))) })}</li>)}
        {localise(plate.every((x) => x > 0) && <li>{rich("{v0} With fewer free tables, searchers walk further before they find room; at 100%, {v1} of groups with food end up split across tables, against {v2} under free flow.", { v0: (<b>{rich("Carrying a plate takes {v0} seconds longer.", { v0: (range(Math.min(...plate), Math.max(...plate))) })}</b>), v1: (pc(m.groupsSplitPct['1'] / 100, 1)), v2: (pc(m.groupsSplitPct['0'] / 100, 1)) })}</li>)}
      </ul>
      <ChartFigure
        title={trText("People holding a plate with no seat")}
        label={trText((trText("Line chart of how many people hold food with no seat found or kept for them, from {v0} to {v1}, for free flow, 50% and 100% reserving. The lunch peak averages {v2} people under free flow and {v3} with every group reserving.", { v0: (at(0)), v1: (at(180)), v2: (num(m.plates.peak['0'], 0)), v3: (num(m.plates.peak['1'], 0)) })))}
        legend={plateSeries}
        lineLegend
        note={trText((trText("People carrying food who have not yet found a seat (searching, or waiting for a groupmate to find one), at each minute; average of {v0} lunches. The busiest moment of each lunch averages {v1} under free flow and {v2} with every group reserving.", { v0: (m.n), v1: (num(m.plates.peak['0'], 0)), v2: (num(m.plates.peak['1'], 0)) })))}
        table={
          <table class="data">
            <thead><tr><th scope="col">{trText("Time")}</th>{localise(plateSeries.map((x) => <th scope="col" key={x.label}>{localise(x.label)}</th>))}</tr></thead>
            <tbody>{localise(m.plates.minutes.map((tt, i) => (i % 2 === 0 ? <tr key={tt}><th scope="row" class="num">{localise(at(tt))}</th>{localise(plateSeries.map((x) => <td class="num" key={x.label}>{localise(num(x.values[i] ?? 0, 1))}</td>))}</tr> : null)))}</tbody>
          </table>
        }
      >
        <Lines x={m.plates.minutes} series={plateSeries} yMax={plateMax} ticks={[0, plateMax / 2, plateMax]} fmt={(v) => String(Math.round(v))} xTicks={[0, 30, 60, 90, 120, 150, 180]} xFmt={at} rule={{ x: m.rushPeakMin, label: at(m.rushPeakMin) }} yTitle={trText("People holding a plate")} />
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
    <Section id="meaning" title={trText("What it means")}>
      <ul class="fbullets">
        <li>{rich("{v0} A free-flow group takes seats only once it has food, and only as many as it needs. A reserving group holds a whole table from the moment it arrives: seats sit empty while its members queue, seats beyond its size stay closed to most other diners, and from the door the hall looks full, in the hour when seats are scarcest.", { v0: (<b>{trText("Idle seats in the rush explain the damage.")}</b>) })}</li>
        {localise(dilemma && <li>{rich("{v0} Each group is less likely to leave if it reserves ({v1}% against {v2}% for non-reservers at 25%), but reserving groups as a whole and non-reservers both leave more often than when nobody reserves (about {v3}). That would explain why the habit persists, and why a house rule may work where persuasion does not.", { v0: (<b>{trText("Reserving is a social dilemma.")}</b>), v1: (num(r25.level, 1)), v2: (num(n25.level, 1)), v3: (range(Math.min(...baseRange), Math.max(...baseRange), 1, 1, '%')) })}</li>)}
        {localise(rushRatio >= 0.85 && <li>{rich("{v0} A quarter of groups reserving already makes almost as many claims in the rush as when everyone reserves ({v1} against {v2} per lunch between 12:00 and 13:00).", { v0: (<b>{trText("A little reservation is not a mild compromise.")}</b>), v1: (num(m.rushClaims['0.25'], 0)), v2: (num(m.rushClaims['1'], 0)) })}</li>)}
        <li>{rich("{v0} {v1} stalls at {v2} seconds per person serve about {v3} people an hour, and free flow already seats {v4} in its best hour. No seating rule can make lunch much faster; it can only change how many people end up eating.", { v0: (<b>{trText("The kitchen sets the pace.")}</b>), v1: (CFG.layout.stallCount), v2: (num(CFG.stalls.serviceMean, 0)), v3: (int(m.stallCapacityPerHour)), v4: (int(m.head[0].thr)) })}</li>
        {localise(l0.queue > l0.door && <li>{rich("{v0} Most people who leave give up in a queue ({v1} of arrivals, against {v2} at the door).{v3}", { v0: (<b>{trText("Under free flow, the queues turn people away, not the seats.")}</b>), v1: (pc(l0.queue, 1)), v2: (pc(l0.door, 1)), v3: (fast && fast.left.b < m.head[0].leftPct ? trText(" Faster stalls ({v0} → 60 seconds per person) cut free flow's leaving from {v1}% to {v2}%.", { v0: (num(CFG.stalls.serviceMean, 0)), v1: (num(m.head[0].leftPct, 1)), v2: (num(fast.left.b, 1)) }) : '') })}</li>)}
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
    <Section id="general" title={trText("How far it generalises")}>
      <p>{rich("The earlier comparison of 100% against 0% reserving was also run under {v0} other settings, {v1} lunches each. These original checks are retained below; the 36-setting explorer above includes further assumptions and combinations. {v2}", { v0: (rows.length - 1), v1: (m.n), v2: (allBetter ? 'In every original setting, fewer people left without eating under free flow and peak seat use was higher, and every 95% range lies on free flow’s side of zero.' : 'Free flow did not win everywhere; see the table.') })}</p>
      <ScrollTable label={trText("100% against 0% reserving under other settings")}>
        <table class="data">
          <thead>
            <tr><th scope="col">{trText("Setting")}</th><th scope="col">{trText("Left without eating, free flow → all reserve")}</th><th scope="col">{trText("Extra leaving, pp")}</th><th scope="col">{trText("Lunches with fewer leavers under free flow")}</th><th scope="col">{trText("Peak seat use lost, pp")}</th><th scope="col">{trText("Time carrying a plate (+ = longer)")}</th></tr>
          </thead>
          <tbody>
            {localise(rows.map((r) => (
              <tr key={r.id}>
                <th scope="row">{localise(r.label)}</th>
                <td class="num">{localise(num(r.left.b, 1))}% → {localise(num(r.left.a, 1))}%</td>
                <td class="num">{localise(sgn(r.left.adv))}{localise(bracket(r.left.lo, r.left.hi, 1))}</td>
                <td class="num">{rich("{v0} of {v1}{v2}", { v0: (r.left.W), v1: (m.n), v2: (r.left.T ? trText(" ({v0} tied)", { v0: (r.left.T) }) : '') })}</td>
                <td class="num">{localise(num(r.peakUtilPct.adv, 1))}</td>
                <td class="num">{rich("{v0} s", { v0: (sgn(r.plate.adv * 60, 0)) })}</td>
              </tr>
            )))}
          </tbody>
        </table>
      </ScrollTable>
      <ul class="fbullets">
        {localise(lo.left.adv > 0 && <li>{rich("{v0} {v1} pp with “{v2}”, {v3} pp with “{v4}”.", { v0: (<b>{rich("The size of the effect varies {v0}:", { v0: (fold(hi.left.adv / lo.left.adv)) })}</b>), v1: (sgn(lo.left.adv)), v2: (lo.label), v3: (sgn(hi.left.adv)), v4: (hi.label) })}</li>)}
        {localise(queuesOnly && base && <li>{rich("{v0} If arriving groups judged only the queues, not the seating, the gap in leaving would be {v1} pp{v2} instead of {v3} pp{v4}{v5}. How groups judge the hall is a key assumption. The broader study above also tests search visibility and combinations of rules.", { v0: (<b>{trText("How much comes from the view at the door.")}</b>), v1: (sgn(queuesOnly.left.adv)), v2: (bracket(queuesOnly.left.lo, queuesOnly.left.hi, 1)), v3: (sgn(base.left.adv)), v4: (straddlesZero(queuesOnly.left.lo, queuesOnly.left.hi) ? ': no clear difference' : ''), v5: (queuesOnly.peakUtilPct.lo > 0 ? trText("; reservation would still cost {v0} pp of peak seat use", { v0: (num(queuesOnly.peakUtilPct.adv, 1)) }) : '') })}</li>)}
        {localise(rf && <li>{rich("{v0} mostly big groups ({v1}), stalls at {v2} seconds per person and equally popular, slower tray walking and {v3} m visibility. Leaving rises from {v4}% to {v5}%, and reservation wins {v6} of {v7} lunches.", { v0: (<b>{localise(rfClosest ? 'Relative to free flow’s own leaving, reservation comes closest with the Reservation-friendly settings:' : 'The Reservation-friendly settings:')}</b>), v1: (list(mix.map((x, i) => `${Math.round((100 * x) / mixSum)}% ${trText(sizes[i])}`))), v2: (num(rfCfg.stalls.serviceMean, 0)), v3: (num(rfCfg.search.visibility, 0)), v4: (num(rf.left.b, 1)), v5: (num(rf.left.a, 1)), v6: (rf.left.L), v7: (m.n) })}</li>)}
      </ul>
    </Section>
  );
}

function Limits({ m, onScreenIsLunch1 }: { m: FindingsModel; onScreenIsLunch1: boolean }) {
  return (
    <Section id="limits" title={trText("Limitations")}>
      <ul class="fbullets">
        <li>{rich("{v0} Each group's patience is drawn, not measured; a group judges the queues and the whole hall at a glance; one member searches for a table; nobody waits beside diners who are about to leave; strangers never move a reservation object; and nobody reserves before arriving. Some rules favour reservation (groups circle {v1} minutes before splitting; groupmates with food wait at their stall), others favour free flow (shortest routes; searchers see every table within {v2} m; a table with an object looks fully taken from the door). {v3}", { v0: (<b>{trText("This is a model, not a measurement.")}</b>), v1: (num(CFG.search.splitAfter / 60, 0)), v2: (num(CFG.search.visibility, 0)), v3: (<button type="button" class="linklike" onClick={() => openDrawer('assumptions')}>{trText("See all assumptions")}</button>) })}</li>
        <li>{rich("{v0} To guard against that bias, reservation's real benefit is modelled (a group with a claimed table always has a seat waiting and walks straight to it with food), the headline measures were fixed before any results were seen, and one set of settings is built to favour reservation. The rules changed once, when the owner pointed out that food comes on plates that cannot be taken away (model 2); the new rules, settings and headline measures were written down, and a check of free flow alone passed, before any comparison was run. The rules still deserve checking against a real canteen.", { v0: (<b>{trText("The study set out to test a belief that free flow is better.")}</b>) })}</li>
        <li>{rich("{v0} The original figures and export allow about {v1} such comparisons (the batch charts alone show {v2}), with further exploratory comparisons in the sensitivity study above; among so many, a few could look real by chance. The original comparison of 100% against 0% on the four headline measures was chosen in advance{v3}. That does not establish the accuracy of the behaviour rules.", { v0: (<b>{trText("The 95% ranges cover chance only.")}</b>), v1: (m.comparisons), v2: (m.chartIntervals), v3: (m.allFourAt100 ? trText(", and free flow won all four in all {v0} lunches at the defaults", { v0: (m.n) }) : '') })}</li>
        <li>{rich("{v0} {v1} has free-flow leaving of {v2}%, the {v3} highest of {v4}. There, 50% reserving adds {v5} pp, against {v6} pp on average. In {v7} of the {v8} lunches, 100% reserving had fewer people leaving than 75%.", { v0: (<b>{trText("Single lunches are noisy.")}</b>), v1: (onScreenIsLunch1 ? 'The lunch the app plays on screen' : 'Lunch 1 of the evidence (the one the app plays with the default settings and seed)'), v2: (num(m.lunch1.leftB, 1)), v3: (ordinal(m.lunch1.rank)), v4: (m.n), v5: (num(m.lunch1.gap50, 1)), v6: (num(m.lunch1.meanGap50, 1)), v7: (m.lunches100BelowAt75), v8: (m.n) })}</li>
        <li>{rich("{v0} Food cannot be taken away, so nobody who leaves buys anything.", { v0: (<b>{trText("Someone who leaves is a lost meal, not only a lost seat.")}</b>) })}</li>
      </ul>
    </Section>
  );
}

function CsvGuide() {
  return (
    <Section id="csv" title={trText("Reading a CSV export")}>
      <ul class="fbullets">
        <li>{rich("Three comment lines (title; model, build and export time; the settings as JSON), a header row, then {v0} rows (one per lunch and level) and {v1} rows (one per lunch and level above 0%).", { v0: (<code>run</code>), v1: (<code>pair</code>) })}</li>
        <li>{rich("{v0} rows hold three of the four headline measures, times, seat-time shares, reservation counts and results by group size ({v1}…{v2}). Peak seat use needs both versions of a lunch, so it is on {v3} rows ({v4} = reservation, {v5} = free flow).", { v0: (<code>run</code>), v1: (<code>bySize_s1</code>), v2: (<code>bySize_s6</code>), v3: (<code>pair</code>), v4: (<code>pair_p3Level</code>), v5: (<code>pair_p3Baseline</code>) })}</li>
        <li>{rich("{v0} is the share of groups reserving (0 = free flow). {v1} generates a lunch's crowd and {v2} numbers the lunches; {v3} fingerprints a simulation so a replay can be checked.", { v0: (<code>reserveFraction</code>), v1: (<code>seed</code>), v2: (<code>seedIndex</code>), v3: (<code>runHash</code>) })}</li>
        <li>{rich("Cohort columns read {v0}: {v1} reservers, {v2} the rest, {v3} and {v4} reservers who did and did not get a table; {v5} is measured in the reservation version, {v6} on the same groups in the free-flow version.", { v0: (<code>pair_cohort&lt;name&gt;_&lt;side&gt;_&lt;measure&gt;</code>), v1: (<code>R</code>), v2: (<code>N</code>), v3: (<code>Rclaimed</code>), v4: (<code>Rfallback</code>), v5: (<code>level</code>), v6: (<code>baseline</code>) })}</li>
        <li>{rich("Blank cells are expected: pair columns on run rows and the reverse, {v0} and {v1} in a reservation sweep, claim search time at 0%, and cohort {v2} at 100%. The file holds raw values; the batch panel computes the gaps.", { v0: (<code>sweepSetting</code>), v1: (<code>sweepValue</code>), v2: (<code>N</code>) })}</li>
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
      <p class="flead">{rich("In this model, at the default settings, letting groups reserve tables makes the canteen worse on {v0}. When every group reserves, {v1}% of the people who come to lunch leave without eating instead of {v2}%, and fewer leave under free flow in {v3} lunches.{v4}", { v0: (c.worseAt100 ? 'all four headline measures' : 'most headline measures'), v1: (num(all.leftPct, 1)), v2: (num(b.leftPct, 1)), v3: (c.leftAllLunches100 ? trText("all {v0}", { v0: (m.n) }) : trText("{v0} of the {v1}", { v0: (all.left!.W), v1: (m.n) })), v4: (c.dependsOnDoorView ? ' The difference comes from groups turning round at the door, where tables with an object make the hall look full.' : '') })}</p>
      <p class="fscope muted">{rich("From the built-in evidence and findings data: the default settings, {v0} lunches at each of 0, 25, 50, 75 and 100% of groups reserving (model version {v1}). {v2}", { v0: (m.n), v1: (EVIDENCE.model), v2: (!settingsMatch && <>{rich("Your current settings differ from the defaults, so your lunches may behave differently. {v0}", { v0: (<button type="button" class="linklike" onClick={() => openDrawer('batch')}>{trText("Test your settings in Batch runs")}</button>) })}</>) })}</p>
      {localise(stale && <p class="warn-text">{trText("These findings were computed for another model version and may be out of date.")}</p>)}
      <nav class="sensitivity-actions findings-nav" aria-label={trText("Findings sections")}>
        {localise(([['f-sensitivity', 'Explore assumptions'], ['f-research', 'Investigate visibility'], ['f-short', 'Read default results']] as const).map(([id, label]) =>
          <button type="button" key={id} onClick={() => { const target = document.getElementById(id); target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: 'start' }); }}>{localise(label)}</button>))}
      </nav>
      <SensitivityExplorer />
      <ResearchExplorer />
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
