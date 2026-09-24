import { AssumptionsPanel } from './assumptions';
import { BatchPanel } from './batchview';
import { SettingsPanel } from './settings';
import { batch } from './batchrun';
import { drawer } from './store';

const TITLES = { settings: 'Settings', assumptions: 'Assumptions', batch: 'Batch runs' } as const;

/** Side drawers for settings, assumptions and batch runs. The settings drawer is read-only during a batch. */
export function Drawers() {
  const d = drawer.value;
  if (!d) return null;
  const readOnly = d === 'settings' && batch.value.status === 'running';
  return (
    <aside class={`drawer drawer-${d}`} aria-label={TITLES[d]}>
      <header class="drawer-head">
        <h2>{TITLES[d]}</h2>
        <button type="button" aria-label="Close" onClick={() => (drawer.value = null)}>×</button>
      </header>
      <div class="drawer-body">
        {readOnly && <p class="muted">A batch is running; settings are read-only until it finishes.</p>}
        <fieldset disabled={readOnly} class="plain">
          {d === 'settings' && <SettingsPanel />}
          {d === 'assumptions' && <AssumptionsPanel />}
          {d === 'batch' && <BatchPanel />}
        </fieldset>
      </div>
    </aside>
  );
}
