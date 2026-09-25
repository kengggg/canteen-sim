import { AssumptionsPanel } from './assumptions';
import { FindingsPanel } from './findings';
import { BatchPanel } from './batchview';
import { SettingsPanel } from './settings';
import { batch } from './batchrun';
import { drawer } from './store';

const TITLES = { settings: 'Settings', assumptions: 'Assumptions', batch: 'Batch runs', findings: 'Findings' } as const;

/** Side drawers for settings, assumptions, batch runs and findings. The settings drawer is read-only during a batch. */
export function Drawers() {
  const d = drawer.value;
  if (!d) return null;
  const readOnly = d === 'settings' && batch.value.status === 'running';
  return (
    // Keyed by drawer: each opens at the top rather than at the previous drawer's scroll position.
    <aside key={d} class={`drawer drawer-${d}`} aria-label={TITLES[d]}>
      <header class="drawer-head">
        <h2 tabIndex={-1}>{TITLES[d]}</h2>
        <button type="button" aria-label="Close" onClick={() => (drawer.value = null)}>×</button>
      </header>
      <div class="drawer-body">
        {readOnly && <p class="muted">A batch is running; settings are read-only until it finishes.</p>}
        <fieldset disabled={readOnly} class="plain">
          {d === 'settings' && <SettingsPanel />}
          {d === 'assumptions' && <AssumptionsPanel />}
          {d === 'batch' && <BatchPanel />}
          {d === 'findings' && <FindingsPanel />}
        </fieldset>
      </div>
    </aside>
  );
}
