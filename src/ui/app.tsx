import { noticeText } from './notice-text';
import { language, localise, msg as trText, rich } from '../i18n';
import { useEffect, useState } from 'preact/hooks';
import { MODEL_VERSION } from '../sim/version';
import { MSG } from './labels';
import { Stage } from './stage';
import { applied, closeDrawer, controller, dirty, drawer, howto, notices, openDrawer, restart, theme, themeGen, tick } from './store';
import { TopBar, togglePlay } from './topbar';
import { copyText } from './store';
import { LiveStats } from './livestats';
import { BottomStrip } from './strip';
import { Drawers } from './drawers';
import { EndCard } from './endcard';
import { HowTo } from './howto';
import { HoverCard } from './hovercard';
import { Story } from './story';
import { LanguagePicker } from './language';

const HOST_THEME = document.documentElement.getAttribute('data-theme');

function ErrorBanner({ err }: { err: NonNullable<typeof controller.error> }) {
  const [fallback, setFallback] = useState<string | null>(null);
  const details = `Canteen Sim error: ${err.message}\nsim ms: ${err.atMs}\nseed: ${err.seed}\nsettings code: ${err.code}`;
  return (
    <div class="banner error" role="alert">
      <span>{rich("{v0} {v1} (at {v2} s, seed {v3}, settings code {v4})", { v0: (MSG.engineError), v1: (err.message), v2: (Math.round(err.atMs / 1000)), v3: (err.seed), v4: (<code>{err.code}</code>) })}</span>
      <button type="button" onClick={async () => { if (!(await copyText(details))) setFallback(details); }}>{trText("Copy details")}</button>
      {localise(fallback && <textarea class="copybox" readOnly value={fallback} onFocus={(e) => (e.target as HTMLTextAreaElement).select()} />)}
    </div>
  );
}

function Banners() {
  void tick.value;
  const err = controller.error;
  return (
    <div class="banners" aria-live="polite">
      {localise(dirty.value && (
        <div class="banner warn">
          <span>{localise(MSG.dirty)}</span>
          <button type="button" class="primary" onClick={restart}>{trText("Restart")}</button>
        </div>
      ))}
      {localise(err && <ErrorBanner err={err} />)}
      {localise(notices.value.map((n, i) => (
        <div class="banner info" key={i}>
          <span>{noticeText(typeof n === 'function' ? n() : n)}</span>
          <button type="button" aria-label={trText("Dismiss")} onClick={() => (notices.value = notices.value.filter((_, j) => j !== i))}>×</button>
        </div>
      )))}
    </div>
  );
}

export function App() {
  useEffect(() => {
    document.documentElement.lang = language.value;
    document.title = language.value === 'th' ? 'Canteen Sim · แบบจำลองโรงอาหาร' : 'Canteen Sim';
  }, [language.value]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const t = e.target as HTMLElement;
      if (e.key === 'Escape') {
        // A native select owns Escape when dismissing its popup.
        if (t.closest('select')) return;
        if (howto.value) howto.value = false;
        else if (drawer.value) closeDrawer();
        return;
      }
      if (e.code !== 'Space' || howto.value) return;
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
    const open = () => { if (location.hash === '#findings') openDrawer('findings'); };
    open();
    window.addEventListener('hashchange', open);
    return () => window.removeEventListener('hashchange', open);
  }, []);
  useEffect(() => {
    // Closing Findings drops a #findings hash, so the same link can open it again.
    if (drawer.value === 'findings' || location.hash !== '#findings') return;
    try { history.replaceState(null, '', location.pathname + location.search); } catch { /* sandboxed */ }
  }, [drawer.value]);
  useEffect(() => {
    // Drawers open below the top bar so its buttons stay reachable; the bar's height changes as it wraps.
    const bar = document.querySelector<HTMLElement>('.topbar');
    if (!bar) return;
    const set = () => {
      document.documentElement.style.setProperty('--topbar-h', `${bar.getBoundingClientRect().height}px`);
      // A narrower story changes the toolbar's position even while a fixed drawer is open.
      if (drawer.value && bar.getBoundingClientRect().top > 0) bar.scrollIntoView({ block: 'start' });
    };
    set();
    const ro = new ResizeObserver(set);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!drawer.value) return;
    const bar = document.querySelector<HTMLElement>('.topbar');
    // A link in the opening story can open a panel before the simulator toolbar has reached the viewport.
    if (bar && bar.getBoundingClientRect().top > 0) bar.scrollIntoView({ block: 'start' });
  }, [drawer.value]);
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
      <main>
        <div class="language-bar"><LanguagePicker /></div>
        <div class="story-wrap"><Story /></div>
        <TopBar />
        <Banners />
        <div class="main">
          <Stage />
          <LiveStats />
          <BottomStrip />
        </div>
      </main>
      <Drawers />
      <EndCard />
      <HowTo />
      <HoverCard />
      <footer class="about muted">{rich("Canteen Sim · model {v0} · build {v1}", { v0: (MODEL_VERSION), v1: (__BUILD_SHA__) })}</footer>
    </>
  );
}
