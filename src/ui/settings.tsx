import { noticeText } from './notice-text';
import { localise, msg as trText, rich } from '../i18n';
import { useEffect, useRef, useState } from 'preact/hooks';
import { clampConfig } from '../config/clamp';
import { exportJson, importJson, applyValues } from '../config/load';
import { META, getSetting, setSetting, type SettingMeta } from '../config/meta';
import type { Config } from '../config/schema';
import { encodeHash, parseShared, settingsCode } from '../config/url';
import { dnormcdf } from '../sim/dmath';
import { canDownload, saveText } from './download';
import { num } from './format';
import { MSG } from './labels';
import { copyText, dirty, editPending, focusSetting, note, pending, restart, storage, validation } from './store';

const GROUPS = ['Crowd', 'Reservation', 'Stalls', 'Eating', 'Leaving', 'Movement & search', 'Tray return', 'Layout'] as const;
const pad2 = (n: number) => (n < 10 ? '0' : '') + n;
const toHHMM = (m: number) => `${pad2(Math.floor(m / 60) % 24)}:${pad2(m % 60)}`;

/** Load readout (spec §9.2, UI only). */
export function loadReadout(c: Config): { arrivals: number; stalls: number; seats: number } {
  const T = c.crowd.windowEnd - c.crowd.windowStart;
  const mu = c.crowd.peakTime - c.crowd.windowStart;
  const sig = c.crowd.peakSpread / 60;
  const a = Math.max(0, mu - 30), b = Math.min(T, mu + 30);
  const span = dnormcdf((T - mu) / sig) - dnormcdf(-mu / sig);
  const p = c.crowd.peakShare;
  const arrivals = b > a ? (c.crowd.totalPeople * (p * (dnormcdf((b - mu) / sig) - dnormcdf((a - mu) / sig)) / span + (1 - p) * (b - a) / T)) / (b - a) : 0;
  const k = c.layout.seatsPerSide;
  return {
    arrivals,
    stalls: c.layout.stallCount / (c.stalls.serviceMean / 60),
    seats: (2 * k * c.layout.cols * c.layout.rows) / (c.eat.mean / 60 + c.eat.linger / 60 + 0.1),
  };
}

export function LoadReadout({ cfg }: { cfg: Config }) {
  const r = loadReadout(cfg);
  return (
    <dl class="readout">
      <div><dt>{trText("Peak-hour arrivals")}</dt><dd class="num">{rich("{v0}/min", { v0: (num(r.arrivals, 1)) })}</dd></div>
      <div><dt>{trText("Stall capacity")}</dt><dd class="num">{rich("{v0}/min", { v0: (num(r.stalls, 1)) })}</dd></div>
      <div title={trText("Upper bound: ignores waiting for the slowest groupmate, holds and table fragmentation")}><dt>{trText("Seat turnover (upper bound)")}</dt><dd class="num">{rich("{v0}/min", { v0: (num(r.seats, 1)) })}</dd></div>
    </dl>
  );
}

function Control({ m }: { m: SettingMeta }) {
  const c = pending.value;
  const v = getSetting(c, m.id);
  const set = (x: unknown) => editPending((cc) => { setSetting(cc, m.id, x as never); clampConfig(cc); });
  const id = `set-${m.id.replace('.', '-')}`;
  if (m.type === 'bool') return <input id={id} type="checkbox" checked={v as boolean} onChange={(e) => set((e.target as HTMLInputElement).checked)} />;
  if (m.type === 'enum') {
    return (
      <select id={id} value={v as string} onChange={(e) => set((e.target as HTMLSelectElement).value)}>
        {localise(m.options!.map((o) => <option key={o} value={o}>{localise(o === 'oneClaimer' ? 'One member reserves' : 'The whole group reserves together')}</option>))}
      </select>
    );
  }
  if (m.type === 'time') {
    return <input id={id} type="time" step={300} value={toHHMM(v as number)} onChange={(e) => { const [h, mi] = (e.target as HTMLInputElement).value.split(':').map(Number); set(h * 60 + mi); }} />;
  }
  if (m.type === 'mix6') {
    const mix = v as number[];
    const total = mix.reduce((a, b) => a + b, 0);
    const mean = total > 0 ? mix.reduce((a, w, i) => a + w * (i + 1), 0) / total : 0;
    return (
      <div class="mix" id={id}>
        {localise(mix.map((w, i) => (
          <label key={i} for={`${id}-${i}`}>
            <span class="muted">{localise(i + 1)}</span>
            <input id={`${id}-${i}`} type="number" min={0} max={100} step={1} value={w} onChange={(e) => { const nx = [...mix]; nx[i] = Number((e.target as HTMLInputElement).value); set(nx); }} />
          </label>
        )))}
        <span class="muted num">{rich("mean size {v0}", { v0: (num(mean, 2)) })}</span>
      </div>
    );
  }
  const f = m.uiFactor;
  const uiStep = Math.round(m.step * f * 1e6) / 1e6;
  return (
    <span class="numctl">
      <input
        id={id}
        type="number"
        min={Math.round(m.min * f * 1e6) / 1e6}
        max={m.id === 'reserve.shareMinEmpty' ? 2 * c.layout.seatsPerSide : Math.round(m.max * f * 1e6) / 1e6}
        step={uiStep}
        value={Math.round((v as number) * f * 1e6) / 1e6}
        onChange={(e) => set(Number((e.target as HTMLInputElement).value) / f)}
      />
      <span class="muted">{localise(m.uiUnit)}</span>
      {localise(m.id === 'seed' && <button type="button" onClick={() => set(Math.floor(Math.random() * 4294967296))}>{trText("New seed")}</button>)}
    </span>
  );
}

function Sharing() {
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  const [scenarioName, setScenarioName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);
  const saved = (() => { try { return JSON.parse(storage.get('canteen-sim:scenarios') ?? '{}') as Record<string, string>; } catch { return {}; } })();
  const storageOk = storage.set('canteen-sim:probe', '1');
  const copy = async (text: string) => {
    if (await copyText(text)) { setMsg(MSG.copied); setShown(null); } else { setMsg(MSG.copyFailed); setShown(text); }
  };
  const saveScenario = () => {
    if (!scenarioName.trim()) return;
    storage.set('canteen-sim:scenarios', JSON.stringify({ ...saved, [scenarioName.trim()]: settingsCode(pending.value) }));
    setScenarioName('');
    bump();
  };
  const inViewer = typeof (globalThis as { claude?: unknown }).claude !== 'undefined';
  const load = () => {
    const d = parseShared(code);
    if (!d.ok) { setErr(MSG.badCode); return; }
    const r = applyValues(d.values, d.model);
    pending.value = r.cfg;
    setErr(null);
    for (const n of r.notices) note(n);
    if (r.modelNotice) note(() => MSG.modelNotice(r.modelNotice!.from, r.modelNotice!.to));
  };
  const download = async (name: string, text: string, type: string) => {
    const m = await saveText(name, text, type);
    if (m) setMsg(m);
  };
  return (
    <section class="share" aria-label={trText("Share and save")}>
      <h3 class="eyebrow">{trText("Share and save")}</h3>
      <div class="row">
        <button type="button" onClick={() => copy(settingsCode(pending.value))}>{trText("Copy settings code")}</button>
        {localise(!inViewer && <button type="button" onClick={() => copy(location.href.split('#')[0] + encodeHash(pending.value))}>{trText("Copy link")}</button>)}
      </div>
      <div class="row">
        <label for="load-code" class="sr-only">{trText("Settings code or link")}</label>
        <input id="load-code" placeholder={trText("Paste a settings code or link")} value={code} onInput={(e) => setCode((e.target as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); load(); } }} />
        <button type="button" onClick={load}>{trText("Load")}</button>
      </div>
      {localise(err && <p class="error-text" role="alert">{localise(err)}</p>)}
      <div class="row">
        {localise(canDownload.value && <button type="button" onClick={() => download('canteen-sim-settings.json', exportJson(pending.value), 'application/json')}>{trText("Download JSON")}</button>)}
        <button type="button" onClick={() => copy(exportJson(pending.value))}>{trText("Copy JSON")}</button>
        <label class="filebtn" for="import-json">{rich("Import JSON{v0}", { v0: (<input id="import-json" type="file" accept="application/json,.json" onChange={async (e) => {
            const f = (e.target as HTMLInputElement).files?.[0];
            if (!f) return;
            const r = importJson(await f.text());
            if ('error' in r) { setErr(MSG.badJson); return; }
            setErr(null);
            pending.value = r.cfg;
            for (const n of r.notices) note(n);
            if (r.modelNotice) note(() => MSG.modelNotice(r.modelNotice!.from, r.modelNotice!.to));
          }} />) })}</label>
      </div>
      {localise(msg && <p class="muted" role="status">{localise(msg)}</p>)}
      {localise(shown && <textarea class="copybox" readOnly value={shown} onFocus={(e) => (e.target as HTMLTextAreaElement).select()} />)}
      <h3 class="eyebrow">{trText("Saved scenarios")}</h3>
      {localise(storageOk ? (
        <>
          <div class="row">
            <label for="scenario-name" class="sr-only">{trText("Scenario name")}</label>
            <input id="scenario-name" placeholder={trText("Name this scenario")} value={scenarioName} onInput={(e) => setScenarioName((e.target as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveScenario(); } }} />
            <button type="button" onClick={saveScenario}>{trText("Save")}</button>
          </div>
          <ul class="scenarios">
            {localise(Object.entries(saved).map(([name, c]) => (
              <li key={name}>
                <span>{name}</span>
                <button type="button" onClick={() => { const d = parseShared(c); if (d.ok) pending.value = applyValues(d.values, d.model).cfg; }}>{trText("Load")}</button>
                <button type="button" onClick={() => { const n = { ...saved }; delete n[name]; storage.set('canteen-sim:scenarios', JSON.stringify(n)); bump(); }}>{trText("Delete")}</button>
              </li>
            )))}
          </ul>
        </>
      ) : (
        <p class="muted">{localise(MSG.storageOff)}</p>
      ))}
    </section>
  );
}

export function SettingsPanel() {
  const ref = useRef<HTMLDivElement>(null);
  const v = validation.value;
  const byId = new Map<string, { kind: 'block' | 'warn'; message: string; code: string }[]>();
  for (const b of v.blocking) for (const s of b.settings) byId.set(s, [...(byId.get(s) ?? []), { kind: 'block', message: b.message, code: b.code }]);
  for (const w of v.warnings) for (const s of w.settings) byId.set(s, [...(byId.get(s) ?? []), { kind: 'warn', message: w.message, code: w.code }]);
  useEffect(() => {
    const id = focusSetting.value;
    if (!id) return;
    const el = ref.current?.querySelector(`[data-setting="${id}"]`);
    el?.scrollIntoView({ block: 'center' });
    (el?.querySelector('input,select') as HTMLElement | null)?.focus();
  }, [focusSetting.value]);
  const fixMix = () => editPending((c) => {
    const k2 = 2 * c.layout.seatsPerSide;
    const mix = [...c.crowd.groupMix] as Config['crowd']['groupMix'];
    for (let s = k2 + 1; s <= 6; s++) { mix[k2 - 1] += mix[s - 1]; mix[s - 1] = 0; }
    c.crowd.groupMix = mix;
  });
  return (
    <div class="settings" ref={ref}>
      <LoadReadout cfg={pending.value} />
      {localise(v.blocking.length > 0 && (
        <div class="blocking" role="alert">
          {localise(v.blocking.map((b) => (
            <p key={b.code}>
              {noticeText(b.message)}{localise(' ')}
              {localise(b.code === 'groupTooBig' && <button type="button" onClick={fixMix}>{trText("Move those shares onto the largest size that fits")}</button>)}
            </p>
          )))}
        </div>
      ))}
      {localise(GROUPS.map((g) => (
        <fieldset key={g} class="setgroup">
          <legend>{localise(g)}</legend>
          {localise(META.filter((m) => m.group === g).map((m) => (
            <div class={`setting ${focusSetting.value === m.id ? 'focus' : ''}`} key={m.id} data-setting={m.id}>
              <label for={`set-${m.id.replace('.', '-')}`} class="setting-label">{localise(m.label)}</label>
              <Control m={m} />
              <p class="setting-help muted">{localise(m.help)}</p>
              {localise((byId.get(m.id) ?? []).map((x) => <p key={x.code} class={x.kind === 'block' ? 'error-text' : 'warn-text'}>{noticeText(x.message)}</p>))}
            </div>
          )))}
        </fieldset>
      )))}
      <Sharing />
      {localise(dirty.value && <button type="button" class="primary sticky-apply" onClick={restart} disabled={v.blocking.length > 0}>{trText("Restart to apply")}</button>)}
    </div>
  );
}
