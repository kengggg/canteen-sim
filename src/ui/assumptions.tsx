import { localise, msg as trText } from '../i18n';
import { ASSUMPTIONS } from '../config/assumptions';
import { META_BY_ID, getSetting } from '../config/meta';
import { num } from './format';
import { drawer, focusSetting, pending } from './store';

function valueText(id: string): string {
  const m = META_BY_ID.get(id)!;
  const v = getSetting(pending.value, id);
  if (m.type === 'bool') return v ? 'on' : 'off';
  if (m.type === 'enum') return v === 'oneClaimer' ? 'one member reserves' : 'whole group reserves';
  if (typeof v === 'number') return `${num(v * m.uiFactor, m.step * m.uiFactor < 1 ? 2 : 0)} ${trText(m.uiUnit)}`.trim();
  return String(v);
}

/** Assumptions panel (spec §11.12): the §15 ledger, with Change links for items that map to a setting. */
export function AssumptionsPanel() {
  return (
    <div class="assumptions">
      {localise(ASSUMPTIONS.map((g) => (
        <section key={g.heading}>
          <h3>{localise(g.heading)}</h3>
          <ul>
            {localise(g.items.map((it) => (
              <li key={it.text}>
                <p>{localise(it.text)}</p>
                {localise(it.settings ? (
                  <p class="assume-settings">
                    {localise(it.settings.map((id) => (
                      <span key={id}>
                        {localise(META_BY_ID.get(id)!.label)}: <b class="num">{localise(valueText(id))}</b>{localise(' ')}
                        <button type="button" class="linklike" onClick={() => { focusSetting.value = id; drawer.value = 'settings'; }}>{trText("Change")}</button>
                      </span>
                    )))}
                  </p>
                ) : (
                  <p class="tag">{trText("Fixed in this model")}</p>
                ))}
              </li>
            )))}
          </ul>
        </section>
      )))}
    </div>
  );
}
