# Canteen Sim — Plan 2: Simulation Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the deterministic, event-driven canteen engine on top of Plan 1: population, event queue, movement and
lane rules, stalls, seating, search, reservation and free-flow behaviour, walk-aways, metrics, `createEngine`, hashes,
invariants, the model-sanity suite and the benchmark.

**Architecture:** Pure TypeScript in `src/sim/`. One engine instance owns typed-array state for one run. The event
heap orders `(ms, kind, entityId, seq)`, with kinds 1–7 as in spec §8.5. `Movement` owns edges, lanes, FIFOs, link
registration and busy nodes. `Stalls` owns queues and service. `seating.ts` and `search.ts` are pure helpers. The
engine (`engine.ts`, with behaviour in `agents.ts`) glues them. Metrics are integrated exactly in integer seat-ms.

**Tech Stack:** as Plan 1 (Node 22, TypeScript strict, Vitest, fast-check, ESLint allowlist on `src/sim/**`).

**Spec:** `docs/superpowers/specs/2026-09-24-canteen-sim-design.md`. Sections implemented here: §4.2, §5, §6, §7
(RunMetrics, PairMetrics, live counters, series), §8.3–8.5 (identity, percentile coupling, event order, hashes),
§12.1–12.2 (engine interface, performance rules), §13.1 (rule tests), §13.3–13.5, §13.9.

**Plan form (ruling).** Plans 2–4 are written and executed by the same agent in one session with the spec loaded.
Each task lists files, exact interfaces and every test with its assertion; implementation code is written during the
task under TDD rather than duplicated here. The final whole-branch review is the independent gate.

## Global Constraints

- Everything from Plan 1's Global Constraints still holds (integer mm, allowlist, RNG formula, module boundaries).
- **Integer time.** Event times are integer ms; time 0 = `crowd.windowStart`. `simEnd = T + 4 h`.
- **Speeds** are integer mm/s: `Math.round(v·1000)`. Edge time `max(1, ceilDiv(lenMm·1000, speed))`;
  `headwayMs = ceilDiv(600·1000, speed)`; `ceilDiv(a, b) = Math.floor((a + b − 1) / b)`.
- **Durations:** drawn durations `max(1, Math.round(s·1000))`; setting durations `Math.round(s·1000)`.
- **Action durations:** sit 3,000; stand 3,000; place 3,000; ask 5,000 ms. Refusal 180,000 ms. Explore revisit
  window 60,000 ms. All-full re-choose every 5,000 ms.
- **Event kinds** (spec §8.5): 1 action ends, 2 service ends, 3 edge exits / node arrivals, 4 queue events (keyed by
  stallId), 5 group arrivals, 6 admissions, 7 timers. Heap key `(ms, kind, entityId, seq)`.
- **Ids:** `personId = 6·groupId + member`; dense person index is ordered by personId, so dense-index comparisons
  equal personId comparisons (ruling below).
- **Performance** (spec §12.2): no per-event work proportional to seats, tables, people or nodes, except a searcher's
  observation / target / explore at its node arrival. Target: ≤ 1.0 s per default run on an M2 (CI limit 3.0 s).
- **Seat-state codes:** `FREE 0, OPEN 1 (openToSmall), BLOCKED 2 (blockedLeftover), CLAIMED_EMPTY 3, HELD 4,
  OCCUPIED 5`.
- **Invariants** run only when the compile-time global `__SIM_INVARIANTS__` is true (Vitest defines it; builds do
  not).

## Rulings made while planning (spec gaps)

1. **Registered agents behind a rule-3-blocked head.** A FIFO head that fails only the 1-lane direction rule does not
   block *registered* agents behind it in the same FIFO (registered agents are exempt from rule 3). Without this, a
   batch member arriving behind a non-registered waiter at a mid-link node deadlocks the link.
2. **Stale batches.** If `dir(L) = none` and no member of `B(L)` is still a waiter for L, `B(L)` is re-formed at the
   next kind-6 step. Without this, batch members that re-planned away can freeze both directions.
3. **Convoy followers that catch up** with the leader's latest node wait there deregistered from their link, so a
   leader U-turn is never blocked by its own followers.
4. **Learned held seats.** A failed arrival check (rule 1) records held seats in the searcher's memory as taken; a
   later distant observation clears that flag only when it sees the seat occupied. Otherwise the searcher oscillates
   between a node and a table whose held seats "look empty".
5. **Dense order by personId** (spec §8.3 says arrays *may* be ordered by arrival).
6. **Model-sanity suite is separate:** `npm run test:sanity` (hundreds of full runs); `npm test` stays fast.
7. **One stand-end event per person;** the claiming group's object is removed at the last member's stand end (same
   ms for all members).

## Review Focus

1. **Deadlock or livelock under crowding** (Crush preset, 1-lane vertical aisles at 0.6 m, `together` mode).
   Expected: every run ends with `exited = arrivals` or is flagged truncated only for `ρ̄ > 0.8`. Test: Task 12
   fast-check invariants plus the Crush and narrow-aisle termination tests in Task 12.
2. **Chunked stepping** (`advanceTo` in random chunks, `step(1)` loops). Expected: identical `runHash` and minute bins.
   Test: Task 11.
3. **Zero settings** (`claimSearchLimit = 0`, `linger = 0`, `serviceCV = 0`, `eat.cv = 0`, `peakShare = 0` and `1`).
   Expected: runs terminate, durations equal means exactly. Tests: Tasks 1 and 10.
4. **A ≡ B at 0%** including interleaved stepping of two engines in one process. Expected: per-tick `stateHash`
   equal. Test: Task 11.
5. **Maximum layout** (20 × 20, k = 4, 60 stalls) with 1,000 people. Expected: builds and terminates. Test: Task 12.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/sim/population.ts` | Arrival CDF + bisection, acceptance (nested crowds), sizes, reserver draw, object type, lognormal durations |
| `src/sim/events.ts` | Binary heap on typed arrays keyed `(ms·8+kind, entity·2³²+seq)` with an int payload |
| `src/sim/hash.ts` | FNV-1a 32-bit over ints (4 bytes LE), floats (8 bytes LE) and null |
| `src/sim/precompute.ts` | Cached per layout+visibility: layout, graph, router, visible tables per node, node→table distance and access node, edge lookup, link node sequences, 1-lane stop flags |
| `src/sim/movement.ts` | Edges, lanes, capacities, travel/headway, FIFOs, kind-6 admission, link registration/batches/U-turns, busy nodes |
| `src/sim/stalls.ts` | Utility choice, `queueLength`, queue positions, walk-in/move-ups/service, Little's-law accumulators |
| `src/sim/seating.ts` | Seat subset choice (unclaimed, joiners), fill order, sharing rule, per-table seat states |
| `src/sim/search.ts` | Searcher memory, observation, suitability, free-flow / detour / claim targets, explore |
| `src/sim/metrics.ts` | Seat-state integration, minute bins, quantiles, RunMetrics, `pairMetrics` |
| `src/sim/agents.ts` | Group and person behaviour (free flow, reserving, convoy, walk-away, eating, trays) |
| `src/sim/engine.ts` | `createEngine`, dispatch loop, `advanceTo`/`step`, `view`/`live`/`series`/`metrics`, hashes |
| `src/sim/invariants.ts` | Invariant checks (§13.3) |
| `src/sim/types.ts` | Shared enums and record types |
| `scripts/bench.ts` | `npm run bench` (§13.9) |
| `tests/sim/*.test.ts`, `tests/sanity/*.test.ts` | Unit/rule tests; model-sanity suite |

---

### Task 1: Population and durations

**Files:** Create `src/sim/population.ts`; Test `tests/sim/population.test.ts`.

**Interfaces:**
- Consumes: `uniform`, `STREAM` (Plan 1 Task 2); `dnormcdf`, `dnorminv`, `dlog`, `dexp` (Task 3); `Config`.
- Produces:
  - `POOL_GROUPS = 6000`, `MAX_GROUP = 6`
  - `arrivalCdf(c: Config): { T: number; F: (t: number) => number }` (ms)
  - `arrivalMsFor(F, T, u): number` — smallest integer `t ∈ [0, T]` with `F(t) ≥ u`, by bisection
  - `groupSizeFor(mix: number[], u: number): number` (1–6)
  - `lognormalMs(meanS: number, cv: number, u: number): number` (`cv = 0` → exact mean)
  - `interface Population { groups; persons … }` with typed arrays:
    - per group (dense, ascending groupId): `groupId, size, arrivalMs, firstPerson, reserveDraw, objectType`
    - per person (dense, ascending personId): `personId, group, member, serviceMs, eatMs`
  - `buildPopulation(c: Config, seed: number): Population`

**Tests** (each written first, watched failing):
- `F` is monotone, `F(0) ≥ 0`, `F(T) = 1` (within 1e-15) at defaults and at `peakShare` 0 and 1.
- For 10⁴ values of `u = uniform(seed, arrival, i)`: `t = arrivalMsFor(F,T,u)` satisfies `F(t−1) < u ≤ F(t)`
  (with `F(−1) := −∞`).
- Pinned reference arrival ms for groupIds 0–9 at seed 1 (golden values produced by the first green run and then
  frozen in the test).
- Acceptance: arrivals ∈ `[N, N+5]`; groups at `N = 800` ⊂ groups at `N = 2600`, and at 1,000 ⊂ 1,050, with identical
  draws for common groups.
- `groupSizeFor` inverse CDF: `[25,30,20,15,5,5]` over 10⁵ draws gives each share within 1 percentage point; a zero
  weight never appears.
- `lognormalMs(90, 0, u) = 90,000` for every u; mean of `lognormalMs(90, 0.5, u_i)` over 10⁵ draws within 1% of 90,000
  and CV within 3% of 0.5.
- Reservers are nested: for `p1 < p2`, `reserveDraw < p1` ⊆ `reserveDraw < p2`.
- Person ids are `6·groupId + member` and dense order is ascending personId.

Run: `npx vitest run tests/sim/population.test.ts && npm run lint && npm run typecheck`. Commit
`feat(sim): population, nested crowds and percentile-coupled durations`.

---

### Task 2: Event queue and hashing

**Files:** Create `src/sim/events.ts`, `src/sim/hash.ts`; Tests `tests/sim/events.test.ts`, `tests/sim/hash.test.ts`.

**Interfaces:**
- `class EventQueue { push(ms, kind, entity, type, arg, stamp): void; pop(): boolean` (fills `ms, kind, entity,
  type, arg, stamp` fields) `; peekMs(): number; size: number }`
- `class Fnv { h: number; int(n): void; float(x: number | null): void }`; `FNV_OFFSET = 0x811c9dc5`.

**Tests:**
- 10⁴ random pushes pop in `(ms, kind, entity, seq)` order; equal keys pop in insertion order.
- A push of `(t, 6)` made while `(t, 7)` events remain pops before them.
- FNV of the empty stream is `0x811c9dc5`; `int(1)` hashes bytes `01 00 00 00`; `float(null)` equals hashing the
  bytes of `0x7FF8000000000000` LE; known vector: FNV-1a("a") = `0xe40c292c` via `int`-free byte helper.

Commit `feat(sim): typed-array event heap and FNV-1a hashing`.

---

### Task 3: Layout precompute cache

**Files:** Create `src/sim/precompute.ts`; Test `tests/sim/precompute.test.ts`.

**Interfaces:**
- `interface Precomp { L; G; R; visMm; nodeCount; tableCount; visibleTables: Int32Array[]; nodeTableDist:
  Int32Array; nodeTableAccess: Int32Array; edgeBetween(a, b): number; linkNodes: Int32Array[]; nodeLink:
  Int32Array; nodeLinkIdx: Int32Array; oneLaneStop: Uint8Array; intersections: Int32Array; tableAccessNodes:
  Int32Array[] }`
- `getPrecomp(p: LayoutParams, visMm: number): Precomp` — memoised by `JSON.stringify([p, visMm])`.

**Tests:**
- `visibleTables[n]` equals a brute-force `dx² + dy² ≤ vis²` filter for every node (defaults, vis 10 m and 5 m).
- `nodeTableDist[n·T+τ]` equals the brute-force minimum of `dist(n, a)` over τ's access nodes, and
  `nodeTableAccess` is the lowest node id among the minima.
- `edgeBetween` is symmetric and returns −1 for non-adjacent nodes; `linkNodes[l]` starts at `link.a`, ends at `link.b`.
- `oneLaneStop` is 1 for seat nodes on horizontal aisles and 0 on the top walkway and concourse.
- Two calls with the same params return the same object.

Commit `feat(sim): cached layout precompute`.

---

### Task 4: Movement and lane rules

**Files:** Create `src/sim/movement.ts`; Test `tests/sim/movement.test.ts` (uses tiny hand-built `NavGraph`s plus the
default graph).

**Interfaces:**
- `interface MoveHost { scheduleArrival(p: number, ms: number): void; requestAdmit(): void }`
- `class Movement`:
  - state (dense person arrays): `node, edge, edgeDir, entryMs, exitMs, regLink, regDir, lane, leader`
  - `now: number` (set by the engine before each event)
  - `placeAt(p, node)`; `candidate(p, edge, dir, speedMmS)` (handles U-turn deregistration); `withdraw(p)`;
    `stop(p)` (deregister to act/leave); `leave(p)`; `arrive(p): number` (kind 3; frees capacity, deregisters at the
    far routing node, marks FIFOs dirty); `busy(node, ±1)`; `admitStep()` (kind 6); `isWaiting(p)`; `waitRank(p)`.
- Admission: examine dirty edge-direction FIFO heads in ascending `(waitStart, personId)`; fresh candidates are
  appended in personId order after existing entries; conditions 1(a) link rule, 1(b) capacity, 1(c) busy nodes;
  rulings 1 and 2 above.

**Tests:**
- Headway on the default 256 mm edge from stall 29's stop: enter at t → exit t+197; follower admitted at t+197 exits
  t+659.
- Lone walker covers a 30 m seated aisle at 1.3 m/s within 1 ms per edge of 30/1.3 s; tray carrier at 1.0 m/s within
  the same tolerance of 30 s.
- FIFO order: an agent reaching a node never enters ahead of an agent already waiting in that edge-direction's FIFO.
- No passing in a 1-lane link: exit order equals entry order for same-direction agents.
- Batch alternation: with waiters in both directions, the batch comes from the earliest waiter's direction, and a
  later same-direction arrival waits for the next batch.
- Starvation bound: continuous two-way arrivals on one 1-lane link; every waiter enters within
  `(w+1)·(T_L + c_L·h) + 5000·a` ms.
- U-turn: an agent registered in d at a mid-link node that turns is deregistered and admitted in −d once d empties.
- Ruling 1: a registered agent behind a rule-3-blocked non-registered head is admitted.
- Busy node delays a passer by ≤ the remaining action time (3,000 / 5,000 ms).
- Capacity: 2-lane edges hold `cap` per direction; ≥ 4-lane edges hold `lanes·cap` total; 1-lane edges `cap`.

Commit `feat(sim): mesoscopic movement with lanes, FIFOs, link batches and busy nodes`.

---

### Task 5: Stalls, queues and service

**Files:** Create `src/sim/stalls.ts`; Test `tests/sim/stalls.test.ts`.

**Interfaces:**
- `interface StallHost { scheduleQueue(stall, ms, type, p): void; scheduleServiceEnd(p, ms): void; onServiceStart(p): void }`
- `class Stalls`: `rankTerm: Float64Array`, `queueLength: Int32Array`, `gumbel(p, s)`, `utility(p, s)`,
  `choose(p): number` (−1 if all full; increments `queueLength`), `bestIgnoringFull(p)`, `provisional(p)`,
  `atWalkway(p, s)` (assigns position `1 + ahead`, schedules the walk-in), `onQueueEvent(type, p)` (walk-in arrival =
  queue join, move-up end, service start), `serviceEnded(p)` (vacates position 1, starts move-ups), segment data for
  rendering, Little's-law accumulators.

**Tests:**
- `queueLength` counts walkers; a stall is never chosen at `2m`; queue length never exceeds `2m`.
- Two people arriving at the walkway stop in the same ms get different positions.
- A walker whose positions ahead emptied during the walk makes the missed move-ups on arrival (one at a time, 462 ms
  each at 1.3 m/s).
- Utility ties go to the lower stall id; Gumbel terms are fixed per person per stall.
- Little's law identities hold exactly (both forms) on a synthetic arrival stream.
- M/G/1: Poisson arrivals, ρ = 0.7, lognormal service CV 0.5 via `lognormalMs`, 10⁶ customers: mean wait within 5% of
  `λm²(1+c²)/(2(1−λm))`.

Commit `feat(sim): stall choice, queues, move-ups and service`.

---

### Task 6: Seating helpers

**Files:** Create `src/sim/seating.ts`; Test `tests/sim/seating.test.ts`.

**Interfaces:** `chooseUnclaimed(k, freeMask, n, hereMask): number[]`, `chooseJoin(k, freeMask, takenMask, n,
hereMask): number[]`, `fillOrder(k, firstSide): number[]`, `joinAllowed({complete, n, shareMaxParty, freeCount,
shareMinEmpty}): boolean`, `seatStateOf(...)`, `ownSeat(set, hereMask)`.

**Tests:**
- n = 4 at an empty 6-seat table with the searcher at seat 0's or seat 1's node picks N0, N1, S0, S1.
- Joiners next to claimers at N0, N1 take S1, S2.
- Reserver fill order starts on the claimer's side.
- Sharing: pair + pair leaves 2 and closes; solo + solo leaves 4 and stays open; parties > `shareMaxParty` refused;
  incomplete group refused; with `shareMinEmpty = 1` a pair never joins a table with exactly 1 empty seat and a solo
  does.
- Seat-state precedence and the openToSmall/blockedLeftover split at `shareMinEmpty`.

Commit `feat(sim): seat choice, fill order, sharing rule and seat states`.

---

### Task 7: Search memory and targets

**Files:** Create `src/sim/search.ts`; Test `tests/sim/search.test.ts`.

**Interfaces:** `class Memory` (observed table list, `occMask`, learned `heldMask`, `claimed`, `seated`,
`observedMs`, `refusedUntil`, visited intersections), `observe(mem, node, now, world)`, `freeFlowTarget(mem, cur, n,
opts, now)`, `claimTarget(mem, cur, n, sumDist)`, `exploreTarget(mem, cur, now)`.

**Tests:** suitability table of §5.5 (unclaimed / claimed / claim search); nearest target with table-id then node-id
tie-breaks; detour `d > 0` prefers a completely empty table within `d`; claim score `n·dist + Σ member dists`;
explore picks the nearest intersection not visited within 60 s, else the least recently visited; held seats look empty
from a distance; ruling 4.

Commit `feat(sim): searcher memory, observation and targeting`.

---

### Task 8: Metrics primitives

**Files:** Create `src/sim/metrics.ts`; Test `tests/sim/metrics.test.ts`.

**Interfaces:** `quantile(sortedInts, q)` (nearest rank), `class SeatClock` (six totals, exact integer seat-ms
accumulators, per-minute bins split at minute boundaries, demand accumulators, stuck and standing-with-food
integrals), `peakThroughput(sitTimes)`, `interface RunMetrics`, `interface PairInput`, `pairMetrics(level, baseline,
fraction): PairMetrics`, `peakWindow(a, b)`.

**Tests:** nearest-rank quantiles; minute bins identical when the same Δ is advanced in one step or in random pieces;
peak throughput on hand examples (window `[t, t+3.6M)`); peak window chooses the earliest of ties and clips to
`[0, end]`; P3 with the pair's window; null for empty populations.

Commit `feat(sim): metric integration, quantiles and pair metrics`.

---

### Task 9: Engine core — free flow end to end

**Files:** Create `src/sim/types.ts`, `src/sim/agents.ts`, `src/sim/engine.ts`; Test `tests/sim/engine.freeflow.test.ts`.

**Interfaces (spec §12.1):**
```ts
createEngine(config, opts?: { seed?: number; reserveFraction?: number }): Engine
interface Engine {
  advanceTo(simMs: number): void; step(maxEvents: number): number;
  readonly nowMs: number; readonly done: boolean; readonly truncated: boolean;
  layout: StaticLayout; static: StaticPeople;
  view(): View; live(): Live; series(): Series; progress(): number;
  metrics(): RunMetrics; pairInput(): PairInput; runHash(): number; stateHash(): number;
}
```

**Tests:** B at defaults (seed 1) runs to done with `exited = arrivals`, `truncated = false`; everybody who sat
passed the tray return before exiting; a party of n sits at one table; the first member with food searches (ties to
the lowest id); all n seats are held from commit; asking at an occupied unclaimed table; refusal when the seats are
held lasts 180 s; groups stand up together.

Commit `feat(sim): engine loop with free-flow parties`.

---

### Task 10: Reservation behaviour

**Files:** Modify `src/sim/agents.ts`, `src/sim/engine.ts`; Test `tests/sim/engine.reserve.test.ts`.

**Tests:** a claimed table blocks every seat to strangers; `oneClaimer` members queue on entry; claim cutoff (a target
chosen before the cutoff is still claimed; limit 0 claims only tables visible at entry; fallback resets memory and uses
the patience start rule); after the cutoff a pursued target seen occupied at a node arrival causes fallback at that
ms; members holding food at the claim ms are assigned then in (service end, pid) order and their seats are held;
joiners obey §5.6 at every join and stay when the claiming group leaves; `together` convoy members walk the leader's
node sequence under lane rules; after a `together` placement on a 1-lane aisle, followers at adjacent mid-link nodes
both turn back and leave the link within `2·(T_L + h)`; a claimed group never walks away.

Commit `feat(sim): reserving groups, claim cutoff, fallback, sharing and convoys`.

---

### Task 11: Walk-aways, options, views and determinism

**Files:** Modify `src/sim/agents.ts`, `src/sim/engine.ts`; Test `tests/sim/engine.determinism.test.ts`,
`tests/sim/engine.walkaway.test.ts`.

**Tests:** patience expiry makes the whole group walk away; members without food finish buying then return trays;
a pending ask decides before a walk-away; a committed party never walks away; `search.parallel` and
`emptyTableDetour` runs terminate and differ from the default; chunk independence (random `advanceTo` chunks and
`step(k)` loops give identical `runHash` and series); A ≡ B at 0% per tick (each alone and interleaved); at 100%
every person's input record is identical in A and B; `view()` arrays have the documented lengths and finite segment
times; `live()` provisional P1/P2/P4.

Commit `feat(sim): walk-aways, optional behaviours, views, live counters and hashes`.

---

### Task 12: Invariants, sanity suite and benchmark

**Files:** Create `src/sim/invariants.ts`, `tests/sim/invariants.property.test.ts`, `tests/sanity/*.test.ts`,
`scripts/bench.ts`, `tests/golden/bench.json`, `vitest.sanity.config.ts`; Modify `package.json` (scripts `test:sanity`,
`bench`), `vitest.config.ts` (`define: { __SIM_INVARIANTS__: 'true' }`).

**Tests:**
- fast-check (≤ 400 people, ≤ 6 × 6 tables, ≤ 90 min windows, `numRuns = 200`, checks after every event): no seat
  has two occupants; each seat in one state; `arrived = inside + exited`; lane capacity, link direction and busy-node
  rules; nobody sits at a claimed table except its group or valid joiners; at done `arrivals = seated + walk-aways`;
  `truncated = false` when `ρ̄ ≤ 0.8`.
- Sanity (§13.4): default termination (seeds 1–30, A 100% and B); small crowd (0 walk-aways, blocked-while-needed ≤
  1%); maximum patience; crowd-size monotonicity in the mean; queue-aversion HHI; Little's law exact identities;
  mechanism test (Reservation-friendly preset); correlation of A and B queue waits ≥ 0.5 at p = 0.25; Crush and
  narrow-aisle termination; max layout with 1,000 people.
- Bench: A (100%) and B timed separately, 1 warm-up + median of 5; fails if events per run drift > 10% from
  `tests/golden/bench.json` or a median exceeds 3.0 s.

Commit `test(sim): invariants, model sanity suite and benchmark`.
