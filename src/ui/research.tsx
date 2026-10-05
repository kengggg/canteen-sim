import { language, localise, msg as trText, rich } from '../i18n';
import { useEffect, useState } from 'preact/hooks';
import { researchDocuments } from './research-documents';
import { leavingConclusion, type StudyStat } from '../batch/sensitivity-data';
import { canDownload, saveText } from './download';
import { ScrollTable } from './findcharts';
import { bracket, sgn } from './findings-text';
import { num } from './format';
import { RESEARCH, researchCurrent } from './research-model';
import { copyText } from './store';

const options = [
  { id: 'claim10-food10', label: 'Both see 10 m (control)' },
  { id: 'claim20-food10', label: 'Only claimers see 20 m' },
  { id: 'claim10-food20', label: 'Only food-searchers see 20 m' },
  { id: 'claim20-food20', label: 'Both see 20 m' },
];
const interval = (s: StudyStat) => s.lo === null || s.hi === null ? 'No interval' : trText("{v0} to {v1}", { v0: (sgn(s.lo, 3)), v1: (sgn(s.hi, 3)) });

export function ResearchExplorer() {
  const { protocol, report, protocolFilename, reportFilename } = researchDocuments(language.value);
  const [door, setDoor] = useState(3);
  const [fraction, setFraction] = useState(1);
  const [choice, setChoice] = useState('claim20-food20');
  const [message, setMessage] = useState<string | null>(null);
  const [copyFallback, setCopyFallback] = useState<'protocol' | 'report' | null>(null);
  useEffect(() => { setMessage(null); }, [language.value]);
  const row = RESEARCH.rows.find((r) => r.id === `door${door}-${choice}` && r.fraction === fraction)!;
  const claimer = RESEARCH.contrasts.find((r) => r.id === `claimer-door${door}-food10` && r.fraction === fraction)?.metrics.leftPct;
  const food = RESEARCH.contrasts.find((r) => r.id === `food-door${door}-claim10` && r.fraction === fraction)?.metrics.leftPct;
  const copy = async (body: string, name: string) => {
    const ok = await copyText(body);
    setCopyFallback(ok ? null : body === protocol ? 'protocol' : 'report');
    setMessage(ok ? trText("{v0} copied.", { v0: (name) }) : 'Copy the document from the text box below.');
  };
  return <section class="fsection sensitivity research" aria-labelledby="f-research">
    <h3 id="f-research" tabIndex={-1}>{trText("Why does seeing farther change the result?")}</h3>
    <p class="research-label">{trText("Separate experiment · Visibility roles v1")}</p>
    <p>{rich("In Model 2, one setting changes how far both table claimers and people carrying food can see. Here we change each role separately, using {v0} fresh simulated lunches per comparison. A claimer looks for a table before buying food; a food-searcher looks for a seat after buying it.", { v0: (RESEARCH.n) })}</p>
    <p>{rich("{v0} It explains behaviour inside the model. It has not been checked against real canteen data.", { v0: (<b>{trText("This is simulation research.")}</b>) })}</p>
    {localise(!researchCurrent ? <p class="warn-text">{trText("This experiment needs updating. Its results are hidden until the model and research plan agree.")}</p> : <>
      <div class="sensitivity-controls">
        <label>{rich("Door rule in this experiment{v0}", { v0: (<select value={door} onChange={(e) => setDoor(Number(e.currentTarget.value))}>
          <option value={3}>{trText("Judge queues and seating")}</option><option value={0}>{trText("Judge queues only")}</option>
        </select>) })}</label>
        <label>{rich("Reservation in this experiment{v0}", { v0: (<select value={fraction} onChange={(e) => setFraction(Number(e.currentTarget.value))}>
          <option value={0.5}>{trText("50% reserve")}</option><option value={1}>{trText("100% reserve")}</option>
        </select>) })}</label>
      </div>
      <p>{rich("The leaving gap is how many more people out of 100 leave with reservation than under free flow. Change one role from 10 to 20 metres while the other stays at 10: widening the claimer’s view changes this gap by {v0}{v1}, and widening the food-searcher’s view changes it by {v2}{v3}. Positive means more extra leaving under reservation.", { v0: (<b>{rich("{v0} pp", { v0: (sgn(claimer!.mean!, 2)) })}</b>), v1: (bracket(claimer!.lo, claimer!.hi, 2)), v2: (<b>{rich("{v0} pp", { v0: (sgn(food!.mean!, 2)) })}</b>), v3: (bracket(food!.lo, food!.hi, 2)) })}</p>
      <p class="research-takeaway">{rich("{v0} Compare the other outcomes below before judging whether reservation helps.", { v0: (<b>{localise(claimer!.lo! > 0
        ? food!.lo! > 0 ? 'Both role changes increase the leaving gap here; the claimer change has the larger estimate.' : 'Only widening the claimer’s view shows a clear increase in the leaving gap here.'
        : 'Neither role change shows a clear change in leaving with this door rule.')}</b>) })}</p>
      <p class="muted table-hint">{trText("Scroll tables sideways to see all columns.")}</p>
      <ScrollTable label={trText("Leaving under separate visibility roles")}>
        <table class="data sensitivity-cases research-cases">
          <thead><tr><th scope="col">{trText("Who can see farther?")}</th><th scope="col">{rich("Reservation − free flow{v0}{v1}", { v0: (<br />), v1: (<span class="muted">{trText("Leaving, pp [95% interval]")}</span>) })}</th></tr></thead>
          <tbody>{localise(options.map((option) => {
            const m = RESEARCH.rows.find((r) => r.id === `door${door}-${option.id}` && r.fraction === fraction)!.metrics.leftPct;
            return <tr key={option.id}><th scope="row"><button type="button" aria-pressed={choice === option.id} onClick={() => setChoice(option.id)}>{localise(option.label)}</button></th><td class="num">{localise(sgn(m.delta!, 2))}{localise(bracket(m.lo, m.hi, 3, true))}</td></tr>;
          }))}</tbody>
        </table>
      </ScrollTable>
      <div class="sensitivity-detail research-detail">
        <div aria-live="polite" aria-atomic="true">
          <h4>{rich("{v0} · {v1}% reserve · {v2}", { v0: (options.find((o) => o.id === choice)!.label), v1: (fraction * 100), v2: (door === 3 ? 'queues and seating' : 'queues only') })}</h4>
          <p>{rich("{v0} Out of 100 arrivals, {v1} leave with reservation and {v2} under free flow.", { v0: (<b>{localise(leavingConclusion(row.metrics.leftPct))}.</b>), v1: (num(row.metrics.leftPct.a!, 1)), v2: (num(row.metrics.leftPct.b!, 1)) })}</p>
        </div>
        <ScrollTable label={trText("All four outcomes in the role experiment")}>
          <table class="data"><thead><tr><th scope="col">{trText("Measure")}</th><th scope="col">{trText("Change")}</th><th scope="col">{trText("95% interval")}</th></tr></thead>
            <tbody>{localise(([
              ['leftPct', 'Leaving without eating', 'pp'], ['plateSeconds', 'Time carrying food', 's'],
              ['seatUsePct', 'Peak seat use', 'pp'], ['throughput', 'Peak throughput', 'people/h'],
            ] as const).map(([key, label, unit]) => <tr key={key}><th scope="row">{localise(label)}</th><td class="num">{localise(sgn(row.metrics[key].delta!, 2))} {localise(unit)}</td><td class="num">{localise(interval(row.metrics[key]))}</td></tr>))}</tbody>
          </table>
        </ScrollTable>
        <p class="muted">{trText("Every change is reservation minus free flow. Lower leaving and food-carrying time are preferable; higher seat use and throughput are preferable. pp = percentage points.")}</p>
        <p>{rich("Door leaving changes by {v0}; queue leaving by {v1}. Fewer people giving up in queues can mean fewer people entered in the first place.", { v0: (<b>{rich("{v0} pp", { v0: (sgn(row.metrics.doorLeftPct.delta!, 2)) })}</b>), v1: (<b>{rich("{v0} pp", { v0: (sgn(row.metrics.queueLeftPct.delta!, 2)) })}</b>) })}</p>
        <p>{rich("Among reserving groups that enter, {v0}% get a table. This is an average across lunches. Successful reservation is an intermediate outcome, not a measure of how well the whole canteen performs.", { v0: (num(row.diagnostics.a.claimSuccessPct!, 1)) })}</p>
      </div>
      <p class="muted">{trText("The animation and its built-in estimates use Model 2. These separate role rules are research comparisons only. The full report includes all 16 comparisons, all 28 planned contrasts, and all four outcomes; no single overall winner is calculated.")}</p>
      <details><summary>{trText("How to interpret this experiment")}</summary>
        <p>{trText("The 95% intervals cover variation across 30 simulated lunches, not uncertainty about real behaviour. They are unadjusted across many exploratory comparisons. An interval crossing zero does not establish equal outcomes. The two canteens may serve different people, so a shorter average time carrying food does not mean every diner benefits.")}</p>
        <p>{trText("The follow-up was chosen after seeing Model 2’s visibility results, then its full grid was fixed before running fresh seeds. Routing, sharing, patience and other rules stay the same. Giving up a reservation attempt resets table memory, as in Model 2. Distances are assumptions, and people can see every table within their radius.")}</p>
      </details>
    </>)}
    <details class="research-guide"><summary>{trText("Research protocol and complete results")}</summary>
      <p>{trText("The research asks when and why reservation helps or harms the whole canteen. There is no real pilot or participant study. The protocol records hypotheses, factors, measures, limits and reproduction steps; the report includes the complete experiment.")}</p>
      <div class="sensitivity-actions">
        {localise(canDownload.value && <button type="button" onClick={async () => setMessage(await saveText(protocolFilename, protocol, 'text/markdown'))}>{trText("Download research protocol")}</button>)}
        <button type="button" onClick={() => copy(protocol, 'Research protocol')}>{trText("Copy research protocol")}</button>
        {localise(researchCurrent && <>
          {localise(canDownload.value && <button type="button" onClick={async () => setMessage(await saveText(reportFilename, report, 'text/markdown'))}>{trText("Download complete results")}</button>)}
          <button type="button" onClick={() => copy(report, 'Complete results')}>{trText("Copy complete results")}</button>
        </>)}
      </div>
      {localise(message && <p role="status">{localise(message)}</p>)}
      {localise(copyFallback && <textarea class="copybox" aria-label={trText("Research document to copy")} readOnly value={copyFallback === 'protocol' ? protocol : report} onFocus={(e) => e.currentTarget.select()} />)}
    </details>
  </section>;
}
