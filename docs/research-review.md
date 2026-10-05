# Research and release review — 2026-10-05

This is a simulation research release for a general audience. It asks when and why reservation helps or harms the whole canteen. There is no real pilot, empirical calibration, participant recruitment or human comprehension study. This review combines source inspection, a structured explanation walkthrough, browser interaction checks and automated tests.

## Thai localisation addendum

The interface and its protocol/complete-results downloads now support Thai and English. The Thai documents
are generated from the English originals through a separate prose catalogue; checks preserve every number,
table row, code identifier and source link. Model 2, the separate experiment, all numerical evidence and their
identities remain unchanged. Neither translation nor interface checks add empirical validation.

The localisation walkthrough checks both door-rule explanations, uncertainty, benefit/harm directions,
research selections, language changes during a paused lunch or running batch, numerical export parity,
downloads, blocked storage/copying, narrow layouts and keyboard navigation. Final local checks passed:
276 unit tests, 181 model-sanity checks and all 79 Chromium/WebKit browser cases. Firefox could not launch
on this Mac and remains required in Linux CI. See [the current design review](../design-qa.md) for screenshots,
corrections, build size and exact verification limits. The prior numerical study and review below remain intact.

## Research conclusions

The original Model 2 baseline is retained. Its 36-setting sensitivity study contains 3,240 runs and all 72 planned comparisons. The separately versioned `visibility-roles-v1` follow-up contains 600 unique runs, 16 comparisons and 28 predefined contrasts on 30 fresh seeds. It isolates the two roles previously changed together by one visibility setting.

At 100% reservation, with the seating check on and the other role held at 10 m:

| Intervention | Change in the reservation leaving gap, pp | Pointwise 95% interval |
|---|---:|---:|
| Claimer visibility 10→20 m | +16.23 | +15.292 to +17.159 |
| Food-search visibility 10→20 m | +0.38 | −0.114 to +0.884 |

This supports the claimer-range mechanism inside the simulator. It does not establish a real-world cause or a general absence of food-search effects: at 50% reservation, the food-search contrast is +0.59 pp [0.227, 0.953], alongside a larger claimer contrast of +5.35 pp [4.902, 5.804]. The full grid and interactions are retained.

With both ranges at 20 m and 100% reservation, the leaving gap is +20.94 pp [19.981, 21.898] with the seating check on, and −0.04 pp [−0.144, 0.074] with it off. In the first case, door leaving rises by 33.44 pp while queue leaving falls by 12.50 pp. Lower queue abandonment alone would misrepresent the whole-canteen outcome. With the seating check off, reservation still adds 20.71 seconds carrying food [18.269, 23.146] and reduces peak seat use by 1.27 pp [−1.476, −1.073].

An outcome can improve while others worsen. With only claimers at 20 m and the seating check on, plate time falls by 1.45 seconds [−2.108, −0.796], while leaving rises by 21.07 pp [20.108, 22.031]. There is no single score or prespecified utility weighting that makes one policy the overall winner.

Intermediate diagnostics show more successful claims and more unavailable empty seat-time with wider claimer visibility. Those summaries are not a formal mediation analysis. The experiments intervene on model rules, and all confidence intervals describe simulated lunch variation, not model accuracy. Ranges are uncalibrated and intervals across the exploratory comparisons are unadjusted.

## Explanation walkthrough

These are task-based checks by the developer/agent, not observations of participants. “Pass” means the information or interaction is present and works; it is not evidence that a general reader understood it.

| Reader task | Evidence / expected interpretation | Result |
|---|---|---|
| Identify A, B and the matching | Opening names table-first versus food-first; the same crowd is replayed | Pass |
| Separate one animation from the estimate | “Each animation shows one lunch”; built-in estimates name 30 lunches and current reservation level | Pass |
| Change the door assumption | Queues-only opening changes to “No clear difference” and loads the matching simulation | Pass |
| Read uncertainty correctly | Interval explanation distinguishes random-lunch variation, rule uncertainty and equivalence | Pass |
| Judge all four outcomes | Both explorers show leaving, food-carrying time, seat use and throughput with directions explained | Pass |
| Distinguish baseline and experiment | Separate experiment/version label; role controls do not change live Model 2 settings | Pass |
| Understand door versus queue leaving | Selected result shows both deltas and explains why fewer queue departures can accompany worse access | Pass |
| Discover and reproduce the study | Findings section jumps, downloadable/copied protocol and complete report, exact audits in the repository | Pass |
| Use keyboard and narrow layouts | Focus returns on close; select Escape does not close the drawer; 320/390 px layouts fit; wide tables keep scroll regions | Pass |

## Defects found and resolved

- Closing Findings discarded keyboard focus. It now returns to the opening control; section jumps focus their headings.
- Escape on a native select could dismiss the entire drawer. Selects now retain their native dismissal behaviour.
- A changing batch-progress row could move Cancel during a click. A two-column grid anchors Cancel independently of the progress text.
- WebKit rendered the new selects at 22 px despite `min-height`. An explicit 44 px height fixes the touch target, verified by the browser test.
- The initial protocol prose incorrectly said reservation memory survived fallback. Source and the existing fallback test show it is discarded. Corrected the explanation and recorded the correction in the protocol; no numerical plan or rule changed.
- The old observation pilot was removed from the active app and replaced with the research protocol. Earlier design-review entries remain dated historical records.

## Verification

| Check | Observed result |
|---|---|
| Full sensitivity generation after adding the research hook | 3,240 complete runs; default hashes agree with shipped evidence |
| Research generation | 600 complete runs; every planned comparison/contrast retained |
| `npm run research -- --check` | Fresh 600-run replay exactly reproduced all published research artifacts |
| Unit suite | 265 tests, 50 files passed |
| Sanity suite | 181 checks, 14 files passed, including one documented expected failure described below |
| Audit reconstruction | Every sensitivity/research summary reconstructs from exact pairs; contrasts retain within-seed covariance |
| Browser suite | 61 distinct Chromium/WebKit cases covered across the full run and targeted rerun; 58 passed initially, then all 18 affected cases passed after fixes/rebuild |
| Cross-browser determinism | Chromium and WebKit agree with Node golden hashes, including worker execution |
| Final research downloads | Protocol and complete report byte-match the repository in Chromium and WebKit |
| Benchmark | A100 median 360 ms / 377,414 events; B median 226 ms / 345,239 events; budget passed |
| Responsive visual check | Connected Chrome at desktop, 390 px and 320 px; no page/drawer overflow; existing type/colour/layout tokens retained |

The sanity suite intentionally retains an expected failure from the original specification: in the reservation-friendly preset, the claimed-group median food-to-seat difference is **+6.3 seconds [5.7, 6.9]**, contradicting the hypothesised decrease. The supplementary mean difference is **−8.9 seconds [−12.1, −5.7]**. A green suite records that known contradiction; it does not validate the contradicted hypothesis. Model 2 was not changed to make it pass.

The full browser pass encountered a moving Cancel target, WebKit's small native select, and a protocol download built before the wording correction. The first two were fixed; the corrected protocol was rebuilt. The affected research/review suites then passed all 18 cases. The remaining 43 distinct Chromium/WebKit cases had passed and their functional paths were unchanged by those fixes.

Firefox could not launch on this macOS installation (`Could not find profile folder`), including a retry with `/private/tmp`. No Firefox pass is claimed. Linux CI now runs the full Chromium suite and determinism/story/sensitivity/research flows in Firefox and WebKit before deployment. Those workflow changes have not run remotely because this work has not been pushed.

Lint, type checks, the single-file build and diff hygiene are required alongside the checks above. The visual evidence and final build size are recorded in [design-qa.md](../design-qa.md). The full sensitivity `--check` was not repeated after its fresh generation; audit reconstruction, baseline replay and first-seed replays cover that study. Real-device Safari, screen-reader certification and participant comprehension remain unmeasured.

## Reproduction and handoff

Start with [research-protocol.md](research-protocol.md), [complete sensitivity results](studies/model-2-sensitivity.md) and [visibility roles results](studies/visibility-roles-v1.md). Exact audit files sit beside each report; compact app evidence lives in `src/generated`.

Run `npm ci`, `npm run dev`, then open Findings → Investigate visibility. For verification, use the commands in README. Equal visibility ranges reproduce Model 2 exactly, including the zero claim-time boundary; changing claimer range cannot change a 0%-reservation run. Model 2 settings and production UI do not activate the research-only engine option.

This is a local research handoff. No remote push or deployment, real pilot or participant review was performed. Future rule changes need a new experiment identity and recorded plan; an empirical claim would require evidence outside this project’s current scope.
