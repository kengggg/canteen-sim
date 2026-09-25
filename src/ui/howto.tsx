import { useEffect, useRef } from 'preact/hooks';
import { HOWTO_STEPS, HOWTO_TITLE } from './labels';
import { controller, drawer, evidenceOpen, howto, playing, speed, storage } from './store';

const KEY = 'canteen-sim:howto-dismissed';

/** First-visit "How this works" panel (spec §11.5). Dismissal is remembered when storage allows it. */
export function HowTo() {
  const start = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // A #findings link goes straight to the Findings panel, without the first-visit dialog on top.
    if (storage.get(KEY) !== '1' && location.hash !== '#findings') howto.value = true;
  }, []);
  useEffect(() => {
    if (howto.value) start.current?.focus();
  }, [howto.value]);
  if (!howto.value) return null;
  const dismiss = () => {
    howto.value = false;
    storage.set(KEY, '1');
  };
  return (
    <div class="overlay" role="dialog" aria-modal="true" aria-labelledby="howto-title">
      <div class="howto">
        <h2 id="howto-title">{HOWTO_TITLE}</h2>
        <ol>
          {HOWTO_STEPS.map((s) => <li key={s}>{s}</li>)}
        </ol>
        <div class="howto-actions">
          <button type="button" class="primary" ref={start} onClick={() => { dismiss(); speed.value = 60; controller.speed = 60; controller.playing = true; playing.value = true; }}>
            Start lunch
          </button>
          <button type="button" onClick={() => { dismiss(); evidenceOpen.value = true; drawer.value = 'batch'; }}>Show evidence</button>
          <button type="button" class="linklike" onClick={dismiss}>Close</button>
        </div>
      </div>
    </div>
  );
}
