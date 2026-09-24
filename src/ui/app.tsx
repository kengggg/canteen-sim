import { useEffect } from 'preact/hooks';
import { MODEL_VERSION } from '../sim/version';
import { MSG } from './labels';
import { Stage } from './stage';
import { applied, controller, dirty, notices, restart, theme, tick } from './store';
import { TopBar, togglePlay } from './topbar';
import { copyText } from './store';
import { LiveStats } from './livestats';
import { BottomStrip } from './strip';
import { Drawers } from './drawers';
import { EndCard } from './endcard';
import { HowTo } from './howto';
import { HoverCard } from './hovercard';

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
      {err && (
        <div class="banner error" role="alert">
          <span>{MSG.engineError} {err.message} (at {Math.round(err.atMs / 1000)} s, seed {err.seed})</span>
          <button type="button" onClick={() => copyText(`Canteen Sim error: ${err.message}\nsim ms: ${err.atMs}\nseed: ${err.seed}\nsettings code: ${err.code}`)}>Copy details</button>
        </div>
      )}
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
      if (e.code !== 'Space') return;
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      togglePlay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    if (theme.value === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme.value);
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
