import { useState } from 'preact/hooks';
import { leavingConclusion, type StudyStat } from '../batch/sensitivity-data';
import { scenarioConfig, STUDY_PLAN, type StudyFraction } from '../batch/sensitivity-plan';
import { ScrollTable } from './findcharts';
import { bracket, sgn } from './findings-text';
import { num } from './format';
import { SENSITIVITY, sensitivityCurrent, studyCaseLabel, studyRow } from './sensitivity-model';
import { applied, batchRunning, controller, drawer, howto, pending, playing, restart } from './store';

const digits = (s: StudyStat) => [s.lo, s.hi].some((v) => v !== null && v !== 0 && Math.abs(v) < 0.005) ? 3 : 2;
const interval = (s: StudyStat) => s.lo === null || s.hi === null ? 'No interval' : `${sgn(s.lo, digits(s))} to ${sgn(s.hi, digits(s))}`;

export function SensitivityExplorer() {
  const [familyId, setFamily] = useState('visibility');
  const [scenarioId, setScenario] = useState('default');
  const [fraction, setFraction] = useState<StudyFraction>(1);
  const family = STUDY_PLAN.families.find((f) => f.id === familyId)!;
  const scenario = STUDY_PLAN.scenarios.find((s) => s.id === scenarioId)!;
  const row = studyRow(scenarioId, fraction);
  const watch = () => {
    const cfg = scenarioConfig(scenario);
    cfg.seed = applied.value.seed;
    cfg.reserve.percentA = fraction;
    pending.value = cfg;
    drawer.value = null;
    howto.value = false;
    restart();
    controller.playing = true;
    playing.value = true;
    requestAnimationFrame(() => {
      const stage = document.getElementById('simulation');
      stage?.focus({ preventScroll: true });
      stage?.scrollIntoView({ block: 'start' });
    });
  };
  return <section class="fsection sensitivity" aria-labelledby="f-sensitivity">
    <h3 id="f-sensitivity" tabIndex={-1}>What changes the result?</h3>
    <p>Explore {SENSITIVITY.scenarios} settings, including combinations of assumptions. Each compares {SENSITIVITY.n} simulated lunches with the same crowd in both canteens. These are stress tests of Model {SENSITIVITY.model}; the ranges have not been checked against real diners.</p>
    {!sensitivityCurrent ? <p class="warn-text">The sensitivity study needs updating for this model. Its estimates are hidden until it is rerun.</p> : <>
      <div class="sensitivity-controls">
        <label>Assumption to explore
          <select value={familyId} onChange={(e) => {
            const next = STUDY_PLAN.families.find((f) => f.id === e.currentTarget.value)!;
            setFamily(next.id);
            if (!next.scenarios.includes(scenarioId)) setScenario(next.scenarios.includes('default') ? 'default' : next.scenarios[0]);
          }}>{STUDY_PLAN.families.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}</select>
        </label>
        <label>Groups reserving in A
          <select value={fraction} onChange={(e) => setFraction(Number(e.currentTarget.value) as StudyFraction)}>
            <option value={0.5}>50% reserve</option><option value={1}>100% reserve</option>
          </select>
        </label>
      </div>
      <p>{family.explanation}</p>
      <p class="muted">Choose a setting for all four measures. Every change is reservation minus free flow. “+” in leaving means more people leave without eating.</p>
      <p class="muted table-hint">Scroll tables sideways to see all columns.</p>
      <ScrollTable label="Changes in leaving across the selected assumptions">
        <table class="data sensitivity-cases">
          <thead><tr><th scope="col">Setting</th><th scope="col">Change per 100 diners<br /><span class="muted">Mean [95% interval]</span></th></tr></thead>
          <tbody>{family.scenarios.map((id) => {
            const s = STUDY_PLAN.scenarios.find((s) => s.id === id)!;
            const left = studyRow(id, fraction)?.metrics.leftPct;
            return <tr key={id}><th scope="row"><button type="button" aria-pressed={id === scenarioId} onClick={() => setScenario(id)}>{studyCaseLabel(familyId, s)}</button></th><td class="num">{left?.delta !== null && left?.delta !== undefined ? <>{sgn(left.delta, 2)}{bracket(left.lo, left.hi, digits(left), true)}</> : 'Unavailable'}</td></tr>;
          })}</tbody>
        </table>
      </ScrollTable>
      {row && <div class="sensitivity-detail">
        <div aria-live="polite" aria-atomic="true">
          <h4>{studyCaseLabel(familyId, scenario)} · {fraction * 100}% reserve</h4>
          <p><b>{leavingConclusion(row.metrics.leftPct)}.</b> {num(row.metrics.leftPct.b!, 1)} out of 100 leave under free flow; {num(row.metrics.leftPct.a!, 1)} with reservation.</p>
        </div>
        <ScrollTable label="All four measures for the selected setting">
          <table class="data">
            <thead><tr><th scope="col">Measure</th><th scope="col">Change</th><th scope="col">95% interval</th></tr></thead>
            <tbody>{([
              ['leftPct', 'Leaving without eating', 'pp'],
              ['plateSeconds', 'Time carrying food', 's'],
              ['seatUsePct', 'Peak seat use', 'pp'],
              ['throughput', 'Peak throughput', 'people/h'],
            ] as const).map(([key, label, unit]) => <tr key={key}><th scope="row">{label}</th><td class="num">{row.metrics[key].delta === null ? 'Unavailable' : `${sgn(row.metrics[key].delta!, 2)} ${unit}`}</td><td class="num">{interval(row.metrics[key])}</td></tr>)}</tbody>
          </table>
        </ScrollTable>
        <p class="muted">pp = percentage points. Lower leaving and food-carrying time are preferable; higher seat use and throughput are preferable. Each measure uses {SENSITIVITY.n} complete pairs. Across many exploratory tests, small apparent differences can occur by chance.</p>
        <button type="button" class="primary" disabled={batchRunning.value} onClick={watch}>Watch this setting</button>
        <p class="muted">Loads this setting, keeps your seed, and restarts both canteens. The animation is one lunch; the estimate above averages {SENSITIVITY.n}.</p>
      </div>}
      <details>
        <summary>What these comparisons can tell us</summary>
        <p>The intervals describe variation across simulated lunches with fixed rules. They do not cover uncertainty about behaviour, model accuracy, or the chosen test ranges. These are many exploratory comparisons with unadjusted intervals; small apparent advantages can occur by chance. An interval crossing zero means no clear difference, not proof of equal outcomes.</p>
        <p>The tested settings are a selected set, not a representative sample of canteens. Seeing every table within a distance, treating reserved tables as fully taken, and several other rules remain fixed. Wider tests can reveal dependence on assumptions; they cannot establish which rule is true.</p>
      </details>
    </>}
  </section>;
}
