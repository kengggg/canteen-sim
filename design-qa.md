# Canteen Sim implementation review — 2026-10-05

## Latest release check: Linux Firefox label bounds

The [second Linux release run](https://github.com/kengggg/canteen-sim/actions/runs/37303532487) passed
103 of 104 browser cases. Both Chromium startup checks and Firefox language-state preservation passed;
only Firefox's Thai direct-label spacing still blocked publishing.

The failure was reproduced locally in `mcr.microsoft.com/playwright:v1.63.0-noble`. Firefox reported
19 px SVG font bounds but approximately 21 px screen bounds for the same text. Label spacing now uses
the screen bounds, converted to SVG coordinates, including enough vertical room for the complete labels.

Validation: all **23 Linux Firefox cases passed**. The chart regression also passes in Linux Chromium
and WebKit, and in macOS Chromium and WebKit, at 320, 390 and 1280 px. Lint, typechecking and the hosting
build pass; the single HTML is **1,566,210 bytes**, below 1.5 MiB. Native macOS Firefox still cannot launch,
but Linux container coverage provides a local reproduction and verification path. The complete release
pipeline remains required before publication.

## Earlier deployment check: browser portability

The [first Linux release run](https://github.com/kengggg/canteen-sim/actions/runs/37299840881) passed
lint, typechecking, all 276 unit tests and all 181 model-sanity checks, then passed 97 of 101 browser cases.
It exposed two startup-sensitive Chromium checks, a Firefox test that assumed WebGL availability, and
overlapping Thai direct labels in Firefox. Publishing was blocked by the failed browser step.

Direct labels now use their actual SVG font bounds, with enough chart height to contain them. Worker
and context-loss tests wait for the first rendered scene, and language-state comparisons retain a null
renderer when WebGL is unavailable. An additional regression checks language switching with WebGL
explicitly disabled. Failed release checks now retain their screenshots and error contexts.

The 13 affected Chromium/WebKit cases pass across the targeted run and corrected no-WebGL assertion
rerun. Lint, typechecking and the hosting build pass. The single HTML is 1,566,056 bytes, under 1.5 MiB.
Firefox remains unavailable on this Mac; the full Linux browser suite is still required before deployment.

## Previous review: Thai default and Noto Sans Thai Looped

**Passed locally in Chromium and WebKit.** Thai is now the default for new visitors, including browsers
whose primary language is English. Explicit language links and saved choices still override the default.
Noto Sans Thai Looped is embedded in the single HTML file, including its licence metadata, so Thai text
does not depend on a local font installation or an external request. The regular face is bundled and the
browser synthesises heavier weights to retain the 1.5 MiB budget. Charts and scene labels use the same face;
canvas label measurement waits for it to load.

Desktop and 320 px screenshots are in `/private/tmp/canteen-thai-20261005/`:
`thai-looped-opening.png`, `thai-looped-phone.png`, and `thai-looped-charts.png`. WebKit exposed insufficient
space between direct chart labels with the new font; a 22 px gap passes both engines at 320, 390 and 1280 px.
Temporary viewport overrides were reset after inspection.

Validation: 276 unit tests passed. All 79 Chromium/WebKit browser cases passed across the suite runs and
targeted reruns: the chart-spacing regression and the sandbox test's URL lookup were fixed and rechecked.
Fresh English-browser contexts verify the Thai default, stored English preference, and explicit link priority.
Offline checks verify the embedded font is loaded without external font requests. English tests now request
English explicitly. Lint, TypeScript, translation freshness and `git diff --check` passed.
The self-contained build is **1,562,787 bytes (1.490 MiB)**, below the 1.5 MiB limit. No deployment was made.
The Firefox launch limitation recorded below still applies; this follow-up does not claim a Firefox run.

## Previous review: Thai localisation

**Final result: passed locally in Chromium and WebKit.**

Scope: the complete reader interface, controls, accessible names, errors, findings, assumption explanations,
batch wording, chart labels, 3D signs and both research-document downloads. The existing English interface is
retained. This is a structured implementation walkthrough and automated review, without human participants,
real-world canteen measurements or a pilot.

The language selector is visible in the opening and simulator toolbar. An explicit `?lang=th` or `?lang=en`
overrides the saved choice; otherwise the primary browser language chooses Thai or English. Storage and clipboard
failures retain working in-memory selection and a complete document copy fallback. Changing language preserves
the paused lunch, camera, live counts, pending settings and selected research comparison. Running batches and
completed check results follow the selected language. User-entered scenario names remain literal.

### Walkthrough and corrections

| Task | Verified result |
|---|---|
| Read the opening and change the door assumption | Thai distinguishes an unclear difference from equal outcomes and preserves the unvalidated-model limitation. |
| Continue a paused simulation after changing language | Clock, camera, settings and numeric counters remain unchanged; scene signs change language. |
| Explore findings and the separate role experiment | All selected cases and estimates persist; signs, percentage-point units and intervals retain their meaning. |
| Run a batch and change language | The 150-run check completes, retains results and updates its status in both languages. |
| Download settings and research documents | JSON remains byte-identical; protocol/report match the complete selected-language files. |
| Use a narrow screen or keyboard | No page overflow at 320 px; research controls remain at least 44 px; Escape returns focus to the opener. |
| Use the self-contained app offline | Chromium opens the file with networking disabled; WebKit continues after disconnection without additional requests. |

Visual review found and fixed overlapping Thai stacked-chart categories, clipped final time labels caused by a
240 px chart minimum, and insufficient spacing between Thai direct labels. Thai stacked bars now use 0–100% axis
labels with an explicit 0% explanation in the caption; table headings and accessible descriptions retain the full
meaning. Direct labels have room for vowels and tone marks. Two missed cohort-table labels were translated.
Completed batch notices are formatted at render time so they do not retain an old language.

### Final evidence

Screenshots of the built app are under `/private/tmp/canteen-thai-20261005/`: `desktop-opening.png`,
`desktop-english.png`, `desktop-charts.png`, `phone-opening.png` and `narrow-chart.png`. Desktop CSS viewport
1280 × 1323; phone widths 390 and 320 px at 844 px height. Temporary viewport overrides were reset. Thai word
wrapping, tone marks, full control names, readable estimates and chart boundaries were inspected. The same
chart bounds and label separation pass automated checks at 320, 390 and 1280 px in both tested browser engines.

- 1,005 UI messages and 92 research prose templates; compact keys have no collisions and placeholders match.
- 276 unit tests and 181 model-sanity checks passed. The sanity suite retains the documented expected failure
  of the original median-time hypothesis; localisation does not change that scientific result.
- Final complete Chromium/WebKit suite: **79 passed**. This includes all 18 new localisation cases, existing
  golden hashes, fresh evidence reproduction, worker/fallback paths and English interface regressions.
- Lint, TypeScript, generated-translation freshness and `git diff --check` passed.
- Self-contained build: **1,547,055 bytes (1.475 MiB)**, below the 1.5 MiB limit. No external fonts or catalogues.
- Engine/configuration sources, experiment plans, generated numerical evidence, audits and golden hashes are
  unchanged. Language parity checks reproduce identical run hashes, CSV values and settings JSON. Thai reader
  documents preserve every numerical value, table row, code identifier and source link from the English files.

Firefox was attempted but failed before loading a page with `Could not find profile folder` on this Mac; Linux CI
retains Firefox, including the localisation tests, as a required check. Playwright WebKit cannot begin file/offline
navigation here, so its offline check supplies the same HTML through a route and then disconnects. Raw technical
diagnostics, identifiers and reproduction commands remain exact; their reader-facing explanations are translated.
Local checks used Node 26.10.0; CI remains pinned to Node 22. No physical-device, screen-reader or participant
certification, remote push or deployment is claimed.

## Previous review: research-only study and explanation walkthrough

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
