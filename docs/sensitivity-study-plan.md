# Model 2 sensitivity study, version 1

Recorded 2026-10-05 before running this extension. This is an exploratory study of the existing model, not empirical validation or a new confirmatory trial. The default results and the earlier 12 settings were already known. No real canteen measurements are available.

**Scope update, 2026-10-05 after this study:** the project is simulation research only, with no real pilot planned. The pre-run design below is retained as a historical record. Observation-related future work below is superseded by the [research protocol](research-protocol.md); the numerical plan and ranges are unchanged.

## Questions and design

Does the extra leaving under reservation persist when we vary uncertain behaviour and capacity assumptions? Does the seating check at the door behave differently with different crowds, patience limits or service times? Does searching together change the effect of delaying group splitting?

The executable plan is `src/batch/sensitivity-plan.ts`. It defines all scenarios before execution, deduplicates identical configurations, and includes the default in each relevant family. Every scenario uses the same 30 seeds, starting at seed 1 with the established `batchSeeds` derivation. For each seed run 0%, 50% and 100% reservation. The 0% run is reused within that scenario, never across settings. A and B have the same generated people, arrivals and random draws within each comparison. Across settings the random streams are shared but changed crowd sizes/group mixes can change the population.

| Assumption | Values tested (default in bold) |
|---|---|
| Tables that must look free at entry | 0, 1, **3**, 6 |
| Total diners | 1,200, **1,800**, 2,600 |
| Mean patience limit | 5, **10**, 15 minutes |
| Mean stall service time | 60, **90**, 120 seconds |
| Delay before splitting groups | 0, **2**, 5 minutes |
| Empty seats required to share a reserved table | 2, **4**, 6 (no sharing) |
| Search visibility | 5, **10**, 20 metres |
| Group-size weights, sizes 1–6 | [45,35,10,5,3,2], **[25,30,20,15,5,5]**, [5,10,15,25,20,25] |
| Claiming arrangement | **one claimer**, whole group together |
| Searchers with food | **one member**, all members |
| Claim search limit | 0, **60**, 120 seconds |
| Share of arrivals in the rush | 40%, **60%**, 80% |

Also cross all four door thresholds with all three crowd sizes; door thresholds 0/3 with all three patience limits and all three service times; and all three splitting delays with both search arrangements. Other inputs stay at defaults. These are deliberately broad stress-test values, not calibrated plausible ranges or probabilities. The zero claim-search limit stops choosing new targets; any existing model behaviour at that boundary remains unchanged.

## Measures and interpretation

Report all four established headline measures for every comparison: leaving without eating (% of arrivals), mean time carrying food (seconds, among people served), occupied seat-time in the pair's busiest hour (%), and peak throughput (people seated/hour). Also retain leaving at the door and leaving from queues to help explain the mechanism. All reported changes are reservation minus free flow; higher seat use/throughput is preferable, lower leaving/plate time is preferable. The two versions may serve different people, so differences in mean plate time are system outcomes, not necessarily an individual treatment effect.

Compute the mean of within-seed differences and the existing two-sided 95% paired t interval. Pairing follows the [NIST treatment of paired observations](https://www.itl.nist.gov/div898/handbook/prc/section3/prc311.htm); the interval uses the [paired difference formula](https://itl.nist.gov/div898/handbook/prc/section3/prc312.htm). These intervals describe simulated lunch-to-lunch variation under a fixed setting. They do not include model error, uncertainty about real behaviour, or uncertainty about selected ranges. An interval spanning zero means no clear difference here, not equivalence. Identical differences get an explicit no-interval label under the existing statistics convention.

Publish the entire planned grid, not only favourable rows. Intervals are pointwise and unadjusted for the many comparisons; do not count positive intervals as a probability that a policy works, or treat isolated sign reversals as confirmed discoveries. There is no single global sensitivity ranking: input ranges and combination choices are subjective. Show interactions as complete grids, because [changing one factor at a time can miss interactions](https://www.itl.nist.gov/div898/handbook/pri/section2/pri212.htm).

Drop a metric pair if either run is truncated or either value is missing; expose the retained and missing counts. Do not silently publish incomplete evidence as a complete comparison. Store exact per-pair values, seeds and both run hashes in a separate audit artifact. Check default-run hashes against the previously shipped evidence. Record model version, a digest of engine/config/statistics/study code and the complete plan; tests must fail if these drift.

## Decision rules and remaining gaps

- Preserve Model 2 and the original baseline. A sensitivity result alone will not retune defaults.
- Use weak or changing conclusions to prioritise observation. Any subsequent new ranges or rules need a separately recorded study revision and a rerun.
- This bounded design does not cover all interactions, layout changes, eating-time variation, seeing held seats correctly, occlusion, pre-arrival reservations, or alternative decision rules. Sweeping the seating threshold does not validate the assumption that every reserved table looks entirely unavailable.
- Reserve claims about a real canteen until observation can test inputs and outcomes on lunches not used for calibration. A policy comparison would then need a planned real-world evaluation; fitting this model is not evidence of a policy's causal effect.
