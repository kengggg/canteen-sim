import { localise, msg as trText, rich } from '../i18n';
import { LanguagePicker } from './language';
import { useState } from 'preact/hooks';
import { PRESETS } from '../config/presets';
import { cloneConfig } from '../config/meta';
import { defaultConfig } from '../config/schema';
import { SPEEDS } from './controller';
import { hasDefaultSettings } from './evidence';
import { comparisonEstimate } from './story-model';
import { clock, num, parseClock } from './format';
import { APP_TITLE, ARIA, MSG } from './labels';
import {
  applied, batchRunning, controller, drawer, evidenceOpen, howto, openDrawer, pending, playing, restart, skipProgress, speed, theme, tick, toggleDrawer,
} from './store';

export function togglePlay(): void {
  if (controller.bothDone || batchRunning.value) return;
  controller.playing = !controller.playing;
  playing.value = controller.playing;
}

function Skip() {
  const cfg = applied.value;
  const [value, setValue] = useState('12:30');
  void tick.value;
  const job = controller.skip;
  const busy = job !== null && !job.done;
  const go = () => {
    const m = parseClock(value);
    if (m === null) return;
    controller.skipTo((m - cfg.crowd.windowStart) * 60_000 >= 0 ? (m - cfg.crowd.windowStart) * 60_000 : 0);
    skipProgress.value = 0;
    tick.value++;
  };
  return (
    <div class="skip" role="group" aria-label={trText("Skip to")}>
      <label for="skip-to" class="sr-only">{trText("Skip to time")}</label>
      {localise(busy ? (
        <>
          <span class="num muted">{rich("Skipping… {v0}%", { v0: (Math.round((job!.progress || 0) * 100)) })}</span>
          <button type="button" onClick={() => { job!.cancel(); tick.value++; }}>{trText("Cancel")}</button>
        </>
      ) : (
        <>
          <input id="skip-to" class="num" inputMode="numeric" size={5} value={value} onInput={(e) => setValue((e.target as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } }} />
          <button type="button" onClick={go}>{trText("Skip to")}</button>
        </>
      ))}
    </div>
  );
}

const THEME_NEXT = { system: 'light', light: 'dark', dark: 'system' } as const;

export function TopBar() {
  void tick.value;
  const cfg = applied.value;
  const evidence = comparisonEstimate(cfg);
  const fraction = Math.round(cfg.reserve.percentA * 100);
  return (
    <header class="topbar">
      <div class="topbar-row">
        <h2 class="brand">{localise(APP_TITLE)}</h2>
        <LanguagePicker />
        <label class="preset" for="preset">
          <span class="sr-only">{trText("Scenario")}</span>
          <select
            id="preset"
            value={PRESETS.find((p) => { const c = defaultConfig(); p.apply(c); c.seed = pending.value.seed; return JSON.stringify(c) === JSON.stringify(pending.value); })?.id ?? ''}
            onChange={(e) => {
              const p = PRESETS.find((x) => x.id === (e.target as HTMLSelectElement).value);
              if (!p) return;
              const c = defaultConfig();
              p.apply(c);
              c.seed = pending.value.seed;
              pending.value = cloneConfig(c);
            }}
          >
            <option value="" disabled>{trText("Custom settings")}</option>
            {localise(PRESETS.map((p) => <option key={p.id} value={p.id} title={trText((p.help))}>{localise(p.label)}</option>))}
          </select>
        </label>
        <div class="transport">
          <button type="button" class="primary" aria-label={trText((playing.value ? ARIA.pause : ARIA.play))} onClick={togglePlay} disabled={controller.bothDone || batchRunning.value}>
            {localise(playing.value ? '❚❚ Pause' : '▶ Play')}
          </button>
          <button type="button" onClick={restart}>{trText("Restart")}</button>
          <label for="speed" class="speed">
            <span class="sr-only">{trText("Speed")}</span>
            <select id="speed" value={speed.value} onChange={(e) => { speed.value = Number((e.target as HTMLSelectElement).value); controller.speed = speed.value; }}>
              {localise(SPEEDS.map((s) => <option key={s} value={s}>{localise(s)}×</option>))}
            </select>
          </label>
          <span class="clock num" aria-live="off">{localise(clock(cfg.crowd.windowStart, controller.tickNow))}</span>
          {localise(controller.runningAt !== null && <span class="running muted">{localise(MSG.runningAt(controller.runningAt))}</span>)}
          <Skip />
        </div>
        <nav class="tools" aria-label={trText("Panels")}>
          <button type="button" onClick={() => toggleDrawer('findings')} aria-pressed={drawer.value === 'findings'}>{trText("Findings")}</button>
          <button type="button" onClick={() => toggleDrawer('assumptions')} aria-pressed={drawer.value === 'assumptions'}>{trText("Assumptions")}</button>
          <button type="button" aria-label={trText((ARIA.settings))} title={trText((ARIA.settings))} onClick={() => toggleDrawer('settings')} aria-pressed={drawer.value === 'settings'}>⚙</button>
          <button type="button" aria-label={trText((ARIA.batch))} title={trText((ARIA.batch))} onClick={() => toggleDrawer('batch')} aria-pressed={drawer.value === 'batch'}>📊</button>
          <button type="button" aria-label={trText((ARIA.howto))} title={trText((ARIA.howto))} onClick={() => (howto.value = true)}>?</button>
          <button type="button" aria-label={trText((trText("Theme: {v0}", { v0: theme.value })))} title={trText((trText("Theme: {v0}", { v0: (theme.value) })))} onClick={() => (theme.value = THEME_NEXT[theme.value])}>◐</button>
        </nav>
      </div>
      <p class="evidence-line">
        {localise(evidence
          ? <>{rich("{v0} {v1}% left without eating in A, {v2}% in B. ", { v0: (<b>{rich("{v0}-lunch model estimate · {v1}% reserving:", { v0: (evidence.n), v1: (fraction) })}</b>), v1: (num(evidence.left.a, 1)), v2: (num(evidence.left.b, 1)) })}</>
          : <><b>{rich("Live comparison · {v0}% reserving:", { v0: (fraction) })}</b> {localise(fraction === 0 ? 'Both canteens use free flow. ' : 'No built-in estimate for these settings. ')}</>)}
        <button type="button" class="linklike" onClick={() => { evidenceOpen.value = hasDefaultSettings(cfg); openDrawer('batch'); }}>{trText("Compare lunches")}</button>
      </p>
    </header>
  );
}
