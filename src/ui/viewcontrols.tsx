import { cameraMode, colorByGroup, linked, seatTints } from './store';

/** View options (spec §11.3, §11.6): camera preset, linked cameras, colour by group, seat overlay. View state only. */
export function ViewControls() {
  return (
    <div class="viewcontrols" role="group" aria-label="View">
      <label for="camera-mode">
        Camera
        <select id="camera-mode" value={cameraMode.value} onChange={(e) => (cameraMode.value = (e.target as HTMLSelectElement).value as typeof cameraMode.value)}>
          <option value="threeQuarter">3/4 view</option>
          <option value="topDown">Top-down</option>
          <option value="follow">Follow a group</option>
        </select>
      </label>
      <label for="cams-linked"><input id="cams-linked" type="checkbox" checked={linked.value} onChange={(e) => (linked.value = (e.target as HTMLInputElement).checked)} /> Link cameras</label>
      <label for="color-group"><input id="color-group" type="checkbox" checked={colorByGroup.value} onChange={(e) => (colorByGroup.value = (e.target as HTMLInputElement).checked)} /> Colour by group</label>
      <label for="seat-tints"><input id="seat-tints" type="checkbox" checked={seatTints.value} onChange={(e) => (seatTints.value = (e.target as HTMLInputElement).checked)} /> Seat states on seats</label>
    </div>
  );
}
