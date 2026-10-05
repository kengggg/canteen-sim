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
        <p class="eyebrow">Canteen Sim · Same crowd. Two ways to find a seat.</p>
        <h1 id="story-title">Does saving a table help everyone get lunch?</h1>
        <p>One canteen lets groups leave an object on a table before buying food. In the other, everyone buys food first. Replay the same crowd in both and see who gets to eat.</p>
        <button type="button" class="linklike" onClick={jumpToSimulation}>Jump to the simulator</button>
      </header>
      <div class="story-experiment">
        <fieldset class="story-choices">
          <legend>What do arriving groups judge?</legend>
          <label><input type="radio" name="story-door" checked={rule === 'default'} onChange={() => setRule('default')} /> Queues and seating</label>
          <label><input type="radio" name="story-door" checked={rule === 'queuesOnly'} onChange={() => setRule('queuesOnly')} /> Queues only</label>
        </fieldset>
        <div class="story-result" aria-live="polite" aria-atomic="true">
          {estimate ? <>
            <p class="story-measure">People who leave without eating, out of every 100</p>
            <dl class="story-numbers">
              <div><dt>Buy food first</dt><dd class="num">{num(estimate.left.b, 1)}</dd><span>no groups reserve</span></div>
              <div><dt>Save a table first</dt><dd class="num">{num(estimate.left.a, 1)}</dd><span>all groups reserve</span></div>
            </dl>
            <p class="story-takeaway">{unclear ? 'No clear difference in how many people leave.' : `About ${num(Math.abs(estimate.left.adv), 0)} ${estimate.left.adv >= 0 ? 'more' : 'fewer'} people out of 100 leave when every group reserves.`}</p>
            <p class="story-detail">Reservation changes the average time carrying a plate by {sgn(estimate.plateSeconds, 0)} seconds and peak seat use by {sgn(-estimate.seatUseLost, 1)} percentage points.</p>
            <details class="story-uncertainty">
              <summary>How certain is this estimate?</summary>
              <p>The difference in leaving is {sgn(estimate.left.adv, 2)} percentage points.{estimate.left.lo !== null && estimate.left.hi !== null ? ` The 95% confidence interval is ${sgn(estimate.left.lo, 2)} to ${sgn(estimate.left.hi, 2)}.` : ' No confidence interval is available.'} This range covers variation between simulated lunches. It does not measure uncertainty about the behaviour rules.</p>
            </details>
            <p class="story-source">{estimate.n} simulated lunches · 100% vs 0% reservation · default canteen{rule === 'queuesOnly' ? ', seating check off' : ''}</p>
          </> : <p>The built-in estimates need updating for this model. Run repeated lunches in Batch runs to check the comparison.</p>}
        </div>
      </div>
      <div class="story-explanation">
        <h2>One assumption changes the answer</h2>
        <p>{rule === 'default'
          ? 'Here, a table with an object looks taken. Arriving groups can turn away even while seats are empty. Try “Queues only” to see how much the result depends on that rule.'
          : 'Here, arriving groups ignore the seating and judge the queues. The extra leaving is no longer clear, although reservation still changes seat use and the wait with a plate.'}</p>
        <p class="story-limit">This is simulation research. These are model predictions; the behaviour rules have not been checked against measured canteen data.</p>
        <div class="story-actions">
          <button type="button" class="primary" disabled={batchRunning.value} onClick={watch}>Watch this comparison</button>
          <button type="button" class="linklike" onClick={() => openDrawer('findings')}>Read the full findings</button>
        </div>
        <p class="story-reset muted">Watch loads this example and restarts both canteens. Each animation shows one lunch.</p>
      </div>
    </section>
  );
}
