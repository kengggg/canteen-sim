# Model v2: Plates Stay, People Leave Before Food — Design Spec

- **Date:** 2026-09-26
- **Status:** draft for owner review. Once approved and committed, §2, §3 and §4.1 are **frozen** (§5).
- **Amends:** [`2026-09-24-canteen-sim-design.md`](2026-09-24-canteen-sim-design.md) (v3), called *the main spec* below.
  "Main §5.7" means section 5.7 of the main spec. On implementation the main spec is updated to v4 to match; this
  document stays as the frozen record.
- **Model version:** 1 → 2.
- **Scope:** sub-project 1 of 3. The others, planned separately, are the page's persuasion and clarity, and polish
  and speed (§8).

---

## 0. Summary

Two behaviour changes, identical in canteens A and B:

1. **Food comes on a plate and can't leave the canteen.** Anyone holding food keeps searching until seated. A group
   that has circled for 2 minutes accepts a table that seats only some of its members.
2. **People may leave before getting food:**
   - at the door, after looking at the queues and the seating;
   - while queuing, once they have waited longer than their group's limit.

The old walk-away rule (main §5.7: search for 5 minutes with food, then leave with a takeaway) is removed. The
headline measures change to match (§4.1). They are fixed before any A-vs-B run of the new model (§5).

## 1. Why

The owner's observations (2026-09-26):

- Stall food is served on plates that can't be taken away. Nobody leaves holding food: they walk around until they
  get a table.
- People who give up do it before buying, by looking at the queues and at how full the seating looks.

---

## 2. Rules (normative)

### 2.1 Each group's patience

- **New stream** 12 `leave`, key `groupId` (main §8.2). Its percentile `u(leave, groupId)` sets both limits below.
- **Wait limit `L_g`** (ms):
  - lognormal as in main §8.4, with mean `leave.waitMean` and CV `leave.waitCV`;
  - converted as a drawn duration, `max(1, Math.round(seconds·1000))`;
  - at the defaults (10 min, 0.5), 90% of groups fall between about 4.1 and 19.5 minutes.
- **Room needed `R_g`** (tables):
  - `R_g = 0` when `leave.roomNeeded = 0`, which turns the seating check off;
  - otherwise `R_g = max(1, Math.round(leave.roomNeeded · waitMeanMs / L_g))`, with
    `waitMeanMs = Math.round(leave.waitMean·1000)`;
  - so a group willing to wait half as long needs twice the room. With `leave.waitCV = 0`, `R_g = leave.roomNeeded`.
- **The same in both canteens.** The draw is keyed by group, so each group has the same limits in A and B, and
  A ≡ B at 0% still holds (main §13.5).
- **Fixed for the visit.** Every member uses the group's limits, including sub-parties after a split (§2.6).

### 2.2 At the door

The check runs in the group's arrival event (main §8.5 kind 5), before any stall choice, claim search or other
decision.

- **Queue check.** It fails when `min over stalls s of (queueLength_s · serviceMeanMs) > L_g`.
  - `queueLength_s` is as in main §5.2: people in the stall's slots, including the one being served, plus people who
    have chosen the stall and not yet reached their slot.
  - `serviceMeanMs = Math.round(stalls.serviceMean·1000)`. People know the average service time, not individual ones.
- **Seating check** (only when `R_g > 0`). It fails when fewer than `R_g` tables **look like a fit** for the group's
  size `n`.
  - A table looks like a fit when it has **no object** and at least `n` of its seats have **nobody sitting** (seat
    state not `occupied`).
  - A seat `held` for someone looks empty, as it does to searchers (main R11). A table with an object looks fully
    taken, whatever its seat states.
  - The whole hall is judged at a glance, not only tables within `search.visibility`.
- **Leaving at the door.** If either check fails, the whole group leaves:
  - every member counts as *left without eating*, at the arrival ms;
  - the reason is recorded as *queues*, *seating* or *both*;
  - they walk from the entrance node to the exit at `move.walkSpeed` and are removed.
- **Entering.** Otherwise the group enters as today (main §5.2–§5.4).
- **Reservers.** A reserving group in A is checked like any other group, before it claims. A group that leaves at the
  door never claims a table.

### 2.3 While queuing

**Queue start.** A person's queue start is the ms it **first** reaches a stall walkway stop during its visit, either
after choosing a stall or because every stall was full (main §5.2). The walk from the entrance does not count.

**The timer.** A kind-7 **queue-leave timer**, keyed by personId, fires at `queueStart + L_g`. At that ms:

| The person is | What happens |
|---|---|
| being served, or done being served | nothing |
| standing in a slot, or waiting at a walkway stop | it leaves the queue at once |
| walking in to its slot, or moving up | the leave is **deferred** to the end of that leg (the kind-4 event that ends it). If the leg brings it to position 1, service starts as usual and the leave is cancelled. |
| walking on the aisle graph between walkway stops (a re-choice after all stalls were full) | it leaves at once: its `queueLength` count is released, and it re-plans to the exit under main §4.2 rule 8 |

**Leaving the queue**

- Its position empties at the leave ms. The people behind move up (main §5.2 *Moving up*), and `queueLength_s`
  drops by one.
- It walks back along the walk-in path of its current slot to the stall's walkway stop, then to the exit, all at
  `move.walkSpeed`, and is removed. It carries nothing, so it skips the tray return.
- It counts as *left without eating* (from a queue) at the leave ms.

**Only that member leaves.** The rest of the group carries on as a smaller group, of `n − 1` people, from the
leave ms:

- a seat held for the leaver by an earlier commit is released at the leave ms;
- a searcher that has not committed re-targets for the smaller size at the leave ms (the route changes under main §4.2
  rule 8);
- if no member remains, the group is gone.

**Nobody leaves** once their service has started, or while holding food.

### 2.4 Reservers

In A, the rules of §2.2 and §2.3 apply to reserving groups too, whether or not they have claimed a table.

- **The table stays claimed** while any member of the claiming group remains inside and has not left.
  - *Complete* (main §5.6) now means that every remaining member has started sitting.
  - Assigned seats and fill order (main §5.4 point 7) are unchanged; they cover only remaining members.
- **Collecting the object.** When the leaver is the **last remaining member** of a group whose table is claimed, it
  does not walk straight to the exit. Instead:
  1. it walks at `move.walkSpeed` to the claim node, the access node where the object was placed;
  2. it picks up the object: a 3,000 ms action under main §4.2 rule 7;
  3. the table becomes unclaimed at the pick-up end;
  4. it walks to the exit and is removed.
- **Claim searches are unchanged.** A claimer is not queuing, so its queue-leave timer can only start once it reaches a
  walkway stop after claiming or falling back.
- `together` mode follows the same rules after dispersal.
- Main §5.4 point 10 (*no walk-away after a claim*) is replaced by this section.

### 2.5 No takeaway

- **Removed:** main §5.7, together with the patience timer, walking away with food and the takeaway at the tray
  return. The `search.patience` setting is removed.
- **Also removed:** main §5.3 point 6, and the patience lines in main §5.4 point 9 and §5.10. Their clock start now
  drives the split (§2.6).
- **Searching until seated.** A free-flow searcher searches (main §5.5) until it commits. Groupmates with food wait at
  their stall's walkway stop (main R6), or search with `search.parallel` on, until they have seats.
- **Everyone served sits.** Every person who is served eventually sits, eats, returns a tray and exits (main §5.8).
  The 4-hour cap (main §5.1) stays as the safety net.

### 2.6 Splitting after circling

**Split clock**

- It starts when the party's search starts: at the searcher's service end, or at the later of that and the fallback
  ms after a fallback. This is the old patience start (main §5.4 point 9). With `search.parallel` it starts at the
  first member's food.
- At `searchStart + search.splitAfter`, a kind-7 **split timer**, keyed by the party's lowest personId, puts the party
  into **split mode** if it has not committed.
- With `search.splitAfter = 0`, a party is in split mode from the start of its search.

**Suitable tables in split mode** (as remembered, and not refused), for a party of `n`:

| Table | Suitable when |
|---|---|
| Unclaimed | observed-empty seats ≥ `min(n, 2)` |
| Claimed | `seatedCount ≥ 1` and observed-empty seats ≥ `max(m, reserve.shareMinEmpty)`, where `m = min(n, reserve.shareMaxParty)` |

**Target in split mode**

- Maximise `room`: `min(observed-empty seats, n)` for an unclaimed table, or `m` for a claimed one.
- Then the lower distance (main §5.5), then the lower table id, then the lower node id.
- `search.emptyTableDetour` does not apply in split mode.

**Arrival check in split mode.** This is main §5.5 with these changes, where `f` is the number of seats neither
occupied nor held:

1. **Unclaimed, nobody seated.** If `f ≥ min(n, 2)`, commit `m = min(n, f)` seats.
2. **Unclaimed, someone seated.** Ask (5,000 ms). At the ask's end, commit `m = min(n, f)` if `f ≥ min(n, 2)`.
   Otherwise the party is turned away, and the table is refused for 180,000 ms.
3. **Claimed.** Ask. At the ask's end:
   - if the table is now unclaimed, apply rule 1 without a second ask;
   - if every main §5.6 condition holds for a party of `m = min(n, reserve.shareMaxParty)`, commit `m` seats;
   - otherwise the party is turned away.

**Who sits.** When `m < n`:

- The sub-party is filled in this order, up to `m`:
  1. the searcher;
  2. members holding food, by ascending service-end ms, then person id;
  3. members without food, by ascending person id.
- Seats are chosen with main §5.5's keys over `m`-subsets, including the searcher's own-seat rule.
- Members without food walk to their seat when served, as today.

**The rest of the group**

- The other `n − m` members become a new party at the commit ms. It is already in split mode and keeps the same `L_g`
  and `R_g`.
- If any of them holds food, the one with the earliest service end (then the lowest person id) becomes its searcher at
  the commit ms. Its fresh search starts where it stands, at its walkway stop.
- Otherwise its searcher is the first of its members to be served.
- With `search.parallel`, remainder members that were searching keep searching with the shared memory.
- The remainder can split again. A party that commits seats for all its members stops splitting.

**Who never splits:** a reserving group with a claimed table.

**Metrics** count sub-parties as parts of their original group (§4).

### 2.7 Event order and re-planning

Amends main §8.5 and §4.2 rule 8.

- **Kind 1** (action completions) adds the **pick-up end**, when the table becomes unclaimed.
- **Kind 3** (node arrivals) covers arriving at the claim node, which starts the pick-up.
- **Kind 4** (queue events) adds the **deferred queue leave** at the end of a walk-in or move-up (§2.3). A service
  start at position 1 takes precedence and cancels it.
- **Kind 5** (group arrivals) runs the door check (§2.2) first.
- **Kind 7** (timers) loses *patience* and gains:
  - the **queue-leave timer**, keyed by personId;
  - the **split timer**, keyed by the party's lowest personId.
- **Re-planning** (main §4.2 rule 8). A queue leave, a split, and a re-target after a groupmate leaves are all
  re-plans.
  - These take effect at the event ms: the leave count, the `queueLength` release, the held-seat release and split
    mode.
  - Only the route waits for the next node or walkway stop.

---

## 3. Settings and defaults

Amends main §9.1.

| Group | id | Default | Range | Step | Notes |
|---|---|---|---|---|---|
| Leaving | `leave.waitMean` | 10 min | 0.5–60 min | 0.5 min | average wait limit (§2.1) |
| | `leave.waitCV` | 0.50 | 0–1.5 | 0.05 | spread of wait limits; 0 = everyone the same |
| | `leave.roomNeeded` | 3 | 0–20 | 1 | tables that must look like a fit, for a group with the average limit; 0 = no seating check |
| Movement & search | `search.splitAfter` | 2 min | 0–30 min | 0.5 min | 0 = willing to split as soon as the search starts |

- **Removed:** `search.patience`.
- **Internal units** are seconds, as for every duration: `waitMean = 600`, `splitAfter = 120`.
- **Sweeps.** All four are scalar settings, available in the sensitivity sweep (main §10.2).
- **Validation** (main §9.2) is unchanged. The block on groups larger than one table stays, because a group still
  looks for one table first.
- **Loading.** Settings codes, links and JSON with `m = 1` load with the existing model-version notice (main §9.4).
  `search.patience` is ignored as an unknown key, and the new settings take their defaults.
- **Presets** (main §9.3): the overrides are unchanged.

---

## 4. Metrics

Amends main §7.

### 4.1 Primary endpoints (frozen)

| # | Endpoint | Definition | Better |
|---|---|---|---|
| P1 | **Left without eating %** | People who left at the door or from a queue ÷ actual arrivals × 100 | lower |
| P2 | **Time carrying a plate** | Mean, over every person with a service end, of (sit start − service end), in minutes | lower |
| P3 | **Peak seat utilization** | Unchanged (main §7.2) | higher |
| P4 | **Peak throughput** | Unchanged (main §7.2) | higher |

- **The comparison is unchanged:** the default reservation sweep at 100% vs 0%, with 95% uncorrected intervals over
  30 lunches.
- **Seated diners** = arrivals − left without eating (an invariant). The count is shown beside P1, with no interval.
- **Why P2 changed.**
  - Under *entrance to seat or give up*, door leavers would count as about 0 minutes each. A canteen that turns more
    people away would then look faster.
  - With no takeaway, every served person sits, so P2's population loses nobody.
  - It measures the plate rule's cost directly, and it credits reservers' straight walk to their table.

### 4.2 Secondary

Changes to main §7.3.

- **Time carrying a plate, median and p90.** These replace food-to-seat-or-give-up.
- **Entrance to seat, seated diners** (mean, median, p90). This replaces entrance-to-seat-or-give-up.
- **New: most people holding food without a seat at once.** The peak of the count of people who have food and have no
  committed or assigned seat. Lower is better.
- **New: groups that split.** Of the groups with at least one member served, the % with at least one split commit.
  Lower is better.
- **Seat search time (with food).** Per group, from the first searcher's service end to the commit that seats its
  last member.
- **Unchanged:** queue wait, seats blocked while needed, and whole-run seat utilization.

### 4.3 Diagnostics

Changes to main §7.4.

- **Added:**
  - left at the door, as a count and a % of arrivals, split by reason (*queues*, *seating*, *both*);
  - left from a queue, as a count and a %;
  - objects collected by a returning member (A only).
- **Removed:**
  - split-feasible walk-aways, including every `splitFeasible*` CSV column;
  - `walkAwayServedAfterDecision`.
- Every other diagnostic is unchanged.

### 4.4 Breakdowns

Amends main §7.5. These substitutions apply both by group size and by reserver cohort:

| Old | New |
|---|---|
| walk-away % | left without eating % |
| mean entrance-to-seat-or-give-up | mean entrance to seat (seated diners) |
| mean food-to-seat-or-give-up | mean time carrying a plate |

### 4.5 Live counters and the difference strip

Amends main §7.6.

- **"Walk-aways so far"** becomes **"Left without eating so far"**, with the door and queue counts shown separately.
- **Provisional strip values:**
  - P1 = left so far ÷ arrivals so far × 100;
  - P2 = the mean, over people served by now, of (sit start, or *now*) − service end;
  - P3 shows `—` until done;
  - P4 is unchanged.
- The time series are unchanged.

### 4.6 CSV and RunMetrics

Column names change with the metrics, and removed metrics lose their columns. The implementation plan fixes the
names.

---

## 5. Fixed before running (protocol)

1. **Freeze.** When the owner approves this document, it is committed. From that commit, §2 (rules), §3 (defaults)
   and §4.1 (P1–P4) are frozen. The commit is the record.
2. **No A-vs-B outcomes until the B-only check passes.** Until then, nobody computes an A-vs-B outcome of model 2:
   - no precompute;
   - no findings run;
   - no batch in the page;
   - no mechanism test;
   - no printed A-vs-B metric.

   Still allowed:
   - rule tests and invariants that run canteen A, since they check rules, not outcomes;
   - model-sanity checks that assert a fixed expectation for each canteen on its own: termination, small crowd, no
     leaving, crowd size (§7.3);
   - determinism and speed checks: hashes, event counts and timings.
3. **The B-only check.** It runs after implementation: default settings, seeds 1–30, 0% reserving (canteen B alone).
   It passes when:
   - the mean over seeds of P1 is ≤ 20%;
   - the mean of P2 is ≤ 10 minutes;
   - no run is truncated.
4. **If it fails:**
   1. stop, and give the owner the B-only figures;
   2. agree new defaults together;
   3. record the change and its reason in the decisions log (§9);
   4. commit the new defaults (a new freeze) before any A-vs-B run.
5. **Once it passes:** regenerate the evidence and the findings, and report the results to the owner, whatever they
   show. The headline is P1–P4 at 100% vs 0%.
6. **Later changes.** If a rule must change after A-vs-B results have been seen, the decisions log records the change,
   its reason and the results that prompted it. The earlier results stay on record.

---

## 6. Knock-on changes

### 6.1 Assumptions ledger

Amends main §15.

**Removed**

- *Free-flow groups never split…* (it was under *helps reservation*).
- *Fixed patience.* (it was under *neutral*).

**Added**

- **Built in — helps reservation**
  - Free-flow groups circle for 2 minutes before splitting across tables (`search.splitAfter`). A group with a claimed
    table never needs to.
  - People circling with plates don't make the hall look fuller from the door. Canteen A has more of them.
- **Built in — helps free flow**
  - From the door, a table with an object looks fully taken, even when its group is seated and the table is open to
    small parties.
  - From the door, seats held for groupmates look empty. Free flow holds more seats this way.
- **Neutral — identical in A and B**
  - Each group's wait limit and room needed come from one draw, fixed for its visit.
  - Waits are estimated as people in the queue × the average service time.
  - Plates can't be taken away: nobody leaves once being served or holding food.
  - Groupmates queuing at different stalls give up separately.

### 6.2 Presets

- The overrides are unchanged.
- Reservation-friendly is still meant to be reservation's best case. Its mechanism test (main §13.4) compares A and
  B, so it re-runs only after the B-only check passes (§5).
- Its result goes to the owner together with the pending median-vs-mean decision.

### 6.3 Findings data and panel

Amends main §10.8, §10.9 and §11.13.

**Data**

- *Walk-away groups classified when they gave up* is replaced by **who left without eating, where and why**, per level:
  at the door (*queues*, *seating*, *both*) or from a queue.
- New: **people holding food without a seat, per minute**, per level.
- Kept:
  - empty tables per minute;
  - claims by arrival time;
  - the busiest-hour seat split;
  - where the time goes, over seated diners.

**Robustness rows**

- Removed: *Searcher gives up after 10 minutes*.
- Added:
  - *Patient crowd (wait limit 15 min)*;
  - *Impatient crowd (5 min)*;
  - *Groups split after 5 min*;
  - *Queues only at the door (no seating check)*.
- That makes 12 rows in total.

**Panel.** Every sentence template is revised so that it is true of model 2: for example the walk-away wording, and
*"A group that secures a table never walks away."* The layout and the story stay as they are, because the redesign is
sub-project (a).

**Evidence line.** The P1 sentence says *left without eating*.

### 6.4 Visuals and labels

Amends main §11.6.

- **Colour class.** *Walked away* becomes **Left without eating**. It covers door and queue leavers from the leave ms
  until they exit, fading out, including a member collecting an object. Precedence is unchanged.
- **Removed:** the sentence about walk-away members without food.
- **Hover-card states added:**
  - *Left: queues too long*;
  - *Left: no room in sight*;
  - *Left: waited too long in the queue*;
  - *Collecting the object*;
  - *Searching with food, willing to split*.
- **Settings drawer.** A new *Leaving* group holds the `leave.*` settings. `search.splitAfter` goes under *Movement &
  search*.
- **Labels.** Help texts for the new counters and settings live in `src/ui/labels.ts` and the setting metadata.

### 6.5 Stored results

- `MODEL_VERSION` becomes 2.
- After the B-only check passes, these are regenerated:
  - the evidence (150 runs);
  - the findings data;
  - the golden hashes;
  - the bench baseline.

---

## 7. Testing

Amends main §13.

### 7.1 Rule tests

- **Door**
  - The queue-check boundary: the group stays when the estimate equals `L_g` exactly, and leaves at `L_g + 1`.
  - Seating-check counts: an object makes a table not a fit, a held seat looks empty, and an occupied seat is taken.
  - `roomNeeded = 0` turns the check off.
  - The reason is recorded.
  - Reservers are checked before claiming.
  - Door leavers walk from the entrance to the exit.
- **Queue leave**
  - The timer fires at `queueStart + L_g`.
  - Nothing happens once service has started.
  - The leave is immediate from a slot or a walkway stop.
  - It is deferred during a walk-in or move-up, and cancelled when that leg reaches position 1.
  - The people behind move up, and `queueLength` drops.
  - The leaver skips the tray return.
  - A seat held for the leaver is released.
  - The searcher re-targets for the smaller size.
- **Reservers**
  - The table stays claimed while a member remains.
  - The last member collects the object (walk, 3 s pick-up, unclaimed at the pick-up end), then exits.
- **No takeaway**
  - Nobody with food ever reaches the exit without a sit start.
  - No patience timer is ever scheduled.
- **Split**
  - The timer fires at search start + `splitAfter`, and `splitAfter = 0` works.
  - Split-mode suitability and targeting: room first, then distance.
  - Arrival checks 1–3.
  - Who sits.
  - The remainder is in split mode, with its searcher.
  - The `search.parallel` variant.
  - Claimed groups never split.
- **Settings.** Model-1 codes load with the notice, and `search.patience` is ignored.

### 7.2 Invariants

Amends main §13.3.

- *arrivals = seated diners + walk-aways* is replaced by **arrivals = seated diners + left without eating**.
- **Added:**
  - nobody exits holding food;
  - at done, every person with a service end has a sit start;
  - no seat is held for a person who has left;
  - a claimed table's group has a remaining member, or its last member is collecting the object;
  - no two people share a queue position.

### 7.3 Model sanity

Amends main §13.4.

- **Termination.** Seeds 1–30, A at 100% and B, at the defaults **and in every preset**: `truncated = false` and
  exited = arrivals. If a preset truncates, report it to the owner. Don't change rules or defaults to make it pass.
- **Small crowd.** `totalPeople = 100` with `leave.waitCV = 0`: nobody leaves without eating, and *seats blocked while
  needed* ≤ 1%.
- **No leaving.** This replaces *maximum patience*. At the defaults, with `leave.waitMean = 60 min`, `leave.waitCV = 0`
  and `leave.roomNeeded = 0`, A at 100% and B: nobody leaves without eating.
- **Crowd size.** The same test as before, on the *left without eating* count.
- **Wait limit.** `leave.waitMean` 5 vs 15 min, B only, seeds 1–30: more people leave without eating at 5 min in
  ≥ 25 of 30 seeds.
- **Little's law.** People who reached a slot and left before service count until their leave ms.
- **Mechanism test.** Unchanged. It runs only after the B-only check (§5).
- **Common random numbers** (main §13.5). A ≡ B at 0% covers the new stream. At 100%, the per-person input record adds
  the group's leave percentile.

### 7.4 Browser tests

- The Playwright suites are updated for the renamed labels and counters.
- The golden hashes are regenerated (§6.5).

---

## 8. Performance and scope

**Performance**

- The budgets are unchanged (main §12.2, §13.9):
  - the bench median is ≤ 3 s per lunch in Node, for A at 100% and B at defaults;
  - the default 150-run sweep takes ≤ 3 min with ≥ 4 workers.
- Circling adds movement events. If a budget fails, optimise the engine, never the rules.

**Out of scope** (later sub-projects)

- **(a) Persuasion and clarity:** redesigning the page and the Findings story around the model-2 results.
- **(c) Polish and speed:**
  - *Skip to*, which took about 40 s for 45 sim-minutes on the live site; that is page overhead, not engine time;
  - the Firefox golden run;
  - the deferred minor findings in `plans/rulings.md`.

---

## 9. Decisions log

Continues main §16.

### 9.1 Owner-confirmed (2026-09-26)

| # | Decision |
|---|---|
| 19 | Food is served on plates that can't leave the canteen: no takeaway. Anyone holding food searches until seated. This replaces the walk-away rule of decision #12; the 10 m visibility stays. |
| 20 | Groups may leave before food: at the door, after looking at the queues and the seating, and while queuing. |
| 21 | Each group has its own wait limit, averaging 10 minutes and varying between groups. |
| 22 | A member who waits past the limit leaves alone, and the rest carry on. |
| 23 | Reservers follow the same rules. The last one to leave collects the object. |
| 24 | At the door the whole hall is judged at a glance. An object makes a table look taken. |
| 25 | After circling for 2 minutes, a group seats whoever fits and the rest keep looking. This amends decision #3. |
| 26 | The old rule is replaced (model version 2), with no takeaway setting. |
| 27 | New primary endpoints P1–P4 (§4.1), fixed before any A-vs-B run. This amends decision #18. |
| 28 | A B-only check runs before any A-vs-B run (§5). |

### 9.2 Refinements by the spec author (for owner review)

| # | Refinement | Why |
|---|---|---|
| V1 | The door queue check uses the shortest queue, measured with `queueLength` as in main §5.2 (which counts people heading to the stall) | A group can always send its members to the shortest queue, and the same quantity drives stall choice |
| V2 | Room needed = `max(1, round(roomNeeded × waitMean / L_g))` | One draw sets both limits: half the patience means twice the room |
| V3 | Queue time starts at the first walkway-stop arrival; the walk from the entrance doesn't count | It matches the *Queuing* colour class |
| V4 | A leave that falls during a walk-in or move-up waits for that leg to end; reaching position 1 cancels it | It keeps queue movement integer-exact, and being served commits the person |
| V5 | Door leavers walk straight from the entrance to the exit | They never enter the hall |
| V6 | Collecting the object takes 3 s, like placing it, and the table stays claimed until the pick-up ends | It mirrors main §5.9 |
| V7 | In split mode a table needs at least 2 free seats (1 for a lone member), and the target maximises seats up to `n`, then distance | "Most room", without scattering people one seat at a time |
| V8 | Members holding food sit first in a split, and the remainder stays in split mode | Plates come first, and the remainder has already circled |
| V9 | P2 is the time carrying a plate, over everyone served | See §4.1 |
