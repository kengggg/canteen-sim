import { msg as trText, rich } from '../i18n';
import { cameraMode, colorByGroup, linked, seatTints } from './store';

/** View options (spec §11.3, §11.6): camera preset, linked cameras, colour by group, seat overlay. View state only. */
export function ViewControls() {
  return (
    <div class="viewcontrols" role="group" aria-label={trText("View")}>
      <label for="camera-mode">{rich("Camera{v0}", { v0: (<select id="camera-mode" value={cameraMode.value} onChange={(e) => (cameraMode.value = (e.target as HTMLSelectElement).value as typeof cameraMode.value)}>
          <option value="threeQuarter">{trText("3/4 view")}</option>
          <option value="topDown">{trText("Top-down")}</option>
          <option value="follow">{trText("Follow a group")}</option>
        </select>) })}</label>
      <label for="cams-linked">{rich("{v0} Link cameras", { v0: (<input id="cams-linked" type="checkbox" checked={linked.value} onChange={(e) => (linked.value = (e.target as HTMLInputElement).checked)} />) })}</label>
      <label for="color-group">{rich("{v0} Colour by group", { v0: (<input id="color-group" type="checkbox" checked={colorByGroup.value} onChange={(e) => (colorByGroup.value = (e.target as HTMLInputElement).checked)} />) })}</label>
      <label for="seat-tints">{rich("{v0} Seat states on seats", { v0: (<input id="seat-tints" type="checkbox" checked={seatTints.value} onChange={(e) => (seatTints.value = (e.target as HTMLInputElement).checked)} />) })}</label>
    </div>
  );
}
