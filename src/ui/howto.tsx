import { localise, msg as trText } from '../i18n';
import { useEffect, useRef } from 'preact/hooks';
import { HOWTO_STEPS, HOWTO_TITLE } from './labels';
import { controller, drawer, evidenceOpen, howto, playing, speed } from './store';

/** Optional help. The guided story is the first-visit introduction. */
export function HowTo() {
  const start = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (howto.value) start.current?.focus();
  }, [howto.value]);
  if (!howto.value) return null;
  const dismiss = () => {
    howto.value = false;
  };
  return (
    <div class="overlay" role="dialog" aria-modal="true" aria-labelledby="howto-title">
      <div class="howto">
        <h2 id="howto-title">{localise(HOWTO_TITLE)}</h2>
        <ol>
          {localise(HOWTO_STEPS.map((s) => <li key={s}>{localise(s)}</li>))}
        </ol>
        <div class="howto-actions">
          <button type="button" class="primary" ref={start} onClick={() => { dismiss(); speed.value = 60; controller.speed = 60; controller.playing = true; playing.value = true; }}>{trText("Start lunch")}</button>
          <button type="button" onClick={() => { dismiss(); evidenceOpen.value = true; drawer.value = 'batch'; }}>{trText("Show evidence")}</button>
          <button type="button" class="linklike" onClick={dismiss}>{trText("Close")}</button>
        </div>
      </div>
    </div>
  );
}
