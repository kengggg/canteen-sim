import { localise, msg as trText } from '../i18n';
import { AssumptionsPanel } from './assumptions';
import { FindingsPanel } from './findings';
import { BatchPanel } from './batchview';
import { SettingsPanel } from './settings';
import { batch } from './batchrun';
import { closeDrawer, drawer } from './store';

const TITLES = { settings: 'Settings', assumptions: 'Assumptions', batch: 'Batch runs', findings: 'Findings' } as const;

/** Side drawers for settings, assumptions, batch runs and findings. The settings drawer is read-only during a batch. */
export function Drawers() {
  const d = drawer.value;
  if (!d) return null;
  const readOnly = d === 'settings' && batch.value.status === 'running';
  return (
    // Keyed by drawer: each opens at the top rather than at the previous drawer's scroll position.
    <aside key={d} class={`drawer drawer-${d}`} aria-label={trText((TITLES[d]))}>
      <header class="drawer-head">
        <h2 tabIndex={-1}>{localise(TITLES[d])}</h2>
        <button type="button" aria-label={trText("Close")} onClick={closeDrawer}>×</button>
      </header>
      <div class="drawer-body">
        {localise(readOnly && <p class="muted">{trText("A batch is running; settings are read-only until it finishes.")}</p>)}
        <fieldset disabled={readOnly} class="plain">
          {localise(d === 'settings' && <SettingsPanel />)}
          {localise(d === 'assumptions' && <AssumptionsPanel />)}
          {localise(d === 'batch' && <BatchPanel />)}
          {localise(d === 'findings' && <FindingsPanel />)}
        </fieldset>
      </div>
    </aside>
  );
}
