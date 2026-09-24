import { useEffect, useRef, useState } from 'preact/hooks';
import type uPlot from 'uplot';
import { CATALOG, METRIC_BY_ID, PRIMARY, type MetricDef } from '../batch/catalog';
import { toCsv } from '../batch/csv';
import type { BatchResult, MetricStat } from '../batch/runner';
import { SEED_COUNTS, SWEEPABLE, reservationJobs, sensitivityJobs } from '../batch/sweep';
import { fmt, fmtNonZero, sentence } from '../batch/wording';
import { META_BY_ID } from '../config/meta';
import { defaultConfig } from '../config/schema';
import { validate } from '../config/validate';
import { MODEL_VERSION } from '../sim/version';
import { batch, cancelBatch, perRunMs, startBatch, workerCount } from './batchrun';
import { diffChart } from './charts';
import { canDownload, saveText } from './download';
import { EVIDENCE, evidenceBatch } from './evidence';
import { num } from './format';
import { CHART_CAPTION, MSG } from './labels';
import { LoadReadout } from './settings';
import { applied, copyText, evidenceOpen } from './store';

const pctLabel = (f: number) => `${Math.round(f * 100)}%`;

function levelsOf(r: BatchResult): number[] {
  return [...new Set(r.levels.filter((l) => l.fraction > 0).map((l) => (r.kind === 'reservation' ? l.fraction : l.value!)))].sort((a, b) => a - b);
}

function statAt(r: BatchResult, metricId: string, x: number): MetricStat | undefined {
  return r.stats.find((s) => s.metricId === metricId && (r.kind === 'reservation' ? s.fraction === x : s.value === x));
}

function Interval({ s, m }: { s: MetricStat; m: MetricDef }) {
  const a = s.adv;
  const u = m.unit === '%' ? 'pp' : m.unit;
  if (a.mean === null) return <span class="muted">—</span>;
  if (a.allZero) return <span>identical in all {a.nUsed} lunches</span>;
  if (a.allEqual) return <span class="num">{fmt(a.mean, m)} {u} (the same in every lunch)</span>;
  if (a.halfWidth === null) return <span class="num">{fmt(a.mean, m)} {u} (n = {a.nUsed}, too few for an interval)</span>;
  return <span class="num">{fmt(a.mean, m)} {u} ± {fmtNonZero(a.halfWidth, m)} (n = {a.nUsed}){a.mostlyTies ? ' · mostly ties — interval approximate' : ''}</span>;
}

function PrimaryCards({ r, at }: { r: BatchResult; at: number }) {
  return (
    <div class="cards">
      {PRIMARY.map((m) => {
        const s = statAt(r, m.id, at);
        if (!s) return null;
        const w = s.wins;
        return (
          <article class="card" key={m.id}>
            <header><span class="eyebrow">Primary</span><h3>{m.label}</h3></header>
            <p class="card-sentence">{sentence(m, s.fraction, s.adv, w, r.kind === 'sensitivity' ? `At ${fmtSetting(r.setting!, s.value!)}` : undefined)}</p>
            <p class="card-ci">Free-flow advantage: <Interval s={s} m={m} /></p>
            {w && <p class="card-wins muted">Free flow better in {w.W} · tied in {w.T} · reservation better in {w.L} (of {w.n})</p>}
            <p class="card-means muted num">A {s.meanA === null ? '—' : fmt(s.meanA, m)} · B {s.meanB === null ? '—' : fmt(s.meanB, m)} {m.unit}</p>
          </article>
        );
      })}
    </div>
  );
}

function fmtSetting(id: string, v: number): string {
  const m = META_BY_ID.get(id)!;
  return `${m.label} = ${num(v * m.uiFactor, 2).replace(/\.?0+$/, '')} ${m.uiUnit}`.trim();
}

function DiffChart({ r, m }: { r: BatchResult; m: MetricDef }) {
  const el = useRef<HTMLDivElement>(null);
  const [table, setTable] = useState(false);
  const xs = levelsOf(r);
  const pts = (r.kind === 'reservation' ? [0, ...xs] : xs).map((x) => {
    if (r.kind === 'reservation' && x === 0) return { x, mean: 0, lo: 0, hi: 0, s: null as MetricStat | null };
    const s = statAt(r, m.id, x)!;
    const k = m.scale;
    return { x, s, mean: s.adv.mean === null ? null : s.adv.mean * k, lo: s.adv.lo === null ? null : s.adv.lo * k, hi: s.adv.hi === null ? null : s.adv.hi * k };
  });
  useEffect(() => {
    if (!el.current || table) return;
    let u: uPlot | null = diffChart(el.current, pts.map((p) => (r.kind === 'reservation' ? p.x * 100 : p.x * (META_BY_ID.get(r.setting!)?.uiFactor ?? 1))), pts.map((p) => p.mean), pts.map((p) => p.lo), pts.map((p) => p.hi), (v) => (r.kind === 'reservation' ? `${v}%` : num(v, 2).replace(/\.?0+$/, '')), m.unit === '%' ? 'pp' : m.unit);
    return () => { u?.destroy(); u = null; };
  }, [r, m.id, table]);
  return (
    <figure class="diff">
      <figcaption>
        <b>{m.label}</b> <span class="eyebrow">{m.cls}</span>
        <button type="button" class="linklike" onClick={() => setTable(!table)} aria-pressed={table}>{table ? 'Show chart' : 'Show table'}</button>
      </figcaption>
      {table ? (
        <table class="data">
          <thead><tr><th scope="col">{r.kind === 'reservation' ? 'Reserve level' : 'Value'}</th><th scope="col">Mean advantage</th><th scope="col">95% CI</th><th scope="col">W / T / L</th></tr></thead>
          <tbody>
            {pts.map((p) => (
              <tr key={p.x}>
                <th scope="row">{r.kind === 'reservation' ? pctLabel(p.x) : fmtSetting(r.setting!, p.x)}</th>
                <td class="num">{p.s ? (p.mean === null ? '—' : num(p.mean, 2)) : 'baseline'}</td>
                <td class="num">{p.lo === null || !p.s ? '—' : `${num(p.lo, 2)} to ${num(p.hi, 2)}`}</td>
                <td class="num">{p.s?.wins ? `${p.s.wins.W} / ${p.s.wins.T} / ${p.s.wins.L}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div ref={el} class="chart" role="img" aria-label={`Free-flow advantage in ${m.label} by ${r.kind === 'reservation' ? 'reserve level' : 'setting value'}`} />
      )}
    </figure>
  );
}

function Breakdowns({ r, at }: { r: BatchResult; at: number }) {
  const cohorts = [['R', 'Reservers (claimed or fell back)'], ['Rclaimed', 'Reservers who claimed a table'], ['Rfallback', 'Reservers who fell back'], ['N', 'Everyone else']] as const;
  const m = METRIC_BY_ID.get('walkAwayPct')!, e = METRIC_BY_ID.get('entranceToSeatMeanMin')!;
  const cell = (s: { adv: { mean: number | null; halfWidth: number | null } } | undefined, d: MetricDef) =>
    !s || s.adv.mean === null ? '—' : `${fmt(s.adv.mean, d)}${s.adv.halfWidth === null ? '' : ` ± ${fmtNonZero(s.adv.halfWidth, d)}`}`;
  const lv = (s: { fraction: number; value: number | null }) => (r.kind === 'reservation' ? s.fraction === at : s.value === at);
  return (
    <div class="breakdowns">
      <div class="table-scroll">
        <table class="data">
          <caption>Group size · free-flow advantage at {r.kind === 'reservation' ? pctLabel(at) : fmtSetting(r.setting!, at)}</caption>
          <thead><tr><th scope="col">Size</th><th scope="col">Walk-aways (pp)</th><th scope="col">Entrance to seat (min)</th><th scope="col">Food to seat (min)</th></tr></thead>
          <tbody>
            {[1, 2, 3, 4, 5, 6].map((size) => (
              <tr key={size}>
                <th scope="row">{size}</th>
                <td class="num">{cell(r.sizeStats.find((s) => s.size === size && s.metric === 'walkAwayPct' && lv(s)), m)}</td>
                <td class="num">{cell(r.sizeStats.find((s) => s.size === size && s.metric === 'entranceToSeatMeanMin' && lv(s)), e)}</td>
                <td class="num">{cell(r.sizeStats.find((s) => s.size === size && s.metric === 'foodToSeatMeanMin' && lv(s)), e)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div class="table-scroll">
        <table class="data">
          <caption>Reserver cohorts · A − B (positive = free flow better)</caption>
          <thead><tr><th scope="col">Cohort</th><th scope="col">Walk-aways (pp)</th><th scope="col">Entrance to seat, mean (min)</th><th scope="col">median</th><th scope="col">p90</th><th scope="col">Food to seat, mean (min)</th></tr></thead>
          <tbody>
            {cohorts.map(([id, label]) => {
              const get = (metric: string) => r.cohortStats.find((s) => s.cohort === id && s.metric === metric && lv(s));
              return (
                <tr key={id}>
                  <th scope="row">{label}</th>
                  <td class="num">{cell(get('walkAwayPct'), m)}</td>
                  <td class="num">{cell(get('entranceToSeatMeanMin'), e)}</td>
                  <td class="num">{cell(get('entranceToSeatMedianMin'), e)}</td>
                  <td class="num">{cell(get('entranceToSeatP90Min'), e)}</td>
                  <td class="num">{cell(get('foodToSeatMeanMin'), e)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div class="table-scroll">
        <table class="data">
          <caption>Diagnostics (no better direction) · mean over lunches</caption>
          <thead><tr><th scope="col">Metric</th><th scope="col">A</th><th scope="col">B</th></tr></thead>
          <tbody>
            {CATALOG.filter((d) => d.cls === 'diagnostic').map((d) => {
              const s = statAt(r, d.id, at);
              return <tr key={d.id}><th scope="row" title={d.help}>{d.label}</th><td class="num">{s?.meanA === null || !s ? '—' : fmt(s.meanA, d)}</td><td class="num">{s?.meanB === null || !s ? '—' : fmt(s.meanB, d)}</td></tr>;
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Csv({ r }: { r: BatchResult }) {
  const [shown, setShown] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const text = () => toCsv(r, applied.value, { model: MODEL_VERSION, sha: __BUILD_SHA__, exportedAt: new Date().toISOString() });
  return (
    <div class="csv row">
      {canDownload.value && (
        <button type="button" onClick={async () => { const m = await saveText('canteen-sim-batch.csv', text(), 'text/csv'); if (m) setMsg(m); }}>Download CSV</button>
      )}
      <button type="button" onClick={async () => { const t = text(); if (await copyText(t)) setMsg(MSG.copied); else { setMsg(MSG.copyFailed); setShown(t); } }}>Copy CSV</button>
      {msg && <span class="muted" role="status">{msg}</span>}
      {shown && <textarea class="copybox" readOnly value={shown} onFocus={(e) => (e.target as HTMLTextAreaElement).select()} />}
    </div>
  );
}

function Results({ r, precomputed }: { r: BatchResult; precomputed: boolean }) {
  const xs = levelsOf(r);
  const head = r.kind === 'reservation' ? 1 : xs[xs.length - 1];
  const truncated = r.truncated.reduce((a, t) => a + t.count, 0);
  const shown = CATALOG.filter((m) => m.better !== null);
  return (
    <div class="results">
      {precomputed && <p class="precomputed">{MSG.precomputed(EVIDENCE.model)}</p>}
      {truncated > 0 && <p class="warn-text">{truncated} of {r.runs.length} runs truncated; their seeds are dropped from the statistics.</p>}
      <h3 class="section-title">{r.kind === 'reservation' ? 'Primary endpoints at 100% vs 0% reservation' : `Primary endpoints by ${META_BY_ID.get(r.setting!)?.label}`}</h3>
      <PrimaryCards r={r} at={head} />
      {r.kind === 'reservation' && (
        <>
          <h3 class="section-title">At 50% reservation (the live default)</h3>
          <ul class="sentences">
            {PRIMARY.map((m) => { const s = statAt(r, m.id, 0.5); return s ? <li key={m.id}>{sentence(m, 0.5, s.adv, s.wins)}</li> : null; })}
          </ul>
        </>
      )}
      <p class="caption muted">{CHART_CAPTION} Showing {shown.length * xs.length} intervals, uncorrected.</p>
      <div class="diffs">
        {shown.map((m) => <DiffChart key={m.id} r={r} m={m} />)}
      </div>
      <Breakdowns r={r} at={head} />
      <Csv r={r} />
    </div>
  );
}

export function BatchPanel() {
  const b = batch.value;
  const cfg = applied.value;
  const isDefault = JSON.stringify({ ...cfg, seed: 1 }) === JSON.stringify(defaultConfig()) && cfg.seed === 1;
  const [kind, setKind] = useState<'reservation' | 'sensitivity'>('reservation');
  const [n, setN] = useState(30);
  const [setting, setSettingId] = useState('stalls.serviceMean');
  const [values, setValues] = useState('0.75, 1, 1.5, 2');
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<string | null>(null);
  const meta = META_BY_ID.get(setting)!;
  const jobsCount = kind === 'reservation' ? 5 * n : values.split(',').filter((s) => s.trim()).length * 2 * n;
  const est = perRunMs.value ?? 450 * (cfg.crowd.totalPeople / 1800);
  const estS = Math.ceil((jobsCount * est) / 1000 / workerCount());

  const run = async () => {
    setError(null);
    setCheck(null);
    evidenceOpen.value = false;
    if (kind === 'reservation') {
      await startBatch('reservation', reservationJobs(cfg, n), null);
      return;
    }
    const vs = values.split(',').map((s) => Number(s.trim()) / meta.uiFactor).filter((x) => Number.isFinite(x));
    const r = sensitivityJobs(cfg, n, setting, vs.map((x) => Math.round(x * 1e6) / 1e6));
    if ('error' in r) { setError(r.error); return; }
    if (r.warnings.length) setError(r.warnings.join(' '));
    await startBatch('sensitivity', r.jobs, setting);
  };
  const recheck = async () => {
    const res = await startBatch('reservation', reservationJobs(defaultConfig(), 30), null);
    if (!res) return;
    const mismatches = res.runs.filter((x) => EVIDENCE.runs.find((e) => e.k === x.key)?.h !== x.hash);
    setCheck(mismatches.length === 0 ? MSG.allMatch(res.runs.length) : `${mismatches.length} of ${res.runs.length} runs differ: ${mismatches.slice(0, 5).map((x) => x.key).join(', ')}`);
    evidenceOpen.value = false;
  };

  const showEvidence = (evidenceOpen.value || b.status === 'idle') && isDefault && !b.result;
  const warnings = validate(cfg).warnings;
  return (
    <div class="batch">
      <p class="muted">{MSG.batchSource(cfg.seed)}</p>
      {warnings.length > 0 && <ul class="warn-text">{warnings.map((w) => <li key={w.code}>{w.message}</li>)}</ul>}
      <LoadReadout cfg={cfg} />
      <form class="picker" onSubmit={(e) => { e.preventDefault(); run(); }}>
        <fieldset>
          <legend class="eyebrow">Sweep</legend>
          <label for="kind-res"><input id="kind-res" type="radio" name="kind" checked={kind === 'reservation'} onChange={() => setKind('reservation')} /> Reservation sweep (0, 25, 50, 75, 100%)</label>
          <label for="kind-sens"><input id="kind-sens" type="radio" name="kind" checked={kind === 'sensitivity'} onChange={() => setKind('sensitivity')} /> Sensitivity sweep</label>
          {kind === 'sensitivity' && (
            <div class="sens">
              <label for="sens-setting">Setting
                <select id="sens-setting" value={setting} onChange={(e) => setSettingId((e.target as HTMLSelectElement).value)}>
                  {SWEEPABLE.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </label>
              <label for="sens-values">Values ({meta.uiUnit || 'number'}, 3–6, comma-separated)
                <input id="sens-values" value={values} onInput={(e) => setValues((e.target as HTMLInputElement).value)} />
              </label>
              <button type="button" class="linklike" onClick={() => { setSettingId('stalls.serviceMean'); setValues('0.75, 1, 1.5, 2'); }}>Service time 0.75–2 min</button>
            </div>
          )}
          <label for="seed-count">Lunches per level
            <select id="seed-count" value={n} onChange={(e) => setN(Number((e.target as HTMLSelectElement).value))}>
              {SEED_COUNTS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </fieldset>
        <p class="muted num">{jobsCount} runs · about {estS < 90 ? `${estS} s` : `${Math.ceil(estS / 60)} min`} on {workerCount()} worker{workerCount() === 1 ? '' : 's'}</p>
        {b.status === 'running' ? (
          <div class="progress-row">
            <progress max={b.total} value={b.done} aria-label="Batch progress" />
            <span class="num">{b.done} / {b.total}{b.executor ? ` · ${b.executor}` : ''}{b.done > 0 ? ` · ${Math.ceil(((performance.now() - b.startedAt) / b.done) * (b.total - b.done) / 1000)} s left` : ''}</span>
            <button type="button" onClick={cancelBatch}>Cancel</button>
          </div>
        ) : (
          <button type="submit" class="primary">Run batch</button>
        )}
      </form>
      {error && <p class="error-text" role="alert">{error}</p>}
      {b.status === 'failed' && <p class="error-text" role="alert">{b.message}</p>}
      {check && <p class="precomputed" role="status">{check}</p>}
      {showEvidence ? (
        <>
          <button type="button" onClick={recheck} disabled={b.status === 'running'}>Re-run on this device to check</button>
          <Results r={evidenceBatch()} precomputed />
        </>
      ) : b.result ? (
        <Results r={b.result} precomputed={false} />
      ) : (
        b.status !== 'running' && <p class="muted">Run a batch to compare many paired lunches.</p>
      )}
    </div>
  );
}
