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

## 2026-09-26-plan-5-model-v2

- Setup: Ruling: workspace .superpowers/ excluded via .git/info/exclude (local only) — keeps scratch out of commits — cost if wrong: none.
- Setup: Ruling: design doc status line left as "draft for owner review" — the harness refused to record owner approval the owner never stated; commit f46399e is the pre-run record — cost if wrong: owner must flip the status line themselves.
- Task 2: Ruling: group-level timers (cutoff, patience/split, stand start) now carry the party index and are keyed by the party's lowest personId (people[0]) — design §2.6/§2.7 key parties that way; identical for original groups — cost if wrong: none (hashes unchanged)
- Task 2: Ruling: src/batch/findings.ts still reads w.groups[g].size/first; sizes shrink from Task 5, so Task 8 must switch it to pop.size — noted so it is not missed — cost if wrong: findings group sizes off by leavers
- Task 3: Ruling: traces 'searcher','ask','refuse','commit','sit' carry the party index (equal to the group index for original parties) — split-off parties search with their own memory and sit as their own party — cost if wrong: trace consumers keyed by group must map through parties[a].g
- Task 3: Ruling: Live keeps entranceToSeatMeanMin, now over seated diners, for the "Entrance to seat so far" counter — design §4.5 renames only the walk-away counter and the strip's P2 — cost if wrong: one counter to relabel
- Task 3: Ruling: entering split mode re-targets searchers standing at a node at once; others at their next node or at their ask's end — design §2.7 (routes wait for the next node) — cost if wrong: a few seconds of routing per split
- Task 4: Ruling: the harness test for a move-up reaching service first double-called serviceEnded — test bug, fixed in the test; production code unchanged by it — cost if wrong: none
- Task 5: Ruling: a 'door' trace (g, kind, 0) is emitted for every arrival, kind 0 = stays — lets tests recompute every verdict against the world — cost if wrong: none
- Task 5: Ruling: door leavers are removed from their party (people = [], size 0), like queue leavers — a party's people are always its active members — cost if wrong: none; metrics use pop.size
- Task 5: Ruling: dropped the plan's "at least one group stays at the door in every minute" — not a design rule; the test asserts that some groups stay and some leave — cost if wrong: none
- Task 5: Ruling: the liveness test of the all-full 5 s re-choose runs with leaving off (waitMean 60 min, CV 0, room 0) — with leaving on, the door check keeps queues from filling in that config — cost if wrong: none (the rule is unchanged)
- Task 5: Ruling: the pairMetrics cohort identity is now R = claimed + fallback + reserving groups that left at the door before trying — a door leaver never claims or falls back (design §2.2) — cost if wrong: cohort tables show fewer claimed+fallback than R
- Task 5: Ruling: Review Focus 3 and the stand-start test use 1 stall, 3.2 m queue zone, 400 people, waitCV 1.5 — found by seed search; the default-sized plan config reached no full-queue collector — cost if wrong: none
- Task 5: Ruling: the plates-without-seat check is live ≤ peak (plan wording), not equality — the peak can fall between two trace samples — cost if wrong: none
- Task 6: Ruling: the Findings tests (tests/batch/findings.test.ts, tests/ui/findings-model.test.ts) stay red until Task 8, not just the freshness checks — the Findings generator and model read the removed walk-away fields and are Task 8's scope — cost if wrong: none (Task 8 turns them green)
- Task 6: Ruling: the reserver cohort R is labelled "Reserving groups (all)" — R now includes reserving groups that left at the door — cost if wrong: label wording only
- Task 7: Ruling: the invprop light-load truncation rule also requires seat load ≤ 0.8 (people × (eat + linger) ÷ (seats × window)) — with no takeaway a seat-starved run legitimately reaches the 4 h cap with people circling — cost if wrong: a real seat-side livelock at light stall load but heavy seat load would go unflagged by that one rule (movement liveness is still checked every event)
- Task 7: Ruling: the B-only check uses seeds 1–30 directly (as the sanity suite does), not the batch-derived seeds — design §5 says "seeds 1–30" — cost if wrong: none
- Task 8: Ruling: findings.json format v2 — WalkAwayAnatomy → LeaverAnatomy (with 10-minute arrival bins), platesWithoutSeat added, TimeSplit.totalWithoutCutoffS removed (nobody's clock stops before their own food now) — cost if wrong: none
- Task 8: Ruling: the time split pairs people who ate in both runs; its total no longer equals the evidence's entrance-to-seat change (populations differ once people leave), so that cross-check was replaced by a per-person paired check in the instrumented test — cost if wrong: none
- Task 8: Ruling: Findings prose rewritten for model 2 with data-gated sentences; claims the data contradict were dropped or inverted (fallback reservers leave LESS than the same groups under free flow — a selection effect, now explained; no social-dilemma bullet; small groups leave less under reservation) and the door-view dependence (queues-only row: no clear difference) is stated in the lead, In short and How far it generalises — cost if wrong: wording only; checked against the rendered page
- Task 8: Ruling: rendered-text check done with Playwright on the installed Chrome (channel 'chrome'); Playwright's own browsers are not installed for this Playwright version — cost if wrong: none
- Task 7: GATE: B-only check PASS — B mean left without eating 16.22% (≤ 20%), mean plate 0.50 min (≤ 10), 0 truncated. A-vs-B outcomes may now be computed (design §5.5).
- Task 8: RESULT for owner: mechanism test (Reservation-friendly) median A−B +6.3 s [5.7, 6.9] (expected failure kept), mean −8.9 s [−12.1, −5.7] (passes) — same pattern as model 1; the median-vs-mean decision is still the owner's.
