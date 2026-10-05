# Canteen Sim implementation review — 2026-10-05

## Latest review: research-only study and explanation walkthrough

**Final result: passed**

Scope: the separate visibility-role experiment, research-only framing, protocol/results downloads, section jumps,
keyboard behaviour and responsive controls. The existing implemented Findings page is the visual reference.
Adding a research section and navigation is intentional; the earlier observation pilot is superseded. This is
a local interface review, not empirical validation or evidence from human readers.

### Visual evidence

All paths below are under `/tmp/canteen-research-20261005/`.

| State | Source | Final rendered implementation | Pixels per image |
|---|---|---|---|
| Desktop Findings at top, paused default lunch, light theme | `before-findings.jpg` | `after-findings.jpg` | 1265 × 1307 |
| Desktop role experiment, 100%, both ranges 20 m, seating check on | Existing section/table/control patterns | `desktop-research-final.jpg` | 1265 × 1307 |
| Phone role controls, seating check off | Earlier desktop patterns | `phone-research-final.jpg` | 375 × 812 |
| Narrow role table and scroll guidance, seating check off | Earlier desktop patterns | `narrow-research-final.jpg` | 305 × 804 |
| Running batch with anchored Cancel | Regression failure log and existing batch controls | `batch-cancel-final.jpg` | 1265 × 1307 |

Desktop CSS viewport: 1280 × 1323, devicePixelRatio 2; browser screenshot output is normalized to its content
capture at 1265 × 1307 pixels. Requested phone viewports: 390 × 844 and 320 × 844; output is 375 × 812 and 305 × 804.
Paired source/final captures have identical dimensions; no additional resampling was used.

Opened and compared `desktop-comparison.png` (source and final in one input) and `type-comparison.png` (two matched
855 × 178 crops of the lead/scope text). The lead's typography, wrapping, palette and alignment match. The new
navigation intentionally adds one row before the explorer. The new experiment reuses the same heading, table,
selected-button and detail-panel patterns. It is not a pixel copy of the former observation section.

### Findings, fixes and iteration evidence

1. **[P2, fixed] Focus lost after closing Findings.** Connected Chrome reproduced focus moving to BODY after
   Escape. `closeDrawer` restores the opener; section navigation focuses headings. Chromium/WebKit keyboard
   regressions pass on the final build.
2. **[P2, fixed] Escape could close the panel while dismissing a select.** Native selects now own that key;
   the panel remains open in both tested browser engines.
3. **[P2, fixed] Moving Cancel target during batch updates.** The full Chromium pass timed out waiting for a
   stable button. A grid anchors Cancel independently of changing text. All review cases passed on the rerun;
   the final screenshot shows the new placement and a connected-Chrome 600-run batch was cancelled successfully.
4. **[P2, fixed] WebKit native select height was 22 px.** The first narrow-screen research test caught it.
   Explicit 44 px height fixed it; the same browser assertion passed after rebuilding. Chrome's intended control
   appearance is preserved.
5. **[P2, fixed] Research results were difficult to find below the sensitivity explorer.** Added three section
   jumps, with focus handoff. The full-view comparison records the intentional new navigation row.
6. **Copy correction, fixed:** source review confirmed fallback discards table memory. The protocol records
   the correction; the UI describes the actual rule. No numerical inputs or outputs changed. The report download
   initially used a build predating the correction; the final Chromium/WebKit downloads byte-match both files.

Final screenshots were captured after the fixes. Narrow layout measurements: drawer left 0, toolbar top 0,
body client/scroll widths 289/289 at 320 px and 359/359 at 390 px; document overflow 0. Wide tables retain labelled,
keyboard-focusable horizontal scroll regions, with a visible phone hint. No actionable P0/P1/P2 remains in this scope.

### Required fidelity surfaces

- **Fonts/typography:** existing system font, weights, line height, numeric styles and hierarchy retained.
  Focused comparison confirms matching lead text. Phone labels wrap without clipping; long case names use several
  lines at 320 px, an acceptable density trade-off so the estimates remain alongside them.
- **Spacing/layout:** original section rhythm, padding, borders and radii retained. Section jumps avoid repeated
  long scrolling. Controls tested at least 44 px. Cancel has a stable location while status text updates.
- **Colours/tokens:** only existing accent, panel, muted and line tokens are used. Selected cases retain both a
  visible border and `aria-pressed` state.
- **Image quality/assets:** the existing 3D scene and icons are retained; no substitute imagery. QA images are
  browser captures, with matched cropping/composition only.
- **Copy/content:** separate model/experiment identities, 30 fresh lunches, all four outcomes, interval limits,
  door/queue decomposition and the absence of a pilot are explicit. No reader-comprehension claim is made.

### Verification and residual limits

- 265 unit tests and 181 sanity checks passed; sanity includes one documented expected failure of the original
  median-time hypothesis. See `docs/research-review.md` for the contradiction and full verification evidence.
- 61 distinct Chromium/WebKit cases covered across the full pass and targeted rerun; all 18 affected research/review
  cases passed after fixes. Firefox failed before page load on this macOS installation with a missing-profile error.
  Firefox is unverified locally; Linux CI retains it as a required check and has not yet run remotely.
- Lint, type checks, benchmark and diff checks passed. Final self-contained build: **1,348.19 kB (1317 KiB)**,
  below the 1.5 MB limit. Numerical evidence: 3,240 baseline sensitivity runs plus 600 role-experiment runs; a fresh
  600-run `research --check` reproduced every research artifact exactly.
- Primary interactions: section jumps; both door rules and reservation levels; case selection and all outcomes;
  Model 2 settings isolation; downloads; keyboard close/return; native select Escape; narrow table scrolling;
  batch start/cancel. No browser console errors in the final connected-Chrome inspection.
- No real-device or screen-reader certification, participant study, remote push or deployment is claimed.

Implementation checklist: numerical evidence complete; structured walkthrough recorded; desktop/phone comparisons
inspected; interface defects fixed and rechecked; research documents downloadable; local release checks recorded.

final result: passed

## Previous review: sensitivity explorer and observation plan (superseded research scope)

**Final result: passed**

Scope: the new Findings explorer, exact-setting handoff to the live simulation, observation-plan download,
and drawer behaviour on narrow screens. Existing colours, type, table patterns and the guided opening remain
the visual reference. The inserted explorer is an intentional addition; it is not intended to reproduce the
old Findings content. This review does not validate the simulation against real canteen behaviour.

### Evidence and comparison

| Capture | Source / earlier iteration | Final implementation | Raster size per image |
|---|---|---|---|
| Desktop Findings, default live lunch paused at 11:00 and 50% reservation | `/tmp/canteen-sensitivity-20261005/before-findings.jpg` | `/tmp/canteen-sensitivity-20261005/desktop-findings-final.jpg` | 1265 × 1307 |
| Phone, Findings open | `/tmp/canteen-sensitivity-20261005/phone-explorer.jpg` | `/tmp/canteen-sensitivity-20261005/phone-explorer-final.jpg` | 375 × 812 |
| Narrow phone, explorer and result table | No pre-change source at this width | `/tmp/canteen-sensitivity-20261005/narrow-explorer-final.jpg` | 305 × 804 |

The desktop uses the browser's default viewport. Phone viewports were requested at 390 × 844 and 320 × 844 CSS px;
the document widths were 375 and 305 px, respectively, with browser scrollbars. Captures use the backend's native
image density without resampling; each paired comparison has identical raster dimensions. Light theme throughout.
The phone iteration comparison checks layout recovery, not exact copy: the earlier failed state had a pending
preset change; the final state uses applied defaults. No old phone Findings design was available for pixel matching.

Opened and inspected these combined comparison inputs:

- `/tmp/canteen-sensitivity-20261005/desktop-comparison.png` — full desktop source and final implementation.
- `/tmp/canteen-sensitivity-20261005/type-comparison.png` — matched 870 × 225 crops of the unchanged Findings heading,
  lead and source scope, to check readable type, margins and wrapping at native density.
- `/tmp/canteen-sensitivity-20261005/phone-fix-comparison.png` — failed phone layout beside the corrected one.

New result controls and numbers were also inspected directly in the rendered desktop and phone views.

### Findings and fixes

1. **[P2, fixed] Toolbar displaced during an open-drawer resize.** Narrowing the story changed the toolbar's
   document position while the drawer still assumed it was at the viewport top. The earlier phone capture shows
   story content above the drawer and toolbar controls overlapping its bottom. The toolbar resize observer now
   repositions it when a drawer is open. Final measurements: toolbar top 0–0.21 px at 320 and 390 widths.
2. **[P2, fixed] Drawer extended left of the content viewport.** A `100vw` width included scrollbar space; the
   panel lost its left padding. Drawer widths now use the available containing width and border-box sizing.
   Final drawer left is 0 at both phone widths.
3. **[P2, fixed] A long existing CSV column identifier overflowed at 320 px.** The drawer body had client/scroll
   widths 289/299. Added wrapping for code identifiers. Final body widths are 289/289 at 320 and 359/359 at 390.
   Wide result tables retain their own accessible horizontal scroll regions.
4. **[P2, fixed before final capture] Reused scenario labels concealed interaction axes.** A deduplicated default
   scenario appeared in several grids with a generic name. Labels now derive both axis values from the effective
   configuration, e.g. `1200 diners; ignore seating`. The full 12-row crowd/door grid was checked on screen.
5. **[P2, fixed before final capture] Rounding could turn a small negative interval endpoint into zero.** The
   60-second-service, queues-only result now displays `−0.158 to −0.001`, consistent with its stated direction.
   The visible exploratory-comparison caution remains beside the result.

The final full and focused comparisons show no remaining actionable P0/P1/P2 issue in this scope.

### Required visual surfaces

- **Fonts/typography:** existing system fonts and numeric formatting retained; source and final heading/lead
  crops have matching weight, wrapping and hierarchy. New labels wrap; table numbers stay legible in their scroll region.
- **Spacing/layout:** existing drawer/section rhythm and radii retained. The new select controls, case buttons and
  primary action are at least 44 px high. Responsive stacking, drawer bounds and toolbar position were measured.
- **Colours/tokens:** the original panel, muted, accent and border tokens are reused. No new palette or decoration.
- **Image quality/assets:** the existing canteen scene is retained; no image assets were substituted. Evidence
  images are direct browser captures, with only matched cropping and side-by-side composition for QA.
- **Copy/content:** 36 settings / 30 paired lunches / 3,240 runs are identified as exploratory model results.
  All four measures, uncertainty, setting scope and no real-world validation are explicit. The earlier 12-setting
  checks are labelled separately. The observer guide separates visible behaviour from unknown reasons.

### Verification and boundaries

- Full study completed: 36 distinct configurations, 3,240 engine runs, no missing/truncated metric pairs. Default
  run hashes match the earlier evidence. Every published statistic reconstructs from the exact audit values.
- **256 unit tests and 180 sanity checks passed**, including a fresh first-seed replay of all 36 settings, existing
  evidence regeneration, termination and invariant checks. Lint, type checks, benchmark and diff checks passed.
- Final single-file build passed: 1,270.18 kB (about 1240 KiB), within the 1.5 MB limit.
- Chrome verified visibility selection → matching 100% live estimate (37.9% A / 16.9% B), playback and simulator
  focus; 50% interaction grid (12 correctly labelled rows); inconclusive leaving; small signed interval endpoints;
  320/390 responsive layouts; and return to the default desktop state.
- Downloaded `canteen-observation-plan.md` from the app and byte-compared it with `docs/observation-plan.md`: identical.
  The browser automation download event timed out, but the actual saved file was present and verified.
- New browser regression cases were added. The Playwright CLI/cross-browser suite was not run; these interaction
  paths were checked through connected Chrome. No real-device or screen-reader certification is claimed.
- Full `npm run sensitivity -- --check` was not separately repeated; generation, audit reconstruction and the
  first-seed-per-setting sanity replay were completed. Numerical source was unchanged after the full study.
- The model rules and defaults are unchanged. No deployment, push or commit was performed.

Implementation checklist: study and audit generated; matching-setting guard tested; explorer and observation guide
integrated; mobile defects fixed and rechecked; all required scoped checks complete. No required fix remains.

final result: passed

## Previous review: guided opening

**Final result: passed**

Scope: the selected guided-story-first opening, its assumption comparison, the handoff to the live simulator,
evidence labels, and chart resizing. This is a review of the local change, not empirical validation of the model
or certification of the complete application.

## Visual references and comparison

The existing application is the visual reference. The user chose a guided story above the simulator for a general
audience, with credible conclusions and clear explanations. Moving the controls below the story and replacing the
automatic help dialog are intentional changes to the entry flow, not attempts to reproduce the old first screen.

| Capture | Source | Implementation | Raster dimensions, each |
| --- | --- | --- | --- |
| Desktop first visit | `/tmp/canteen-review-20261005/01-first-visit.jpg` | `/tmp/canteen-story-20261005/01-guided-opening.jpg` | 1265 × 1307 |
| Phone entry | `/tmp/canteen-review-20261005/03-phone.jpg` | `/tmp/canteen-story-20261005/03-phone-story.jpg` | 375 × 812 |

Full-view composites were saved and inspected:

- `/tmp/canteen-story-20261005/comparison-desktop.png`
- `/tmp/canteen-story-20261005/comparison-phone.png`

The desktop comparison uses the browser's default viewport. The phone viewport was requested at 390 × 844 CSS px;
its document content width was 375 px. Both sides of each comparison have identical browser-supplied raster
dimensions. No additional resizing or density normalization was applied. The original desktop capture includes
the first-visit modal; its shaded background was not used for precise palette comparison.

Both final entry captures show the default door rule, a paused default live lunch at 11:00, and the light theme.
The story explicitly describes the precomputed 100%-versus-0% experiment; the live toolbar separately labels its
50% example. The phone composite was inspected at its native size, where controls, body text and result numbers
are readable, so a further cropped comparison was unnecessary. Result-number alignment was also checked in the
DOM: both numbers started at the same vertical coordinate.

## Findings and iteration history

1. **Entry hierarchy:** the first implementation still placed the full simulator toolbar above the story. Moved
   it below the introduction. The final desktop and phone captures show the question and experiment first.
2. **Phone result alignment:** a wrapped label put the two result numbers on different lines. Reserved equal label
   height on narrow screens. The final phone capture and DOM measurements confirm aligned values.
3. **Existing chart resize defect:** desktop plots retained a width of 585 px after narrowing the window, causing
   a 614 px document width inside a 375 px content area. Added container resize observation and observer cleanup
   on plot destruction. Rechecked paused plots at 390 px, 320 px and the original desktop size: plot/container
   widths matched at 317 px, 247 px and 585 px respectively, with no document overflow.

No actionable P0/P1/P2 visual issue remained within this scope after the final comparison.

## Required visual surfaces

- **Fonts and typography:** existing system font and numeric formatting retained; larger question and outcome
  text provide the new reading order. Labels and result numbers wrap without clipping at tested widths.
- **Spacing and layout:** existing radius and border treatment retained. Desktop uses two columns; phone uses one
  reading column. Primary story controls have at least 44 px height. Number alignment and resize behavior verified.
- **Colors and tokens:** all new surfaces use existing panel, text, muted, accent and A/B tokens. The unshaded phone
  comparison confirms consistency with the existing palette. No new palette or decorative imagery was introduced.
- **Image quality and assets:** existing rendered canteen assets are retained below the story. No source image
  was replaced by a generated approximation. Screenshots are direct browser captures.
- **Copy and content:** figures come from the shipped evidence; the assumption's effect and the absence of real
  canteen measurements are visible. Missing live estimates are labelled, not interpolated. The confidence interval
  disclosure distinguishes simulated variability from uncertainty about rules.

## Interaction and implementation checks

- Switching to queues-only changes the displayed rates to 16.4 and 16.3 per 100, with an inconclusive takeaway.
- Watch loads the selected example at 100% reservation, starts playback and moves focus to the simulator.
- The default live 50% setting displays 20.2% versus 16.6%; 25% displays 19.6% versus 16.6%; 35% explicitly has
  no built-in estimate.
- Findings opens from the story with its heading focused and its panel below the visible toolbar.
- A shared settings URL opens the requested 25% / 900-person lunch directly in the simulator after page load.
- Final Chrome console check returned no errors. Earlier warnings were from an unrelated browser extension.
- `npm run lint`, `npm run typecheck`, all 248 unit tests, `npm run build:pages`, and `git diff --check` passed.
- Single-file production artifact: about 1151 KB, within the project's 1.5 MB limit.

Added browser regression cases cover the story, exact example loading, unsupported estimate levels, resize and
shared-link entry. Existing first-visit and coordinate-based scene tests were updated for the new entry flow.
These browser paths were exercised through the connected Chrome UI; the Playwright CLI suite was not run.

## Remaining verification boundaries

The full cross-browser suite, full model-sanity suite, screen-reader audit and physical-device touch testing were
not run in this change. The engine and generated datasets were not changed; the ordinary unit suite included the
existing golden hashes and sampled evidence freshness checks. No claim of real-world calibration is made.

Implementation checklist: guided entry, scope-labelled evidence, assumption switch, live handoff, shared-link
entry, responsive plots, focused regression cases, final visual comparison and local preview are complete.

final result: passed
