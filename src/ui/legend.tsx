import { CLASS_HELP, CLASS_LABELS, LEGEND_OBJECT, LEGEND_RING, LEGEND_TRAY } from './labels';

/** Legend strip under each viewport (spec §11.6): person classes, the tray cue, the ring and the object. */
export function Legend() {
  return (
    <details class="legend" open>
      <summary>Legend</summary>
      <ul>
        {CLASS_LABELS.map((l, i) => (
          <li key={l} title={CLASS_HELP[i]}>
            <span class="sw sw-person" style={{ background: `var(--cls-${i})` }} />
            {l}
          </li>
        ))}
        <li><span class="sw sw-tray" />{LEGEND_TRAY}</li>
        <li><span class="sw sw-ring" />{LEGEND_RING}</li>
        <li><span class="sw sw-object" />{LEGEND_OBJECT}</li>
      </ul>
    </details>
  );
}
