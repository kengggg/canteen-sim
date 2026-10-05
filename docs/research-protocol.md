# Canteen Sim research protocol

Scope agreed 2026-10-05: simulation research only. No canteen pilot or human-participant study is planned. The main question is **when and why reservation helps or harms the whole canteen**. Model 2 remains the baseline. Alternative behaviour rules are separately versioned experiments.

## What counts as evidence

- A live animation is one simulated lunch. Repeated, paired lunches estimate variation under specified rules.
- Report leaving without eating, time carrying food, seat use, and throughput together. These outcomes can disagree; there is no prespecified weighting that turns them into one overall winner.
- Separate uncertainty across random lunches from uncertainty about the rules. The intervals address only the first.
- Outcomes have no empirical calibration. Conclusions apply to the specified artificial canteen and tested ranges. There is no claim of a best real-world policy.
- A structured walkthrough checks whether the explanations and controls support explicit reading tasks. Automated checks exercise those tasks. Neither establishes comprehension by actual readers.

## Existing baseline and sensitivity study

Model 2's defaults, original evidence and hash fixtures are retained. The [sensitivity plan](sensitivity-study-plan.md) was recorded before its 36-setting extension; the default and earlier checks were already known. All 72 comparisons remain reported. The original seed block starts at 1, with 30 lunches and 0%, 50%, 100% reservation per setting.

## Follow-up: visibility roles v1

This plan is recorded before executing the follow-up. The large visibility effect in the existing sensitivity results motivated it, so this is an exploratory mechanism study, not an independent discovery or an empirical confirmation.

Hypothesis: seeing more tables changes reservation success and the stock of unavailable tables; the seating rule at entry may translate that into more people leaving. Competing explanation: the effect mainly comes from the search after food is received. Both processes and their interaction will be tested, without assuming the hypothesis is true.

Cross the complete grid:

| Factor | Values |
|---|---|
| Claimer visibility | 10, 20 metres |
| Food-search visibility | 10, 20 metres |
| Seating threshold at the door | 3 suitable tables; 0 (ignore seating) |
| Groups reserving | 50%, 100%, each against 0% |

Use 30 fresh seeds from `batchSeeds(100001, 30)`, disjoint from the original 30. Reuse the same people and random draws across cells. A free-flow baseline depends on food-search visibility and the door rule, but not on claimer visibility: reuse only that identical baseline. This gives 480 reservation runs plus 120 free-flow runs: **600 unique runs, 16 paired comparisons**.

The engine intervention changes only which tables are observed while claiming and while searching with food. It does not change geometry, routing, table ranking, search memory, patience, the door decision or sharing. As in Model 2, giving up a reservation attempt discards that attempt's table memory; later food search starts with fresh memory. When both ranges match, runs must exactly reproduce Model 2 at that visibility. Experimental identity is recorded alongside configuration, seed, metrics and hash; a state hash alone does not identify a model. Experimental results are excluded from the live Model 2 estimates and settings codes.

Implementation clarification after execution: the initial protocol prose incorrectly said memory survived fallback. Source review and the existing fallback regression test confirm it is discarded. This wording correction changes no factor, intervention, engine rule or numerical result.

Report the same four outcomes for all 16 comparisons, plus door and queue leaving separately. Preserve exact run metrics, configurations, seeds and hashes. Use per-seed differences and the existing pointwise 95% paired t intervals. No adjustment for multiple comparisons: do not promote small isolated sign changes to policy claims. Missing or truncated runs block publication; no silent replacement seeds or dropped planned cells.

Predefined mechanism contrasts use **differences of reservation effects within each seed**:

1. Increase claimer range at each fixed food-search range and door rule.
2. Increase food-search range at each fixed claimer range and door rule.
3. Interaction: the claimer-range contrast at 20 m food-search minus that at 10 m.
4. Door amplification: each reservation effect with the seating check on minus the effect with it off.

Compute each contrast on the paired raw differences, not by subtracting interval endpoints. Publish all contrasts at both reservation levels for all four outcomes, retaining diagnostic door/queue changes too. These are causal interventions inside this simulator; they do not establish causes in real canteens.

Diagnostics: reservation success (% of admitted reserving groups), admitted/claimed/fallback group counts, mean time until a claim or fallback (among resolved attempts), and unavailable unoccupied seat-hours during the fixed arrival window. The last includes claimed-empty, held and blocked seats; occupied seats are excluded. Means of per-lunch ratios are labelled as such. Lower queue leaving may accompany higher door leaving because fewer people enter; it is not automatically an improvement.

## Reproduction and release checks

`npm run sensitivity` produces the baseline sensitivity report and exact paired audit. `npm run research` produces the separate visibility report, compact app data, and exact run/pair/contrast audit. Each records a source digest and complete executable plan. `--check` makes a fresh run and compares published artifacts; research `--from-audit` only rebuilds summaries and prose after checking provenance, and is not a fresh simulation.

Before release: verify baseline hash identity, reconstruct every summary and contrast from raw audit data, run fresh research cells with invariants, run lint/types/unit/sanity checks and browser regressions, inspect desktop and narrow layouts, keyboard navigation, uncertainty text and data downloads. Freeze code and evidence together in a local commit. Publication is a separate action.

## Structured explanation walkthrough

Check these tasks without assuming a reader already knows simulation methods:

1. Identify who reserves in A and B, and what stays matched.
2. Distinguish one animation from the repeated-lunch estimate.
3. Switch the door assumption and explain why the conclusion changes.
4. Find an interval crossing zero and interpret it without claiming equivalence.
5. Compare all four outcomes before calling a setting beneficial.
6. Distinguish Model 2 sensitivity results from the separate role experiment.
7. Explain why fewer queue departures need not mean more people eat.
8. Find the study identity, limitations, reproducible plan and results.
9. Complete the central navigation and selections using a keyboard at desktop and phone widths.

Record outcomes, defects and fixes in `docs/research-review.md`; label the review as a walkthrough with automated coverage, with no participant evidence.

## Boundaries

The selected ranges are stress tests, not a probability distribution of real behaviour. Geometry, perfect visibility within a radius, held-seat knowledge, ranking rules, eating time and most interactions remain fixed. Further experiments need a new recorded plan and version. Model 2 is not retuned to make reservation win or lose. No real pilot, recruitment, external messaging or deployment forms part of this research release.
