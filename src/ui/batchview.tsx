import { noticeText } from './notice-text';
import { language, localise, msg as trText, rich } from '../i18n';
import { useEffect, useRef, useState } from 'preact/hooks';
import type uPlot from 'uplot';
import { CATALOG, METRIC_BY_ID, PRIMARY, type MetricDef } from '../batch/catalog';
import { toCsv } from '../batch/csv';
import type { BatchResult, MetricStat } from '../batch/runner';
import { SEED_COUNTS, SWEEPABLE, reservationJobs, sensitivityJobs } from '../batch/sweep';
import { fmt, fmtNonZero, sentence } from '../batch/wording';
import { META_BY_ID } from '../config/meta';
import { defaultConfig, type Config } from '../config/schema';
import { validate } from '../config/validate';
import { MODEL_VERSION } from '../sim/version';
import { batch, cancelBatch, perRunMs, startBatch, workerCount } from './batchrun';
import { diffChart } from './charts';
import { canDownload, saveText } from './download';
import { EVIDENCE, evidenceBatch, hasDefaultSettings } from './evidence';
import { num } from './format';
import { CHART_CAPTION, MSG } from './labels';
import { LoadReadout } from './settings';
import { applied, copyText, evidenceOpen, openDrawer, themeGen } from './store';

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
  if (a.allZero) return <span>{rich("identical in all {v0} lunches", { v0: (a.nUsed) })}</span>;
  if (a.allEqual) return <span class="num">{rich("{v0} {v1} (the same in every lunch)", { v0: (fmt(a.mean, m)), v1: (u) })}</span>;
  if (a.halfWidth === null) return <span class="num">{rich("{v0} {v1} (n = {v2}, too few for an interval)", { v0: (fmt(a.mean, m)), v1: (u), v2: (a.nUsed) })}</span>;
  return <span class="num">{rich("{v0} {v1} ± {v2} (n = {v3}){v4}", { v0: (fmt(a.mean, m)), v1: (u), v2: (fmtNonZero(a.halfWidth, m)), v3: (a.nUsed), v4: (a.mostlyTies ? ' · mostly ties — interval approximate' : '') })}</span>;
}

function PrimaryCards({ r, at }: { r: BatchResult; at: number }) {
  return (
    <div class="cards">
      {localise(PRIMARY.map((m) => {
        const s = statAt(r, m.id, at);
        if (!s) return null;
        const w = s.wins;
        return (
          <article class="card" key={m.id}>
            <header><span class="eyebrow">{trText("Primary")}</span><h3>{localise(m.label)}</h3></header>
            <p class="card-sentence">{localise(sentence(m, s.fraction, s.adv, w, r.kind === 'sensitivity' ? trText("At {v0}", { v0: (fmtSetting(r.setting!, s.value!)) }) : undefined))}</p>
            <p class="card-ci">{rich("Free-flow advantage: {v0}", { v0: (<Interval s={s} m={m} />) })}</p>
            {localise(w && <p class="card-wins muted">{rich("Free flow better in {v0} · tied in {v1} · reservation better in {v2} (of {v3})", { v0: (w.W), v1: (w.T), v2: (w.L), v3: (w.n) })}</p>)}
            <p class="card-means muted num">{rich("A {v0} · B {v1} {v2}", { v0: (s.meanA === null ? '—' : fmt(s.meanA, m)), v1: (s.meanB === null ? '—' : fmt(s.meanB, m)), v2: (m.unit) })}</p>
          </article>
        );
      }))}
    </div>
  );
}

function fmtSetting(id: string, v: number): string {
  const m = META_BY_ID.get(id)!;
  return `${trText(m.label)} = ${num(v * m.uiFactor, 2).replace(/\.?0+$/, '')} ${trText(m.uiUnit)}`.trim();
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
    let u: uPlot | null = diffChart(el.current, pts.map((p) => (r.kind === 'reservation' ? p.x * 100 : p.x * (META_BY_ID.get(r.setting!)?.uiFactor ?? 1))), pts.map((p) => p.mean), pts.map((p) => p.lo), pts.map((p) => p.hi), (v) => (r.kind === 'reservation' ? `${v}%` : num(v, 2).replace(/\.?0+$/, '')), trText(m.unit === '%' ? 'pp' : m.unit));
    return () => { u?.destroy(); u = null; };
  }, [r, m.id, table, themeGen.value, language.value]);
  return (
    <figure class="diff">
      <figcaption>
        <b>{localise(m.label)}</b> <span class="eyebrow">{localise(m.cls)}</span>
        <button type="button" class="linklike" onClick={() => setTable(!table)} aria-pressed={table}>{localise(table ? 'Show chart' : 'Show table')}</button>
      </figcaption>
      {localise(table ? (
        <table class="data">
          <thead><tr><th scope="col">{localise(r.kind === 'reservation' ? 'Reserve level' : 'Value')}</th><th scope="col">{trText("Mean advantage")}</th><th scope="col">{trText("95% CI")}</th><th scope="col">{trText("W / T / L")}</th></tr></thead>
          <tbody>
            {localise(pts.map((p) => (
              <tr key={p.x}>
                <th scope="row">{localise(r.kind === 'reservation' ? pctLabel(p.x) : fmtSetting(r.setting!, p.x))}</th>
                <td class="num">{localise(p.s ? (p.mean === null ? '—' : num(p.mean, 2)) : 'baseline')}</td>
                <td class="num">{localise(p.lo === null || !p.s ? '—' : trText("{v0} to {v1}", { v0: (num(p.lo, 2)), v1: (num(p.hi, 2)) }))}</td>
                <td class="num">{localise(p.s?.wins ? `${p.s.wins.W} / ${p.s.wins.T} / ${p.s.wins.L}` : '—')}</td>
              </tr>
            )))}
          </tbody>
        </table>
      ) : (
        <div ref={el} class="chart" role="img" aria-label={trText((trText("Free-flow advantage in {v0} by {v1}", { v0: (m.label), v1: (r.kind === 'reservation' ? 'reserve level' : 'setting value') })))} />
      ))}
    </figure>
  );
}

function Breakdowns({ r, at }: { r: BatchResult; at: number }) {
  const cohorts = [['R', 'Reserving groups (all)'], ['Rclaimed', 'Reservers who claimed a table'], ['Rfallback', 'Reservers who fell back'], ['N', 'Everyone else']] as const;
  const m = METRIC_BY_ID.get('leftPct')!, e = METRIC_BY_ID.get('entranceToSeatMeanMin')!;
  const cell = (s: { adv: { mean: number | null; halfWidth: number | null } } | undefined, d: MetricDef) =>
    !s || s.adv.mean === null ? '—' : `${fmt(s.adv.mean, d)}${s.adv.halfWidth === null ? '' : ` ± ${fmtNonZero(s.adv.halfWidth, d)}`}`;
  const lv = (s: { fraction: number; value: number | null }) => (r.kind === 'reservation' ? s.fraction === at : s.value === at);
  return (
    <div class="breakdowns">
      <div class="table-scroll">
        <table class="data">
          <caption>{rich("Group size · free-flow advantage at {v0}", { v0: (r.kind === 'reservation' ? pctLabel(at) : fmtSetting(r.setting!, at)) })}</caption>
          <thead><tr><th scope="col">{trText("Size")}</th><th scope="col">{trText("Left without eating (pp)")}</th><th scope="col">{trText("Time carrying a plate (min)")}</th><th scope="col">{trText("Entrance to seat (min)")}</th></tr></thead>
          <tbody>
            {localise([1, 2, 3, 4, 5, 6].map((size) => (
              <tr key={size}>
                <th scope="row">{localise(size)}</th>
                <td class="num">{localise(cell(r.sizeStats.find((s) => s.size === size && s.metric === 'leftPct' && lv(s)), m))}</td>
                <td class="num">{localise(cell(r.sizeStats.find((s) => s.size === size && s.metric === 'plateMeanMin' && lv(s)), e))}</td>
                <td class="num">{localise(cell(r.sizeStats.find((s) => s.size === size && s.metric === 'entranceToSeatMeanMin' && lv(s)), e))}</td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
      <div class="table-scroll">
        <table class="data">
          <caption>{trText("Reserver cohorts · A − B (positive = free flow better)")}</caption>
          <thead><tr><th scope="col">{trText("Cohort")}</th><th scope="col">{trText("Left without eating (pp)")}</th><th scope="col">{trText("Time carrying a plate, mean (min)")}</th><th scope="col">{trText("Entrance to seat, mean (min)")}</th><th scope="col">{trText("median")}</th><th scope="col">{trText("p90")}</th></tr></thead>
          <tbody>
            {localise(cohorts.map(([id, label]) => {
              const get = (metric: string) => r.cohortStats.find((s) => s.cohort === id && s.metric === metric && lv(s));
              return (
                <tr key={id}>
                  <th scope="row">{localise(label)}</th>
                  <td class="num">{localise(cell(get('leftPct'), m))}</td>
                  <td class="num">{localise(cell(get('plateMeanMin'), e))}</td>
                  <td class="num">{localise(cell(get('entranceToSeatMeanMin'), e))}</td>
                  <td class="num">{localise(cell(get('entranceToSeatMedianMin'), e))}</td>
                  <td class="num">{localise(cell(get('entranceToSeatP90Min'), e))}</td>
                </tr>
              );
            }))}
          </tbody>
        </table>
      </div>
      <div class="table-scroll">
        <table class="data">
          <caption>{trText("Diagnostics (no better direction) · mean over lunches")}</caption>
          <thead><tr><th scope="col">{trText("Metric")}</th><th scope="col">{trText("A")}</th><th scope="col">{trText("B")}</th></tr></thead>
          <tbody>
            {localise(CATALOG.filter((d) => d.cls === 'diagnostic').map((d) => {
              const s = statAt(r, d.id, at);
              return <tr key={d.id}><th scope="row" title={trText((d.help))}>{localise(d.label)}</th><td class="num">{localise(s?.meanA === null || !s ? '—' : fmt(s.meanA, d))}</td><td class="num">{localise(s?.meanB === null || !s ? '—' : fmt(s.meanB, d))}</td></tr>;
            }))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Csv({ r, cfg }: { r: BatchResult; cfg: Config }) {
  const [shown, setShown] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const text = () => toCsv(r, cfg, { model: MODEL_VERSION, sha: __BUILD_SHA__, exportedAt: new Date().toISOString() });
  return (
    <div class="csv row">
      {localise(canDownload.value && (
        <button type="button" onClick={async () => { const m = await saveText('canteen-sim-batch.csv', text(), 'text/csv'); if (m) setMsg(m); }}>{trText("Download CSV")}</button>
      ))}
      <button type="button" onClick={async () => { const t = text(); if (await copyText(t)) setMsg(MSG.copied); else { setMsg(MSG.copyFailed); setShown(t); } }}>{trText("Copy CSV")}</button>
      {localise(msg && <span class="muted" role="status">{localise(msg)}</span>)}
      {localise(shown && <textarea class="copybox" readOnly value={shown} onFocus={(e) => (e.target as HTMLTextAreaElement).select()} />)}
    </div>
  );
}

function Results({ r, precomputed, cfg }: { r: BatchResult; precomputed: boolean; cfg: Config }) {
  const xs = levelsOf(r);
  const head = r.kind === 'reservation' ? 1 : xs[xs.length - 1];
  const truncated = r.truncated.reduce((a, t) => a + t.count, 0);
  const shown = CATALOG.filter((m) => m.better !== null);
  return (
    <div class="results">
      {localise(precomputed && (
        <p class="precomputed">
          {localise(MSG.precomputed(EVIDENCE.model))}{localise(' ')}
          <button type="button" class="linklike" onClick={() => openDrawer('findings')}>{trText("Read the findings")}</button>
        </p>
      ))}
      {localise(truncated > 0 && <p class="warn-text">{rich("{v0} of {v1} runs truncated; their seeds are dropped from the statistics.", { v0: (truncated), v1: (r.runs.length) })}</p>)}
      <h3 class="section-title">{localise(r.kind === 'reservation' ? 'Primary endpoints at 100% vs 0% reservation' : trText("Primary endpoints by {v0}", { v0: (META_BY_ID.get(r.setting!)!.label) }))}</h3>
      <PrimaryCards r={r} at={head} />
      {localise(r.kind === 'reservation' && (
        <>
          <h3 class="section-title">{trText("At 50% reservation (the live default)")}</h3>
          <ul class="sentences">
            {localise(PRIMARY.map((m) => { const s = statAt(r, m.id, 0.5); return s ? <li key={m.id}>{localise(sentence(m, 0.5, s.adv, s.wins))}</li> : null; }))}
          </ul>
        </>
      ))}
      <p class="caption muted">{rich("{v0} Showing {v1} intervals, uncorrected.", { v0: (CHART_CAPTION), v1: (shown.length * xs.length) })}</p>
      <div class="diffs">
        {localise(shown.map((m) => <DiffChart key={m.id} r={r} m={m} />))}
      </div>
      <Breakdowns r={r} at={head} />
      <Csv r={r} cfg={cfg} />
    </div>
  );
}

export function BatchPanel() {
  const b = batch.value;
  const cfg = applied.value;
  const isDefault = hasDefaultSettings(cfg);
  const [kind, setKind] = useState<'reservation' | 'sensitivity'>('reservation');
  const [n, setN] = useState(30);
  const [setting, setSettingId] = useState('stalls.serviceMean');
  const [values, setValues] = useState('0.75, 1, 1.5, 2');
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<{ total: number; mismatches: string[] } | null>(null);
  const meta = META_BY_ID.get(setting)!;
  const jobsCount = kind === 'reservation' ? 5 * n : values.split(',').filter((s) => s.trim()).length * 2 * n;
  const est = perRunMs.value !== null ? perRunMs.value * (cfg.crowd.totalPeople / (b.cfg?.crowd.totalPeople ?? cfg.crowd.totalPeople)) : 450 * (cfg.crowd.totalPeople / 1800);
  const estS = Math.ceil((jobsCount * est) / 1000 / workerCount());

  const run = async () => {
    setError(null);
    setCheck(null);
    evidenceOpen.value = false;
    if (kind === 'reservation') {
      await startBatch('reservation', reservationJobs(cfg, n), null, cfg);
      return;
    }
    const vs = values.split(',').map((s) => Number(s.trim()) / meta.uiFactor).filter((x) => Number.isFinite(x));
    const r = sensitivityJobs(cfg, n, setting, vs.map((x) => Math.round(x * 1e6) / 1e6));
    if ('error' in r) { setError(r.error); return; }
    if (r.warnings.length) setError(r.warnings.join(' '));
    await startBatch('sensitivity', r.jobs, setting, cfg);
  };
  const recheck = async () => {
    const res = await startBatch('reservation', reservationJobs(defaultConfig(), 30), null, defaultConfig());
    if (!res) return;
    const mismatches = res.runs.filter((x) => EVIDENCE.runs.find((e) => e.k === x.key)?.h !== x.hash);
    setCheck({ total: res.runs.length, mismatches: mismatches.map((x) => x.key) });
    evidenceOpen.value = false;
  };

  const showEvidence = (evidenceOpen.value || b.status === 'idle') && isDefault && !b.result;
  const warnings = validate(cfg).warnings;
  return (
    <div class="batch">
      <p class="muted">{localise(MSG.batchSource(cfg.seed))}</p>
      {localise(warnings.length > 0 && <ul class="warn-text">{localise(warnings.map((w) => <li key={w.code}>{noticeText(w.message)}</li>))}</ul>)}
      <LoadReadout cfg={cfg} />
      <div class="picker">
        <fieldset>
          <legend class="eyebrow">{trText("Sweep")}</legend>
          <label for="kind-res">{rich("{v0} Reservation sweep (0, 25, 50, 75, 100%)", { v0: (<input id="kind-res" type="radio" name="kind" checked={kind === 'reservation'} onChange={() => setKind('reservation')} />) })}</label>
          <label for="kind-sens">{rich("{v0} Sensitivity sweep", { v0: (<input id="kind-sens" type="radio" name="kind" checked={kind === 'sensitivity'} onChange={() => setKind('sensitivity')} />) })}</label>
          {localise(kind === 'sensitivity' && (
            <div class="sens">
              <label for="sens-setting">{rich("Setting{v0}", { v0: (<select id="sens-setting" value={setting} onChange={(e) => setSettingId((e.target as HTMLSelectElement).value)}>
                  {localise(SWEEPABLE.map((m) => <option key={m.id} value={m.id}>{localise(m.label)}</option>))}
                </select>) })}</label>
              <label for="sens-values">{rich("Values ({v0}, 3–6, comma-separated){v1}", { v0: (meta.uiUnit || 'number'), v1: (<input id="sens-values" value={values} onInput={(e) => setValues((e.target as HTMLInputElement).value)} />) })}</label>
              <button type="button" class="linklike" onClick={() => { setSettingId('stalls.serviceMean'); setValues('0.75, 1, 1.5, 2'); }}>{trText("Service time 0.75–2 min")}</button>
            </div>
          ))}
          <label for="seed-count">{rich("Lunches per level{v0}", { v0: (<select id="seed-count" value={n} onChange={(e) => setN(Number((e.target as HTMLSelectElement).value))}>
              {localise(SEED_COUNTS.map((c) => <option key={c} value={c}>{localise(c)}</option>))}
            </select>) })}</label>
        </fieldset>
        <p class="muted num">{rich("{v0} runs · about {v1} on {v2} worker{v3}", { v0: (jobsCount), v1: (estS < 90 ? trText("{v0} s", { v0: estS }) : trText("{v0} min", { v0: (Math.ceil(estS / 60)) })), v2: (workerCount()), v3: (workerCount() === 1 || language.value === 'th' ? '' : 's') })}</p>
        {localise(b.status === 'running' ? (
          <div class="progress-row">
            <progress max={b.total} value={b.done} aria-label={trText("Batch progress")} />
            <span class="num">{localise(b.done)} / {localise(b.total)}{localise(b.executor ? ` · ${b.executor === 'this tab' ? trText('this tab') : trText('{v0} workers', { v0: Number(b.executor?.split(' ')[0]) })}` : '')}{localise(b.done > 0 ? trText(" · {v0} s left", { v0: (Math.ceil(((performance.now() - b.startedAt) / b.done) * (b.total - b.done) / 1000)) }) : '')}</span>
            <button type="button" onClick={cancelBatch}>{trText("Cancel")}</button>
          </div>
        ) : (
          <button type="button" class="primary" onClick={run}>{trText("Run batch")}</button>
        ))}
      </div>
      {localise(error && <p class="error-text" role="alert">{noticeText(error)}</p>)}
      {localise(b.status === 'failed' && <p class="error-text" role="alert">{MSG.batchFailed(noticeText(b.message ?? ''))}</p>)}
      {check && <p class="precomputed" role="status">{check.mismatches.length === 0
        ? MSG.allMatch(check.total)
        : trText("{v0} of {v1} runs differ: {v2}", { v0: check.mismatches.length, v1: check.total, v2: check.mismatches.slice(0, 5).join(', ') })}</p>}
      {localise(showEvidence ? (
        <>
          <button type="button" onClick={recheck} disabled={b.status === 'running'}>{trText("Re-run on this device to check")}</button>
          <Results r={evidenceBatch()} precomputed cfg={defaultConfig()} />
        </>
      ) : b.result ? (
        <Results r={b.result} precomputed={false} cfg={b.cfg ?? cfg} />
      ) : (
        b.status !== 'running' && <p class="muted">{trText("Run a batch to compare many paired lunches.")}</p>
      ))}
    </div>
  );
}
