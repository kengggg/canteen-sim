# Implementation rulings and deferred minors

Decisions the implementer made where the spec was silent, ambiguous or contradicted by the results, and review findings graded minor and deferred. Collected from the per-plan execution ledgers (2026-09-24/25).

## 2026-09-24-plan-1-foundations

- Final: Ruling: Declined-to-judge items (schema metadata, clamp order, load readout, repair flow, cross-browser) — deferred to Plan 4 as planned — cost if wrong: none now
- Final: minor (deferred): dnormcdf uses a positive erf series, not Cody's erfc; returns 0 below z≈-8.49 (tolerance met)
- Final: minor (deferred): dmath constants exceed 17 significant digits (doubles identical)
- Final: minor (deferred): golden dmath values from NormalDist not mpmath; tail entries weak
- Final: minor (deferred): navgraph lacks a runtime N_nodes < 2^16 assert
- Final: minor (deferred): Layout stop/seat coords are pre-merge; engine must use node coords (noted for Plan 2)
- Final: minor (deferred): seat-to-seat edge, lane-count and extent tests narrower than §13.1/§13.2
- Final: minor (deferred): degenerate-layout routing test uses a blocked config
- Final: minor (deferred): Router.dist allocates per call; options recompute dist (perf, Plan 2)
- Final: minor (deferred): lint glob lacks src/batch/stats.ts; DOM import ban relies on tsconfig lib; very-large-config warning missing
- Final: minor (deferred): noSharing message wording; lexicographic sort in layout test

## 2026-09-24-plan-2-engine

- Ruling: Plan form — tasks list interfaces+tests; code written under TDD during execution — same agent/session wrote plan with spec loaded — cost if wrong: less upfront review of code shape
- Ruling: planning rulings 1-7 in plan header (deadlock fixes, learned held seats, dense order, sanity suite split, per-person stand end)
- Task 8: Ruling: pairMetrics/PairInput moved to Task 11 — needs the engine's per-group records — cost if wrong: none (same plan)
- Task 9: Ruling: engine core (world/agents/engine) was written in one piece before its rule tests; tests then written and each verified by a deliberate mutation (refusal duration, searcher choice, held seats) — the behaviours are too interlocked to grow one test at a time — cost if wrong: a rule without a biting test (mitigated by mutation checks and Task 12 invariants)
- Task 10: Ruling: spec U-turn test ('followers at adjacent mid-link nodes') is exercised at movement level with a scripted placement, since with ruling 3 engine followers that catch up wait deregistered — cost if wrong: the engine-level variant is only covered by the together-mode full runs
- Task 12: Ruling: mechanism test uses the paired MEAN food-to-seat, not the median — the model (following spec claim-target rules) gives median A−B ≈ +6.1 s but mean −7.5 s (CI −9.8…−5.2) under Reservation-friendly; the model was NOT changed to pass the test; spec §13.4 updated with the finding — cost if wrong: the owner may read reservation's per-group benefit as weaker/stronger than intended; surfaced to the user
- Task 12: Ruling: fast-check invariants with checks after every event run 200 runs in the sanity suite (8 parallel files × 25) and 3 runs in npm test — per-event full checks cost ~3 s/run — cost if wrong: slower feedback in npm test
- Task 12: Ruling: presets (src/config/presets.ts) created now (Plan 4 item) because the sanity suite needs Reservation-friendly and Crush
- Task 12: Ruling: the §13.3 invariant "truncated = false when ρ̄ ≤ 0.8" is replaced by "a light-load truncation leaves only seated diners and no pending event before the cap" — lognormal eating tails (cv up to 1) can exceed the 4 h cap without any deadlock — cost if wrong: a real deadlock among seated diners would be missed (none can occur: seated diners have pending eat/stand events)
- Final: Ruling: I4 spec §13.4 median→mean edit — reverted the normative text to the owner's median wording; the median test is a documented expected failure (test.fails) and the mean is a supplementary check; the model was not changed — needs the owner's explicit decision — cost if wrong: the one neutrality guard reads as unresolved until the owner decides
- Final: Ruling: regraded M5 (limit-0 claimer steps onto an edge before falling back) to Important and fixed — A-only waste, a fairness asymmetry — 'claim limit 0 … falls back at once' RED→GREEN
- Final: Ruling: added §13.1 all-full re-choose (5 s) and zero-settings engine tests (M8 partial) — spec-listed tests were missing
- Final: Ruling: declined-to-judge items (model outcomes, Plan 1/3 code, view presentation, sitTimes array, stateHash subset, pairMetrics arg, presets early, split-feasible pct, ask-at-claimed wording, ruling-3 test level, precompute memory) accepted as the reviewer set them aside — cost if wrong: none now
- Final: minor (deferred): search.parallel keeps searching (and new fed members join) after the patience timer while asks are pending (identical in A and B)
- Final: minor (deferred): a waiter re-planned onto the same edge-direction goes to the back of its FIFO
- Final: minor (deferred): 'fallback discards memory' test cannot tell old memory from new; busy-node invariant only checks non-negative counts; valid joiners checked via joinedTable only
- Final: minor (deferred): standing-with-food counts node waits (WAIT_FOOD, TRAY_WAIT) only, not food-holders in movement FIFOs

## 2026-09-24-plan-3-batch

- Ruling: Plan form as Plan 2 (interfaces + tests; code under TDD in task)
- Task 2: Ruling: setting metadata table (src/config/meta.ts, a Plan 4 item) created here — sweeps need ranges/steps — cost if wrong: none
- Task 5: Ruling: % metric differences are worded in 'percentage points' — '2.7 % better' is ambiguous (relative vs absolute) — cost if wrong: wording only
- Task 6: Ruling: evidence stores catalogue metrics at 7 significant digits in a columnar JSON (122 KB vs the spec's ≈60 KB estimate); hashes are exact — cost if wrong: evidence panel figures differ from a fresh run in the 7th digit
- Final: Ruling: regraded minor→important and fixed: headline grammar (F6), CI bounds printing 0 (F7), hidden-tab CPU spin (F8), sweep range/duplicate checks (F9) — all visible to every user of the evidence line or a sweep — cost if wrong: small extra work
- Final: Ruling: crowd.windowStart stays out of the sweep picker — every time is relative to the window start, so a sweep over it returns identical lunches — cost if wrong: one fewer (useless) sweep option
- Final: Ruling: declined-to-judge items (calibration/ETA/progress UI, pool size from hardwareConcurrency, browser worker equivalence, serviceMean shortcut, clamp order, evidence size, percentage-points wording, engine internals, CSV comment lines, pair-row advantage columns, transferables) — Plan 4 or accepted as-is — cost if wrong: none now
- Final: minor (deferred): pool has no per-job watchdog for a worker that answers ping then hangs; cancel does not terminate in-flight workers; finish() not idempotent
- Final: minor (deferred): a sliced slice can overrun 12 ms (createEngine outside the budget; one step(500))
- Final: minor (deferred): winCounts counts a NaN advantage as a tie while pairedStat drops it
- Final: minor (deferred): per-level truncation count is not the union with its baseline
- Final: minor (deferred): cancel tests cover only the sync executor
- Final: minor (deferred): catalogue lacks shareFree, visit median/p90 and the splitFeasible/servedAfter percentages
- Final: minor (deferred): too-few-lunches template shows a signed mean (as specified)

## 2026-09-24-plan-4-app

- Ruling: Plan form as Plans 2-3
- Ruling: fonts — system-ui stack (spec §14 forbids external requests, which outranks the artifact-design suggestion to use Google Fonts)
- Ruling: every export (CSV, JSON, settings code) offers Copy as well as Download — the artifact sandbox blocks downloads
- Task 4: Ruling: walked-away figures are drawn translucent for their whole walk-away (spec: 'last 3 s') — the engine does not expose time-to-exit — cost if wrong: cosmetic
- Task 4: Ruling: edge-FIFO waiters are drawn standing back from the node opposite to the edge they want (the view has no incoming edge) — cosmetic
- Task 8: Ruling: Firefox golden run unverified on this machine — Playwright's Firefox build fails to launch on macOS 27 ('Could not find profile folder', also after a forced reinstall and without the sandbox); Chromium and WebKit match the Node golden hashes — cost if wrong: a Firefox-only determinism difference would go unnoticed until run elsewhere
- Final: Ruling: regraded and fixed minors that users hit: Restore no-op, locale in chart axes (unit test), batch estimate ×18, scenario delete refresh, Escape/Space/modal focus, error banner code + copy fallback, Copy link in viewer, Play/slider during a batch, drawer covering the top bar (blocked switching drawers), follow scan cost — cost if wrong: extra work only
- Final: Ruling: declined-to-judge items (sim/batch internals, Firefox, cosmetic renderer rulings, other-model codes applied with a notice per §9.4, viewer sandbox flags, frame-rate targets, URL hash not live-updating, phone bar height, ring colour mapping, hidden-tab paused label, seed wrapping) accepted as set aside
- Final: minor (deferred): re-run check result is lost if the drawer is closed while it runs
- Final: minor (deferred): camera select shows Top-down while a layout change resets the orbit to 3/4 (partly addressed: setup re-applies the mode)
- Final: minor (deferred): 'Searching with food' and 'Walking' are close under simulated deuteranopia in the light theme (ΔE ≈ 6.6); no automated CVD check
