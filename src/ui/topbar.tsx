import { useState } from 'preact/hooks';
import { PRESETS } from '../config/presets';
import { cloneConfig } from '../config/meta';
import { defaultConfig } from '../config/schema';
import { SPEEDS } from './controller';
import { evidenceSentence } from './evidence';
import { clock, parseClock } from './format';
import { APP_TITLE, ARIA, MSG } from './labels';
import {
  applied, batchRunning, controller, drawer, evidenceOpen, howto, pending, playing, restart, skipProgress, speed, theme, tick,
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
    <div class="skip" role="group" aria-label="Skip to">
      <label for="skip-to" class="sr-only">Skip to time</label>
      {busy ? (
        <>
          <span class="num muted">Skipping… {Math.round((job!.progress || 0) * 100)}%</span>
          <button type="button" onClick={() => { job!.cancel(); tick.value++; }}>Cancel</button>
        </>
      ) : (
        <>
          <input id="skip-to" class="num" inputMode="numeric" size={5} value={value} onInput={(e) => setValue((e.target as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } }} />
          <button type="button" onClick={go}>Skip to</button>
        </>
      )}
    </div>
  );
}

const THEME_NEXT = { system: 'light', light: 'dark', dark: 'system' } as const;

export function TopBar() {
  void tick.value;
  const cfg = applied.value;
  const isDefault = JSON.stringify({ ...cfg, seed: 1 }) === JSON.stringify(defaultConfig()) && cfg.seed === 1;
  const evidence = isDefault ? evidenceSentence() : null;
  return (
    <header class="topbar">
      <div class="topbar-row">
        <h1 class="brand">{APP_TITLE}</h1>
        <label class="preset" for="preset">
          <span class="sr-only">Scenario</span>
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
            <option value="" disabled>Custom settings</option>
            {PRESETS.map((p) => <option key={p.id} value={p.id} title={p.help}>{p.label}</option>)}
          </select>
        </label>
        <div class="transport">
          <button type="button" class="primary" aria-label={playing.value ? ARIA.pause : ARIA.play} onClick={togglePlay} disabled={controller.bothDone || batchRunning.value}>
            {playing.value ? '❚❚ Pause' : '▶ Play'}
          </button>
          <button type="button" onClick={restart}>Restart</button>
          <label for="speed" class="speed">
            <span class="sr-only">Speed</span>
            <select id="speed" value={speed.value} onChange={(e) => { speed.value = Number((e.target as HTMLSelectElement).value); controller.speed = speed.value; }}>
              {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
            </select>
          </label>
          <span class="clock num" aria-live="off">{clock(cfg.crowd.windowStart, controller.tickNow)}</span>
          {controller.runningAt !== null && <span class="running muted">{MSG.runningAt(controller.runningAt)}</span>}
          <Skip />
        </div>
        <nav class="tools" aria-label="Panels">
          <button type="button" onClick={() => (drawer.value = drawer.value === 'findings' ? null : 'findings')} aria-pressed={drawer.value === 'findings'}>Findings</button>
          <button type="button" onClick={() => (drawer.value = drawer.value === 'assumptions' ? null : 'assumptions')} aria-pressed={drawer.value === 'assumptions'}>Assumptions</button>
          <button type="button" aria-label={ARIA.settings} title={ARIA.settings} onClick={() => (drawer.value = drawer.value === 'settings' ? null : 'settings')} aria-pressed={drawer.value === 'settings'}>⚙</button>
          <button type="button" aria-label={ARIA.batch} title={ARIA.batch} onClick={() => (drawer.value = drawer.value === 'batch' ? null : 'batch')} aria-pressed={drawer.value === 'batch'}>📊</button>
          <button type="button" aria-label={ARIA.howto} title={ARIA.howto} onClick={() => (howto.value = true)}>?</button>
          <button type="button" aria-label={`${ARIA.theme}: ${theme.value}`} title={`Theme: ${theme.value}`} onClick={() => (theme.value = THEME_NEXT[theme.value])}>◐</button>
        </nav>
      </div>
      {evidence && (
        <button type="button" class="evidence-line" onClick={() => { evidenceOpen.value = true; drawer.value = 'batch'; }}>
          <span class="eyebrow">Evidence (30 lunches)</span> {evidence}
        </button>
      )}
    </header>
  );
}
