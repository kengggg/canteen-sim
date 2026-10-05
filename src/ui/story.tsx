import { localise, msg as trText, rich } from '../i18n';
import { useEffect, useState } from 'preact/hooks';
import { num } from './format';
import { sgn, straddlesZero } from './findings-text';
import { comparisonEstimate, storyConfig, type DoorRule } from './story-model';
import { applied, batchRunning, controller, drawer, howto, openDrawer, pending, playing, restart } from './store';

function jumpToSimulation(): void {
  const stage = document.getElementById('simulation');
  stage?.focus({ preventScroll: true });
  stage?.scrollIntoView({ block: 'start' });
}

/** A guided introduction to a fixed, labelled experiment; the live lunch remains a separate view. */
export function Story() {
  const [rule, setRule] = useState<DoorRule>('default');
  useEffect(() => {
    // Shared settings should take readers straight to the lunch they were sent.
    if (!location.hash.startsWith('#v=')) return;
    const frame = requestAnimationFrame(jumpToSimulation);
    return () => cancelAnimationFrame(frame);
  }, []);
  const estimate = comparisonEstimate(storyConfig(rule, 1));
  const unclear = estimate && straddlesZero(estimate.left.lo, estimate.left.hi);
  const watch = () => {
    pending.value = storyConfig(rule, applied.value.seed);
    drawer.value = null;
    howto.value = false;
    restart();
    controller.playing = true;
    playing.value = true;
    requestAnimationFrame(jumpToSimulation);
  };
  return (
    <section class="story" aria-labelledby="story-title">
      <header class="story-intro">
        <p class="eyebrow">{trText("Canteen Sim · Same crowd. Two ways to find a seat.")}</p>
        <h1 id="story-title">{trText("Does saving a table help everyone get lunch?")}</h1>
        <p>{trText("One canteen lets groups leave an object on a table before buying food. In the other, everyone buys food first. Replay the same crowd in both and see who gets to eat.")}</p>
        <button type="button" class="linklike" onClick={jumpToSimulation}>{trText("Jump to the simulator")}</button>
      </header>
      <div class="story-experiment">
        <fieldset class="story-choices">
          <legend>{trText("What do arriving groups judge?")}</legend>
          <label>{rich("{v0} Queues and seating", { v0: (<input type="radio" name="story-door" checked={rule === 'default'} onChange={() => setRule('default')} />) })}</label>
          <label>{rich("{v0} Queues only", { v0: (<input type="radio" name="story-door" checked={rule === 'queuesOnly'} onChange={() => setRule('queuesOnly')} />) })}</label>
        </fieldset>
        <div class="story-result" aria-live="polite" aria-atomic="true">
          {localise(estimate ? <>
            <p class="story-measure">{trText("People who leave without eating, out of every 100")}</p>
            <dl class="story-numbers">
              <div><dt>{trText("Buy food first")}</dt><dd class="num">{localise(num(estimate.left.b, 1))}</dd><span>{trText("no groups reserve")}</span></div>
              <div><dt>{trText("Save a table first")}</dt><dd class="num">{localise(num(estimate.left.a, 1))}</dd><span>{trText("all groups reserve")}</span></div>
            </dl>
            <p class="story-takeaway">{localise(unclear ? 'No clear difference in how many people leave.' : trText("About {v0} {v1} people out of 100 leave when every group reserves.", { v0: (num(Math.abs(estimate.left.adv), 0)), v1: (estimate.left.adv >= 0 ? 'more' : 'fewer') }))}</p>
            <p class="story-detail">{rich("Reservation changes the average time carrying a plate by {v0} seconds and peak seat use by {v1} percentage points.", { v0: (sgn(estimate.plateSeconds, 0)), v1: (sgn(-estimate.seatUseLost, 1)) })}</p>
            <details class="story-uncertainty">
              <summary>{trText("How certain is this estimate?")}</summary>
              <p>{rich("The difference in leaving is {v0} percentage points.{v1} This range covers variation between simulated lunches. It does not measure uncertainty about the behaviour rules.", { v0: (sgn(estimate.left.adv, 2)), v1: (estimate.left.lo !== null && estimate.left.hi !== null ? trText(" The 95% confidence interval is {v0} to {v1}.", { v0: (sgn(estimate.left.lo, 2)), v1: (sgn(estimate.left.hi, 2)) }) : ' No confidence interval is available.') })}</p>
            </details>
            <p class="story-source">{rich("{v0} simulated lunches · 100% vs 0% reservation · default canteen{v1}", { v0: (estimate.n), v1: (rule === 'queuesOnly' ? ', seating check off' : '') })}</p>
          </> : <p>{trText("The built-in estimates need updating for this model. Run repeated lunches in Batch runs to check the comparison.")}</p>)}
        </div>
      </div>
      <div class="story-explanation">
        <h2>{trText("One assumption changes the answer")}</h2>
        <p>{localise(rule === 'default'
          ? 'Here, a table with an object looks taken. Arriving groups can turn away even while seats are empty. Try “Queues only” to see how much the result depends on that rule.'
          : 'Here, arriving groups ignore the seating and judge the queues. The extra leaving is no longer clear, although reservation still changes seat use and the wait with a plate.')}</p>
        <p class="story-limit">{trText("This is simulation research. These are model predictions; the behaviour rules have not been checked against measured canteen data.")}</p>
        <div class="story-actions">
          <button type="button" class="primary" disabled={batchRunning.value} onClick={watch}>{trText("Watch this comparison")}</button>
          <button type="button" class="linklike" onClick={() => openDrawer('findings')}>{trText("Read the full findings")}</button>
        </div>
        <p class="story-reset muted">{trText("Watch loads this example and restarts both canteens. Each animation shows one lunch.")}</p>
      </div>
    </section>
  );
}
