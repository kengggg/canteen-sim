import { localise, msg as trText, rich } from '../i18n';
import { useState } from 'preact/hooks';
import { leavingConclusion, type StudyStat } from '../batch/sensitivity-data';
import { scenarioConfig, STUDY_PLAN, type StudyFraction } from '../batch/sensitivity-plan';
import { ScrollTable } from './findcharts';
import { bracket, sgn } from './findings-text';
import { num } from './format';
import { SENSITIVITY, sensitivityCurrent, studyCaseLabel, studyRow } from './sensitivity-model';
import { applied, batchRunning, controller, drawer, howto, pending, playing, restart } from './store';

const digits = (s: StudyStat) => [s.lo, s.hi].some((v) => v !== null && v !== 0 && Math.abs(v) < 0.005) ? 3 : 2;
const interval = (s: StudyStat) => s.lo === null || s.hi === null ? 'No interval' : trText("{v0} to {v1}", { v0: (sgn(s.lo, digits(s))), v1: (sgn(s.hi, digits(s))) });

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
    <h3 id="f-sensitivity" tabIndex={-1}>{trText("What changes the result?")}</h3>
    <p>{rich("Explore {v0} settings, including combinations of assumptions. Each compares {v1} simulated lunches with the same crowd in both canteens. These are stress tests of Model {v2}; the ranges have not been checked against real diners.", { v0: (SENSITIVITY.scenarios), v1: (SENSITIVITY.n), v2: (SENSITIVITY.model) })}</p>
    {localise(!sensitivityCurrent ? <p class="warn-text">{trText("The sensitivity study needs updating for this model. Its estimates are hidden until it is rerun.")}</p> : <>
      <div class="sensitivity-controls">
        <label>{rich("Assumption to explore{v0}", { v0: (<select value={familyId} onChange={(e) => {
            const next = STUDY_PLAN.families.find((f) => f.id === e.currentTarget.value)!;
            setFamily(next.id);
            if (!next.scenarios.includes(scenarioId)) setScenario(next.scenarios.includes('default') ? 'default' : next.scenarios[0]);
          }}>{localise(STUDY_PLAN.families.map((f) => <option key={f.id} value={f.id}>{localise(f.label)}</option>))}</select>) })}</label>
        <label>{rich("Groups reserving in A{v0}", { v0: (<select value={fraction} onChange={(e) => setFraction(Number(e.currentTarget.value) as StudyFraction)}>
            <option value={0.5}>{trText("50% reserve")}</option><option value={1}>{trText("100% reserve")}</option>
          </select>) })}</label>
      </div>
      <p>{localise(family.explanation)}</p>
      <p class="muted">{trText("Choose a setting for all four measures. Every change is reservation minus free flow. “+” in leaving means more people leave without eating.")}</p>
      <p class="muted table-hint">{trText("Scroll tables sideways to see all columns.")}</p>
      <ScrollTable label={trText("Changes in leaving across the selected assumptions")}>
        <table class="data sensitivity-cases">
          <thead><tr><th scope="col">{trText("Setting")}</th><th scope="col">{rich("Change per 100 diners{v0}{v1}", { v0: (<br />), v1: (<span class="muted">{trText("Mean [95% interval]")}</span>) })}</th></tr></thead>
          <tbody>{localise(family.scenarios.map((id) => {
            const s = STUDY_PLAN.scenarios.find((s) => s.id === id)!;
            const left = studyRow(id, fraction)?.metrics.leftPct;
            return <tr key={id}><th scope="row"><button type="button" aria-pressed={id === scenarioId} onClick={() => setScenario(id)}>{localise(studyCaseLabel(familyId, s))}</button></th><td class="num">{localise(left?.delta !== null && left?.delta !== undefined ? <>{localise(sgn(left.delta, 2))}{localise(bracket(left.lo, left.hi, digits(left), true))}</> : 'Unavailable')}</td></tr>;
          }))}</tbody>
        </table>
      </ScrollTable>
      {localise(row && <div class="sensitivity-detail">
        <div aria-live="polite" aria-atomic="true">
          <h4>{rich("{v0} · {v1}% reserve", { v0: (studyCaseLabel(familyId, scenario)), v1: (fraction * 100) })}</h4>
          <p>{rich("{v0} {v1} out of 100 leave under free flow; {v2} with reservation.", { v0: (<b>{localise(leavingConclusion(row.metrics.leftPct))}.</b>), v1: (num(row.metrics.leftPct.b!, 1)), v2: (num(row.metrics.leftPct.a!, 1)) })}</p>
        </div>
        <ScrollTable label={trText("All four measures for the selected setting")}>
          <table class="data">
            <thead><tr><th scope="col">{trText("Measure")}</th><th scope="col">{trText("Change")}</th><th scope="col">{trText("95% interval")}</th></tr></thead>
            <tbody>{localise(([
              ['leftPct', 'Leaving without eating', 'pp'],
              ['plateSeconds', 'Time carrying food', 's'],
              ['seatUsePct', 'Peak seat use', 'pp'],
              ['throughput', 'Peak throughput', 'people/h'],
            ] as const).map(([key, label, unit]) => <tr key={key}><th scope="row">{localise(label)}</th><td class="num">{localise(row.metrics[key].delta === null ? 'Unavailable' : `${sgn(row.metrics[key].delta!, 2)} ${trText(unit)}`)}</td><td class="num">{localise(interval(row.metrics[key]))}</td></tr>))}</tbody>
          </table>
        </ScrollTable>
        <p class="muted">{rich("pp = percentage points. Lower leaving and food-carrying time are preferable; higher seat use and throughput are preferable. Each measure uses {v0} complete pairs. Across many exploratory tests, small apparent differences can occur by chance.", { v0: (SENSITIVITY.n) })}</p>
        <button type="button" class="primary" disabled={batchRunning.value} onClick={watch}>{trText("Watch this setting")}</button>
        <p class="muted">{rich("Loads this setting, keeps your seed, and restarts both canteens. The animation is one lunch; the estimate above averages {v0}.", { v0: (SENSITIVITY.n) })}</p>
      </div>)}
      <details>
        <summary>{trText("What these comparisons can tell us")}</summary>
        <p>{trText("The intervals describe variation across simulated lunches with fixed rules. They do not cover uncertainty about behaviour, model accuracy, or the chosen test ranges. These are many exploratory comparisons with unadjusted intervals; small apparent advantages can occur by chance. An interval crossing zero means no clear difference, not proof of equal outcomes.")}</p>
        <p>{trText("The tested settings are a selected set, not a representative sample of canteens. Seeing every table within a distance, treating reserved tables as fully taken, and several other rules remain fixed. Wider tests can reveal dependence on assumptions; they cannot establish which rule is true.")}</p>
      </details>
    </>)}
  </section>;
}
