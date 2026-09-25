import { useEffect, useState } from 'preact/hooks';
import { MODEL_VERSION } from '../sim/version';
import { MSG } from './labels';
import { Stage } from './stage';
import { applied, controller, dirty, drawer, howto, notices, restart, theme, themeGen, tick } from './store';
import { TopBar, togglePlay } from './topbar';
import { copyText } from './store';
import { LiveStats } from './livestats';
import { BottomStrip } from './strip';
import { Drawers } from './drawers';
import { EndCard } from './endcard';
import { HowTo } from './howto';
import { HoverCard } from './hovercard';

const HOST_THEME = document.documentElement.getAttribute('data-theme');

function ErrorBanner({ err }: { err: NonNullable<typeof controller.error> }) {
  const [fallback, setFallback] = useState<string | null>(null);
  const details = `Canteen Sim error: ${err.message}\nsim ms: ${err.atMs}\nseed: ${err.seed}\nsettings code: ${err.code}`;
  return (
    <div class="banner error" role="alert">
      <span>{MSG.engineError} {err.message} (at {Math.round(err.atMs / 1000)} s, seed {err.seed}, settings code <code>{err.code}</code>)</span>
      <button type="button" onClick={async () => { if (!(await copyText(details))) setFallback(details); }}>Copy details</button>
      {fallback && <textarea class="copybox" readOnly value={fallback} onFocus={(e) => (e.target as HTMLTextAreaElement).select()} />}
    </div>
  );
}

function Banners() {
  void tick.value;
  const err = controller.error;
  return (
    <div class="banners" aria-live="polite">
      {dirty.value && (
        <div class="banner warn">
          <span>{MSG.dirty}</span>
          <button type="button" class="primary" onClick={restart}>Restart</button>
        </div>
      )}
      {err && <ErrorBanner err={err} />}
      {notices.value.map((n, i) => (
        <div class="banner info" key={i}>
          <span>{n}</span>
          <button type="button" aria-label="Dismiss" onClick={() => (notices.value = notices.value.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
    </div>
  );
}

export function App() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (howto.value) howto.value = false;
        else if (drawer.value) drawer.value = null;
        return;
      }
      if (e.code !== 'Space' || howto.value) return;
      const t = e.target as HTMLElement;
      // Space keeps its normal meaning on text fields and on buttons, links and other activatable controls.
      if (t.closest('input, textarea, select, button, a, summary, [role="button"], [contenteditable="true"]')) return;
      e.preventDefault();
      togglePlay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    // A bare #findings link opens the Findings panel (settings codes use #v=…).
    const open = () => { if (location.hash === '#findings') drawer.value = 'findings'; };
    open();
    window.addEventListener('hashchange', open);
    return () => window.removeEventListener('hashchange', open);
  }, []);
  useEffect(() => {
    // Drawers open below the top bar so its buttons stay reachable; the bar's height changes as it wraps.
    const bar = document.querySelector<HTMLElement>('.topbar');
    if (!bar) return;
    const set = () => document.documentElement.style.setProperty('--topbar-h', `${bar.getBoundingClientRect().height}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    // One theme generation for the renderer and charts: our toggle, the host's data-theme, or the OS scheme.
    const bump = () => { themeGen.value++; };
    const mo = new MutationObserver(bump);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const mq = matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', bump);
    return () => { mo.disconnect(); mq.removeEventListener('change', bump); };
  }, []);
  useEffect(() => {
    // "System" restores whatever the host page set (the artifact viewer stamps data-theme for an explicit choice).
    const root = document.documentElement;
    if (theme.value === 'system') {
      if (HOST_THEME) root.setAttribute('data-theme', HOST_THEME);
      else root.removeAttribute('data-theme');
    } else root.setAttribute('data-theme', theme.value);
  }, [theme.value]);
  void applied.value;
  return (
    <>
      <TopBar />
      <Banners />
      <main class="main">
        <Stage />
        <LiveStats />
        <BottomStrip />
      </main>
      <Drawers />
      <EndCard />
      <HowTo />
      <HoverCard />
      <footer class="about muted">
        Canteen Sim · model {MODEL_VERSION} · build {__BUILD_SHA__}
      </footer>
    </>
  );
}
