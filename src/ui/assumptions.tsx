import { ASSUMPTIONS } from '../config/assumptions';
import { META_BY_ID, getSetting } from '../config/meta';
import { num } from './format';
import { drawer, focusSetting, pending } from './store';

function valueText(id: string): string {
  const m = META_BY_ID.get(id)!;
  const v = getSetting(pending.value, id);
  if (m.type === 'bool') return v ? 'on' : 'off';
  if (m.type === 'enum') return v === 'oneClaimer' ? 'one member reserves' : 'whole group reserves';
  if (typeof v === 'number') return `${num(v * m.uiFactor, m.step * m.uiFactor < 1 ? 2 : 0)} ${m.uiUnit}`.trim();
  return String(v);
}

/** Assumptions panel (spec §11.12): the §15 ledger, with Change links for items that map to a setting. */
export function AssumptionsPanel() {
  return (
    <div class="assumptions">
      {ASSUMPTIONS.map((g) => (
        <section key={g.heading}>
          <h3>{g.heading}</h3>
          <ul>
            {g.items.map((it) => (
              <li key={it.text}>
                <p>{it.text}</p>
                {it.settings ? (
                  <p class="assume-settings">
                    {it.settings.map((id) => (
                      <span key={id}>
                        {META_BY_ID.get(id)!.label}: <b class="num">{valueText(id)}</b>{' '}
                        <button type="button" class="linklike" onClick={() => { focusSetting.value = id; drawer.value = 'settings'; }}>Change</button>
                      </span>
                    ))}
                  </p>
                ) : (
                  <p class="tag">Fixed in this model</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
