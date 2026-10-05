import { localise, msg as trText } from '../i18n';
import { CLASS_HELP, CLASS_LABELS, LEGEND_OBJECT, LEGEND_RING, LEGEND_TRAY } from './labels';

/** Legend strip under each viewport (spec §11.6): person classes, the tray cue, the ring and the object. */
export function Legend() {
  return (
    <details class="legend" open>
      <summary>{trText("Legend")}</summary>
      <ul>
        {localise(CLASS_LABELS.map((l, i) => (
          <li key={l} title={trText((CLASS_HELP[i]))}>
            <span class="sw sw-person" style={{ background: `var(--cls-${i})` }} />
            {localise(l)}
          </li>
        )))}
        <li><span class="sw sw-tray" />{localise(LEGEND_TRAY)}</li>
        <li><span class="sw sw-ring" />{localise(LEGEND_RING)}</li>
        <li><span class="sw sw-object" />{localise(LEGEND_OBJECT)}</li>
      </ul>
    </details>
  );
}
