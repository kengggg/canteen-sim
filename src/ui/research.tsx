import { useState } from 'preact/hooks';
import protocol from '../../docs/research-protocol.md?raw';
import report from '../../docs/studies/visibility-roles-v1.md?raw';
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
const interval = (s: StudyStat) => s.lo === null || s.hi === null ? 'No interval' : `${sgn(s.lo, 3)} to ${sgn(s.hi, 3)}`;

export function ResearchExplorer() {
  const [door, setDoor] = useState(3);
  const [fraction, setFraction] = useState(1);
  const [choice, setChoice] = useState('claim20-food20');
  const [message, setMessage] = useState<string | null>(null);
  const [copyFallback, setCopyFallback] = useState<string | null>(null);
  const row = RESEARCH.rows.find((r) => r.id === `door${door}-${choice}` && r.fraction === fraction)!;
  const claimer = RESEARCH.contrasts.find((r) => r.id === `claimer-door${door}-food10` && r.fraction === fraction)?.metrics.leftPct;
  const food = RESEARCH.contrasts.find((r) => r.id === `food-door${door}-claim10` && r.fraction === fraction)?.metrics.leftPct;
  const copy = async (body: string, name: string) => {
    const ok = await copyText(body);
    setCopyFallback(ok ? null : body);
    setMessage(ok ? `${name} copied.` : 'Copy the document from the text box below.');
  };
  return <section class="fsection sensitivity research" aria-labelledby="f-research">
    <h3 id="f-research" tabIndex={-1}>Why does seeing farther change the result?</h3>
    <p class="research-label">Separate experiment · Visibility roles v1</p>
    <p>In Model 2, one setting changes how far both table claimers and people carrying food can see. Here we change each role separately, using {RESEARCH.n} fresh simulated lunches per comparison. A claimer looks for a table before buying food; a food-searcher looks for a seat after buying it.</p>
    <p><b>This is simulation research.</b> It explains behaviour inside the model. It has not been checked against real canteen data.</p>
    {!researchCurrent ? <p class="warn-text">This experiment needs updating. Its results are hidden until the model and research plan agree.</p> : <>
      <div class="sensitivity-controls">
        <label>Door rule in this experiment<select value={door} onChange={(e) => setDoor(Number(e.currentTarget.value))}>
          <option value={3}>Judge queues and seating</option><option value={0}>Judge queues only</option>
        </select></label>
        <label>Reservation in this experiment<select value={fraction} onChange={(e) => setFraction(Number(e.currentTarget.value))}>
          <option value={0.5}>50% reserve</option><option value={1}>100% reserve</option>
        </select></label>
      </div>
      <p>The leaving gap is how many more people out of 100 leave with reservation than under free flow. Change one role from 10 to 20 metres while the other stays at 10: widening the claimer’s view changes this gap by <b>{sgn(claimer!.mean!, 2)} pp</b>{bracket(claimer!.lo, claimer!.hi, 2)}, and widening the food-searcher’s view changes it by <b>{sgn(food!.mean!, 2)} pp</b>{bracket(food!.lo, food!.hi, 2)}. Positive means more extra leaving under reservation.</p>
      <p class="research-takeaway"><b>{claimer!.lo! > 0
        ? food!.lo! > 0 ? 'Both role changes increase the leaving gap here; the claimer change has the larger estimate.' : 'Only widening the claimer’s view shows a clear increase in the leaving gap here.'
        : 'Neither role change shows a clear change in leaving with this door rule.'}</b> Compare the other outcomes below before judging whether reservation helps.</p>
      <p class="muted table-hint">Scroll tables sideways to see all columns.</p>
      <ScrollTable label="Leaving under separate visibility roles">
        <table class="data sensitivity-cases research-cases">
          <thead><tr><th scope="col">Who can see farther?</th><th scope="col">Reservation − free flow<br /><span class="muted">Leaving, pp [95% interval]</span></th></tr></thead>
          <tbody>{options.map((option) => {
            const m = RESEARCH.rows.find((r) => r.id === `door${door}-${option.id}` && r.fraction === fraction)!.metrics.leftPct;
            return <tr key={option.id}><th scope="row"><button type="button" aria-pressed={choice === option.id} onClick={() => setChoice(option.id)}>{option.label}</button></th><td class="num">{sgn(m.delta!, 2)}{bracket(m.lo, m.hi, 3, true)}</td></tr>;
          })}</tbody>
        </table>
      </ScrollTable>
      <div class="sensitivity-detail research-detail">
        <div aria-live="polite" aria-atomic="true">
          <h4>{options.find((o) => o.id === choice)!.label} · {fraction * 100}% reserve · {door === 3 ? 'queues and seating' : 'queues only'}</h4>
          <p><b>{leavingConclusion(row.metrics.leftPct)}.</b> Out of 100 arrivals, {num(row.metrics.leftPct.a!, 1)} leave with reservation and {num(row.metrics.leftPct.b!, 1)} under free flow.</p>
        </div>
        <ScrollTable label="All four outcomes in the role experiment">
          <table class="data"><thead><tr><th scope="col">Measure</th><th scope="col">Change</th><th scope="col">95% interval</th></tr></thead>
            <tbody>{([
              ['leftPct', 'Leaving without eating', 'pp'], ['plateSeconds', 'Time carrying food', 's'],
              ['seatUsePct', 'Peak seat use', 'pp'], ['throughput', 'Peak throughput', 'people/h'],
            ] as const).map(([key, label, unit]) => <tr key={key}><th scope="row">{label}</th><td class="num">{sgn(row.metrics[key].delta!, 2)} {unit}</td><td class="num">{interval(row.metrics[key])}</td></tr>)}</tbody>
          </table>
        </ScrollTable>
        <p class="muted">Every change is reservation minus free flow. Lower leaving and food-carrying time are preferable; higher seat use and throughput are preferable. pp = percentage points.</p>
        <p>Door leaving changes by <b>{sgn(row.metrics.doorLeftPct.delta!, 2)} pp</b>; queue leaving by <b>{sgn(row.metrics.queueLeftPct.delta!, 2)} pp</b>. Fewer people giving up in queues can mean fewer people entered in the first place.</p>
        <p>Among reserving groups that enter, {num(row.diagnostics.a.claimSuccessPct!, 1)}% get a table. This is an average across lunches. Successful reservation is an intermediate outcome, not a measure of how well the whole canteen performs.</p>
      </div>
      <p class="muted">The animation and its built-in estimates use Model 2. These separate role rules are research comparisons only. The full report includes all 16 comparisons, all 28 planned contrasts, and all four outcomes; no single overall winner is calculated.</p>
      <details><summary>How to interpret this experiment</summary>
        <p>The 95% intervals cover variation across 30 simulated lunches, not uncertainty about real behaviour. They are unadjusted across many exploratory comparisons. An interval crossing zero does not establish equal outcomes. The two canteens may serve different people, so a shorter average time carrying food does not mean every diner benefits.</p>
        <p>The follow-up was chosen after seeing Model 2’s visibility results, then its full grid was fixed before running fresh seeds. Routing, sharing, patience and other rules stay the same. Giving up a reservation attempt resets table memory, as in Model 2. Distances are assumptions, and people can see every table within their radius.</p>
      </details>
    </>}
    <details class="research-guide"><summary>Research protocol and complete results</summary>
      <p>The research asks when and why reservation helps or harms the whole canteen. There is no real pilot or participant study. The protocol records hypotheses, factors, measures, limits and reproduction steps; the report includes the complete experiment.</p>
      <div class="sensitivity-actions">
        {canDownload.value && <button type="button" onClick={async () => setMessage(await saveText('canteen-research-protocol.md', protocol, 'text/markdown'))}>Download research protocol</button>}
        <button type="button" onClick={() => copy(protocol, 'Research protocol')}>Copy research protocol</button>
        {researchCurrent && <>
          {canDownload.value && <button type="button" onClick={async () => setMessage(await saveText('canteen-visibility-roles-v1.md', report, 'text/markdown'))}>Download complete results</button>}
          <button type="button" onClick={() => copy(report, 'Complete results')}>Copy complete results</button>
        </>}
      </div>
      {message && <p role="status">{message}</p>}
      {copyFallback && <textarea class="copybox" aria-label="Research document to copy" readOnly value={copyFallback} onFocus={(e) => e.currentTarget.select()} />}
    </details>
  </section>;
}
