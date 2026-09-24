import { useState } from 'preact/hooks';
import { sliderLabel } from './labels';
import { applied, controller, editPending, pending, tick } from './store';

/**
 * The A slider (spec §11.1): dragging only updates the label; releasing restarts both canteens from time 0 with the
 * same seed, applies any pending drawer changes, and keeps play/pause and speed.
 */
export function ASlider() {
  void tick.value;
  const committed = Math.round(applied.value.reserve.percentA * 100);
  const [drag, setDrag] = useState<number | null>(null);
  const p = drag ?? committed;
  const release = (v: number) => {
    setDrag(null);
    editPending((c) => { c.reserve.percentA = v / 100; });
    controller.setFraction(v / 100, pending.value);
    applied.value = JSON.parse(JSON.stringify(controller.applied));
    tick.value++;
  };
  return (
    <label class="aslider" for="slider-a">
      <span class="aslider-label">{sliderLabel(p)}</span>
      <input
        id="slider-a"
        type="range"
        min={0}
        max={100}
        step={5}
        value={p}
        onInput={(e) => setDrag(Number((e.target as HTMLInputElement).value))}
        onChange={(e) => release(Number((e.target as HTMLInputElement).value))}
      />
    </label>
  );
}
