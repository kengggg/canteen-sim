# Canteen Seat-Reservation Simulation — Design Spec

- **Date:** 2026-09-24
- **Status:** v3, revised after a four-lens review and a coverage/consistency check; awaiting owner review
- **Repo:** `kengggg/canteen-sim` (private)
- **Source sketch:** [`2026-09-24-layout-sketch.jpg`](2026-09-24-layout-sketch.jpg)

---

## 0. Model at a glance

- **Two canteens, one crowd.** A web page shows two identical canteens side by side, each with 100 six-seat tables,
  30 food stalls and a tray return.
- **Only the policy differs.**
  - In canteen **A** a share of groups *reserve*: one member drops a bottle, umbrella or lanyard on an empty table,
    which blocks the whole table, and everyone then buys food.
  - In canteen **B** nobody reserves: people buy food first, then look for seats and share tables with strangers.
  - Both canteens get the **identical crowd**: the same people arriving at the same moments with the same appetites.
- **Movement.** People walk an aisle network whose lane limits encode the owner's spacing rule. Vertical aisles let
  two people pass each other; horizontal aisles are single file.
- **Evidence.** Four primary metrics, fixed in advance, are compared over many paired lunches with confidence
  intervals: walk-aways, time from entrance to seat, peak seat utilization and peak throughput.

---

## 1. Purpose

In many office canteens, people "reserve" a table before buying food by leaving an object on it — a water bottle, an
umbrella, an employee lanyard. The object means "this whole table is ours". The owner believes this makes the
canteen less efficient than **free flow**, where people buy food first and then sit wherever there is room.

This project is a web-based 3D simulation that tests that belief.

### 1.1 Guiding principle: the result must come out of the model

The owner wants to show free flow is better. That claim only convinces a skeptic if the model is neutral:

1. Reservation's real benefit is modeled: reserving groups return with food straight to a guaranteed table, while
   free-flow diners search while carrying trays.
2. Free flow's real costs are modeled:
   - searching while carrying a tray;
   - asking strangers "is this seat free?";
   - groups that cannot find seats together;
   - a seated member holding seats for friends still queuing.
3. Every numeric assumption is an adjustable setting (§9). Every structural assumption is listed in an in-app
   **Assumptions** panel (§11.12, §15). A **"Reservation-friendly"** preset gives reservation its best shot.
4. Canteens A and B share every setting and every random draw; only the reserve fraction differs.
5. Evidence comes from many paired runs with confidence intervals, on **primary endpoints fixed in advance** (§7.2),
   not from one animation. The page ships with the default evidence precomputed (§10.8).

### 1.2 Non-goals

- Cashiers: payment happens at the stalls.
- Cleaning staff, pillars and second helpings.
- Takeaway-only customers.
- Reserving long before arriving; one group claiming several tables.
- Multi-floor venues and weather.
- Thai-language UI.
- Realistic crowd physics (collisions, pushing).
- Hovering beside diners who are about to leave.

---

## 2. Glossary

| Term | Meaning |
|---|---|
| **Group / party** | People who arrive together and want to eat together, size 1–6. A solo diner is a group of 1. |
| **Reserver** | A group in canteen A whose reserver draw is below the reserve fraction (§6). |
| **Claimer** | The reserving-group member who searches for and claims a table (§5.4). |
| **Object / marker** | A bottle, umbrella or lanyard. The type is visual only; all three behave identically. |
| **Claimed table** | A table with an object on it. It blocks all its seats to everyone else, except joiners allowed by §5.6. |
| **Complete** | A claimed table's group is complete when every member has started sitting there. |
| **Searcher** | The member of a free-flow party who looks for seats while holding food (§5.3). |
| **Commit** | The moment a party takes a specific set of seats; those seats become `held` (§5.9). |
| **Canteen A / B** | A: `reserve.percentA` of groups reserve. B: nobody reserves, ever. |
| **Run / lunch** | One simulated lunch for one canteen: one config, one seed and one reserve fraction. |
| **Tick** | 200 ms of sim time. It is the UI, sampling and `advanceTo` quantum only; events run in integer milliseconds. |

---

## 3. Units, geometry and layout

### 3.0 Units (normative)

**Integer units inside the sim**

- **Plan geometry** is integer **millimetres**: coordinates, lengths and path distances. Metre-valued settings are
  converted once with `Math.round(v·1000)`, and settings are stepped so that is exact (§9.1).
- **Speeds** are integer **mm/s**, converted once as `Math.round(v·1000)`.
- **Event times** are integer **milliseconds of sim time**. Time 0 is `crowd.windowStart`.
- **Durations.**
  - Drawn durations (service and eating times) convert as `max(1, Math.round(seconds·1000))`.
  - Duration settings (`search.patience`, `reserve.claimSearchLimit`, `eat.linger`, `tray.dropTime`,
    `crowd.peakSpread`) convert as `Math.round(seconds·1000)`, so a 0 setting stays 0 ms.
  - In the UI-side formulas of §7.2 and §9.2, `serviceMean`, `eat.mean`, `eat.linger` and window lengths are in
    minutes (config seconds ÷ 60).
- **Edge travel time** is `max(1, ceilDiv(lengthMm·1000, speedMmS))` ms.
  - `ceilDiv(a, b) = Math.floor((a + b − 1) / b)`, on non-negative integers.
  - Example: a 600 mm edge takes 462 ms at 1.3 m/s and 600 ms at 1.0 m/s.

**Units in the config**

| Kind of value | Stored as |
|---|---|
| Percentages | fractions 0–1 |
| Durations | seconds |
| Clock times | integer minutes since midnight |
| Lengths | metres |

The UI shows percentages, minutes and metres. Rendering converts to metres only at the view boundary.

### 3.1 Coordinates

Plan origin is the top-left inner wall corner. **x → east (right)**, **y → south (down)**. In 3D, plan `(x, y)` maps
to world `(x, 0, y)` with world `+Y` up.

### 3.2 Default floor plan

```
 x=0   3     8                                                              39.2 m
 ┌─────┬─────┬──────────────────────────────────────────────────────────────┐ y=0
 │  18 stalls along the top wall (each ~2.18 m wide), full width             │
 ├───────────────────────────────────────────────────────────────────────────┤ y=3
 │  top queue zone: queue lines (y 3.0–6.6) + top walkway (y 6.6–8.0)        │
 ├─────┬─────┬──────────────────────────────────────────────────────────────┤ y=8
 │ 12  │ left│  table block: 10 × 10 tables, 1.2 m vertical aisles           │
 │stall│queue│  (incl. both outer edges), 0.75 m horizontal aisles           │
 │ s   │zone │  x 8.0–39.2, y 8.0–32.75                                      │
 │~2.31│ +   │                                                               │
 │ m   │walk-├──────────────────────────────────────────────────────────────┤ y=32.75
 │ each│ way │  bottom concourse (3 m)                                        │
 └─────┴─────┴─[TRAY]─────────────────────────────[ IN ]──────[ OUT ]────────┘ y=35.75
             x 8.5–11.5                        x≈27.4      x≈33.3
```

### 3.3 Fixed dimensions (not settings)

| Item | Value |
|---|---|
| Table depth | 800 mm |
| Seat pitch along a table side | 600 mm (table length = 600 × seats per side) |
| Chair zone (chair + seated person) behind each table edge | 500 mm |
| Person lane width (used to derive lane counts) | 600 mm |
| Stall band depth (counter + kitchen) | 3000 mm |
| Walkway width inside each queue zone (far side from the counter) | 1400 mm |
| Bottom concourse depth | 3000 mm |
| Door width (entrance, exit) | 2000 mm each |
| Tray-return counter width | 3000 mm |
| Queue lines per stall / queue slot pitch | 2 / 600 mm |
| Minimum stall frontage | 1800 mm (2 queue lines × 600 mm + ≥ 600 mm exit gap) |
| Node merge distance | 50 mm |

### 3.4 Derived geometry

**Notation**

| Symbol | Meaning |
|---|---|
| `C` | columns |
| `R` | rows |
| `k` | seats per side |
| `Wv` | vertical aisle width, mm |
| `Wh` | horizontal aisle width, mm |
| `Q` | queue zone depth, mm |
| `S` | stall count |

**Table block and hall**

- Table length `Lt = 600·k`; seats per table `2k`.
- Row unit depth `Du = 800 + 2·500 = 1800`.
- Table block width `Bw = C·Lt + (C+1)·Wv`. There are vertical aisles between every column **and** at both outer
  edges.
- Table block height `Bh = R·Du + (R−1)·Wh`.
- Hall width `W = 3000 + Q + Bw`; hall height `H = 3000 + Q + Bh + 3000`.
- Table block origin: `(3000 + Q, 3000 + Q)`.

**Stall bands**

- Top stall band: `x ∈ [0, W]`, `y ∈ [0, 3000]`, with frontage length `Ft = W`.
- Left stall band: `x ∈ [0, 3000]`, `y ∈ [3000 + Q, H]`, with frontage length `Fl = H − 3000 − Q`.
- Stall split: `top = Math.round(S·Ft / (Ft + Fl))`, `left = S − top`.
  - Stall boundary `i` of a band = band start + `Math.round(i·F/n)`.
  - Every stall frontage must be ≥ 1800 mm (§9.2).
- **Stall id:** top band `0 … top−1` from west to east, then left band `top … S−1` from north to south. The displayed
  stall number is `id + 1`.

**Queue zones**

- Top queue zone: `y ∈ [3000, 3000 + Q]`, full width.
- Left queue zone: `x ∈ [3000, 3000 + Q]`, `y ∈ [3000 + Q, H]`.
- Queue slots per line `m = Math.floor((Q − 1400) / 600)`. Queue capacity per stall `2m`, including the person being
  served.

**Doors and tray return** (all on the bottom wall)

- Entrance centre `x = Math.round(0.70·W)`; exit centre `x = Math.round(0.85·W)`.
- Tray-return counter `x ∈ [3000 + Q + 500, 3000 + Q + 3500]`, facing north.

**Defaults** (`C = R = 10`, `k = 3`, `Wv = 1200`, `Wh = 750`, `Q = 5000`, `S = 30`)

| Quantity | Value |
|---|---|
| `Bw`, `Bh` | 31,200 mm, 24,750 mm |
| Hall `W × H` | 39,200 × 35,750 mm (≈ 1,401 m²) |
| Seats | 600 (≈ 2.34 m² per seat) |
| Stalls | **18 top (≈ 2,178 mm each) + 12 left (≈ 2,313 mm each)** |
| Queue capacity | 12 per stall |
| Entrance / exit centre | x = 27,440 / 33,320 mm |
| Tray return | x 8,500–11,500 mm |

### 3.5 Tables and seats

- Tables are rectangles with the long axis east–west, `k` seats on the north side and `k` on the south side.
- **Ids.** Table id = `row·C + col`, with row 0 at the top and col 0 at the west. Seat id = `table·2k + side·k + i`,
  with side 0 = north and `i` counted from the table's west end.
- **Position.** Seat `(table, side, i)` centre:
  - `x = table west end + 300 + 600·i`;
  - `y` = 250 mm outside the table edge on that side.
- At defaults the west end of column `c` is `9200 + 3000·c`, so the seat x values are 9500, 10100, 10700, and so on.

### 3.6 Stall queue geometry

**Top stall** (west edge `xw`, frontage `f`)

- Queue line 1 at `x = xw + 300`, line 2 at `x = xw + 900`.
- Slot `j` (`j = 0 … m−1`) at `y = 3300 + 600·j`.
- Exit gap: `x ∈ [xw + 1200, xw + f]` (east side).
- Walkway stop: `(xw + 1200 + Math.round((f − 1200)/2), 3000 + Q − 700)`.

**Left stall** (north edge `yn`, frontage `f`)

- Counter face at `x = 3000`; slot `j` at `x = 3300 + 600·j`.
- Line 1 at `y = yn + f − 300`, line 2 at `y = yn + f − 900`.
- Exit gap: `y ∈ [yn, yn + f − 1200]` (north side).
- Walkway stop: `(3000 + Q − 700, yn + Math.round((f − 1200)/2))`. For the southernmost stall this is ≤ `H − 1500`, because
  `f ≥ 1800`, so every stop lies on the left walkway.

**Queue positions**

- Position 1 is the **service position** (line 1, slot 0).
- Positions `2 … m` are line 1, slots `1 … m−1`.
- Positions `m+1 … 2m` are line 2, slots `m−1` down to 0.

The queue folds back toward the counter.

---

## 4. Navigation and movement

### 4.1 The aisle graph

**Lines (their centre lines)**

- *Horizontal:*
  - the top walkway, `y = 3000 + Q − 700`;
  - each horizontal aisle between rows `r` and `r+1`;
  - the bottom concourse, `y = H − 1500`.
- *Vertical:*
  - the left walkway, `x = 3000 + Q − 700`;
  - the `C+1` vertical aisles.

  Both vertical kinds run from the top walkway down to the concourse.
- *Extents:*
  - The top walkway spans the full hall width, so it serves every top stall, including those west of the left
    walkway.
  - Horizontal aisles and the concourse run from the left walkway to the last vertical aisle.

**Nodes**

- *Intersection* nodes sit at every crossing of a vertical and a horizontal line.
- *Stop* nodes sit on lines:

  | Stop | Position |
  |---|---|
  | Seat access point | seat x, on the horizontal line adjacent to that seat's side (see Attachments) |
  | Stall walkway stop | §3.6 |
  | Entrance | `(entrance x, H − 1500)` |
  | Exit | `(exit x, H − 1500)` |
  | Tray return | `(3000 + Q + 2000, H − 1500)` |

- The 1.5 m between each door and the concourse line is not modeled. Arrivals appear at the entrance node, and a
  person is removed on reaching the exit node.
- **Merging.** Nodes on the same line within ≤ 50 mm of each other merge, transitively, into one node that keeps all
  their roles.
  - The merged node takes the intersection's position if the cluster contains one; otherwise the smallest
    coordinate.
  - So the south seats of row `r` and the north seats of row `r+1` share one access node per x on aisle `r`, and no
    edge is shorter than 50 mm.

**Attachments**

- North seats of row `r` attach to the line above: the top walkway for `r = 0`, otherwise aisle `r−1`.
- South seats of row `r` attach to the line below: aisle `r`, or the concourse for the last row.

**Edges, lanes and links**

- *Edges* join consecutive nodes along a line. Every edge takes the lane count of its line,
  `lanes = Math.floor(widthMm / 600)`:

  | Line | Default width | Lanes |
  |---|---|---|
  | Vertical aisle (including its stretch into the top walkway and the concourse) | 1,200 mm | 2 |
  | Horizontal aisle (including its stretch from the left walkway to vertical aisle 0) | 750 mm | 1 |
  | Walkways | 1,400 mm | 2 |
  | Concourse | 3,000 mm | 5 (open) |

- *Per-lane capacity* of an edge = `max(1, Math.floor(lengthMm / 600))` people.
- A *link* is the chain of edges between two consecutive **routing nodes** on a line. Routing nodes are
  intersections and terminals (§4.3). On 1-lane lines, direction rules apply per link.

**Node ids**

- **Horizontal line index:** top walkway = 0; aisle `r` (between rows `r` and `r+1`, `r = 0 … R−2`) = `r + 1`;
  concourse = `R`.
- **Routing nodes** (intersections and terminals, all of which lie on horizontal lines) come first, by line index,
  then x ascending.
- **Stop nodes** follow: first those on horizontal lines, by line index then x ascending; then those only on the left
  walkway, by y ascending.
- A merged node belongs to the line of its merge cluster.
- The layout asserts `N_nodes < 2¹⁶`.

**Queue areas**

- Each stall's slots and its exit gap sit off the graph. Movement inside a queue area ignores lanes. The paths are
  Manhattan, in integer mm:
  - walkway stop → along the gap centre line → across to the slot;
  - the reverse after service.

### 4.2 Movement rules (mesoscopic, event-driven)

People move edge by edge. An agent does work only when an event fires (§12.2).

1. **Entering an edge.**
   - **Candidates.** An agent that needs an edge becomes a *candidate* for that edge in its direction at that ms. This
     happens after a node arrival, an action end, a group arrival, a stall choice or a timer.
   - **Admissions happen only in kind 6** (§8.5), never inside the event that made the agent ready. An agent that
     continues through a node without stopping is admitted in kind 6 of the same ms, with `entryMs` = that ms.
   - **Order.** For each edge-direction, candidates are examined in order: first the existing FIFO (by wait start,
     then person id), then agents that became ready at this ms (by person id).
   - **Conditions.** A candidate enters if all of these hold:
     - (a) **1-lane link rule:** rule 3 allows direction `d`;
     - (b) **capacity:** fewer people in its lane than the edge's per-lane capacity. On edges with ≥ 4 lanes, fewer
       than `lanes × per-lane capacity` people on the edge in total;
     - (c) **busy nodes:** the edge's far node is not busy, and on a 1-lane line the agent's own node is not busy
       unless the agent is the actor (rule 7).
   - **Waiting.** A candidate that fails joins the tail of that edge-direction's FIFO, with wait start = this ms. Only
     then does it count as a *waiter*.
   - **Repeated examination.** In kind 6 the engine re-examines affected FIFO heads in ascending (wait start, person
     id) until none can be admitted. A blocked head blocks only its own FIFO.
   - **No deadlock.** Nodes have unlimited waiting room, so an agent on an edge can always leave it. Together with
     finite actions (rule 7) and batch alternation (rule 3), this rules out deadlock.
2. **Lanes.**

   | Lanes on the edge | Rule |
   |---|---|
   | 2–3 | One lane per direction (a third lane is unused); no overtaking within a lane. |
   | ≥ 4 | Open: total capacity as in rule 1(b), no direction rules, overtaking allowed. |

3. **1-lane links.**
   - **Registration.** An agent is *registered* on link L in direction `d` from its admission to an edge of L in `d`
     until it leaves L. It leaves L when it:
     - reaches L's far routing node;
     - stops at a stop node on L to act there or leave the graph (sit, ask, place, queue, tray return, exit);
     - makes a U-turn.

     Waiting at a mid-link node while continuing in `d` keeps the registration. Registered agents continuing on L in
     `d` are never blocked by this rule, only by rules 1(b) and 1(c).
   - **U-turns.** An agent registered on L in `d`, standing at a mid-link node, whose next edge on L runs in `−d` is
     deregistered at that ms and becomes a candidate for `−d`. Its former registration never blocks it.

     This covers a re-target after an observation, a failed arrival check, dispersal and a convoy reversal.
   - **Waiters.** A *waiter for L in `d`* is an agent in the FIFO of an edge of L in `d` that is not registered on L.
   - **Direction.** `dir(L) = d` while anyone is registered on L in `d`, and `none` otherwise.
   - **Batches.** Whenever `dir(L) = none` and L has waiters, the next kind-6 step picks a direction and a batch:
     - `d*` = the direction of the waiter with the smallest (wait start, person id);
     - batch `B(L)` = every waiter for L in `d*` at that ms.

     `B(L)` is cleared when `dir(L)` next becomes `none`.
   - **Entry rule.** A new entry into L in `d` is allowed iff `dir(L) ∈ {none, d}` and either no waiter for L in `−d`
     exists or the agent is in `B(L)`.
4. **Travel time.** For an agent entering an edge at `entryMs`:
   - Speed is `move.walkSpeed`, or `move.traySpeed` while carrying a tray (food, or a used tray, §5.8).
   - `exitMs = max(entryMs + travelMs, predecessorExitMs + headwayMs)`, where
     `headwayMs = ceilDiv(600·1000, speedMmS)`.
   - The **predecessor** is the agent that most recently entered the same lane of the same edge in the same direction
     before this agent, by `entryMs` then admission order, whether or not it has already exited.
   - With no predecessor, or on edges with ≥ 4 lanes, the second term is dropped.
5. **Rendering** interpolates each agent along its current segment between entry and exit time. Followers in a lane
   are drawn ≥ 0.6 m behind their leader (§11.9).
6. **Routing.** See §4.3.
7. **Actions and busy nodes.**

   | Action | Duration |
   |---|---|
   | Sit | 3,000 ms |
   | Stand up | 3,000 ms |
   | Place object | 3,000 ms |
   | Ask ("is this seat free?") | 5,000 ms |

   While a person performs one of these at a stop node on a **1-lane** line, that node is **busy**:
   - no agent may enter an edge whose far end is that node;
   - agents already at the node, other than the actor, may not leave it along that line until the action ends.

   Actions on lines with ≥ 2 lanes block nothing. Actions are finite, so busy nodes cannot deadlock.
8. **Re-planning.**
   - **On an edge.** A re-plan fires on a new target, a fallback, a walk-away, dispersal, or a new seat or stall. If it
     fires while the agent is on an edge, it takes effect at that edge's far node: the agent finishes the edge and
     routes from there.
   - **In a queue area.** During a queue-area path, it takes effect at the walkway stop.
   - **What happens at the event ms.** Stall choice (and its `queueLength` count), patience start, the walk-away count
     and the searcher role are all decided at the event ms. Only the route, and a new search's first observation,
     wait for the next node or walkway stop.

### 4.3 Routing

- **Terminals.** A line segment beyond the last intersection at either end of a line ends in a *terminal*: its
  outermost stop node. Terminals join intersections as routing nodes.
- **Precompute.** All-pairs integer-mm distances `D` between routing nodes are precomputed, with one Dijkstra per
  routing node.
- **Distances.** Each stop `s` lies on a segment between two consecutive routing nodes `e1, e2` (`e1 = e2 = s` if `s`
  is itself a routing node).
  - For a target `t` on the same segment, `dist(s, t) = |pos_s − pos_t|`.
  - Otherwise `dist(s, t) = min over e ∈ ends(s), f ∈ ends(t) of d(s,e) + D(e,f) + d(f,t)`.
  - All terms are integer mm.
- **Hop-by-hop routing.** Routing decisions are made at routing nodes, and at the stop node where a trip starts.
  - **At a routing node `e` toward target `t`:** the options are each incident link direction whose next routing node
    `v`, or `t` itself when `t` lies on that link, satisfies `linkLen + dist(v, t) = dist(e, t)` exactly.
  - **At a stop node `s` that is not a routing node:** the options are its two segment directions. Each is kept when
    `d(s, e_i) + dist(e_i, t) = dist(s, t)` holds. When `t` is on the same segment, the only option is the direction
    toward `t`.
- **Tie-break.** When `k > 1` options remain:
  - they are sorted by the node id of their next routing node (or `t`);
  - the agent takes index `Math.floor(u·k)`, where `u` is the `route` draw keyed by
    `(personId, currentNodeId·N_nodes + targetNodeId)`;
  - `currentNodeId` is the node where the choice is made, and `targetNodeId` is the final target.

  Consequences:
  - The same person at the same node toward the same target makes the same choice in both canteens.
  - Traffic spreads across parallel aisles.
- Routes do not react to congestion.

---

## 5. People and behavior

### 5.1 Arrivals and run length

**Arrival times**

- Groups arrive at the entrance node during `[0, T]`, where `T = windowEnd − windowStart` in ms.
- The arrival CDF is the mixture

  `F(t) = s·[Φ((t−μ)/σ) − Φ(α)] / [Φ(β) − Φ(α)] + (1−s)·t/T`

  where (all quantities in ms):
  - `s = crowd.peakShare`;
  - `μ = (peakTime − windowStart)·60,000`, since clock times are stored in minutes;
  - `σ = crowd.peakSpread·1,000`, since it is stored in seconds;
  - `α = −μ/σ` and `β = (T−μ)/σ`;
  - `Φ` is `dnormcdf` (§8.5).
- A group's arrival ms is the smallest integer `t ∈ [0, T]` with `F(t) ≥ u(arrival, groupId)`. It is found by integer
  bisection (≤ 25 iterations).

**Group size and crowd selection**

- Group size comes from `crowd.groupMix`, the probability of each size 1–6 per group, by inverse CDF of
  `u(size, groupId)`.
- Accepted groups are chosen as in §8.3.

**Run length**

- The run ends when the last person exits.
- **Hard cap:** `simEnd = T + 4 h`. If anyone is still inside at `simEnd`, the engine stops with `done = true` and
  `truncated = true` (§10.6).

### 5.2 Choosing a stall and being served

**When people choose.** A person chooses a stall when they start walking toward the stalls:

- on entry, for free-flow members and a reserving group's non-claimers;
- on dispersal or fallback, for claimers and `together`-mode members.

Choices made in one event run in ascending person id. Examples: the members of an arriving group, a dispersal, a
fallback. Choices made in different events at the same ms follow the §8.5 event order. Either way, each chooser sees the
counts left by choices already processed.

**The utility.** The person takes the non-full stall that maximises

`U_s = −stalls.popularitySkew · dlog(rank_s) − stalls.queueAversion · (queueLength_s / 10) + G_ps`

- `rank_s ∈ 1 … S` comes from sorting stalls by `u(stallRank, stallId)` ascending; the lowest draw is rank 1.
- `G_ps = −dlog(−dlog(u(stallNoise, personId, stallId)))` is a Gumbel term fixed per person per stall.

**Queue length and fullness**

- `queueLength_s` = people in `s`'s slots, including the one being served, **plus** people who have chosen `s` and
  have not yet reached their slot.
- A person counts from the ms of choice, so a queue can never exceed `2m`. The stall is full when
  `queueLength_s ≥ 2m`.

**All stalls full**

- The person walks to the walkway stop of the best stall, `argmax U_s` ignoring fullness.
- On arrival they re-choose, then every 5,000 ms after arriving there.

**Joining and moving up**

- **People ahead** = everyone holding a position at the stall: in a slot, moving up, or walking in.
- **Assigned slot.** At the walkway stop the person is given position `1 + (people ahead)`, so two people never share
  a position. They walk to that position's slot at `walkSpeed` (§3.6). Their walk target stays that slot even if
  positions ahead empty meanwhile.
- **Queue join** = the ms they reach the slot (kind 4, §8.5).
- **Moving up.** When a position ahead empties, the person behind it moves up one position, taking
  `ceilDiv(600·1000, walkSpeedMmS)` ms.
  - Move-ups for one person are sequential: one that becomes due while another is running starts when the current
    one ends.
  - A person arriving at its slot then makes one move-up for each position that emptied ahead of it during the walk.
- **Queue-area paths.** Each leg is a separate segment with time `max(1, ceilDiv(legMm·1000, speedMmS))`, and the path
  time is the sum of its legs.

**Service**

- Service starts at the end of the walk-in or move-up that brings the person to position 1 (kind 4).
- One server per stall; FIFO.
- Service time is lognormal with mean `stalls.serviceMean` and coefficient of variation `stalls.serviceCV`, drawn from
  the `service` percentile (§8.4). It covers order, cooking and payment.

**Leaving the counter**

- After service the person holds food. They walk at `traySpeed` through the exit gap to the walkway stop (§3.6).
- The free-flow search starts at that walkway stop.

### 5.3 Free-flow party

This applies to every group in B, and to non-reservers and fallback groups in A.

1. **Queue.** On entry, each member chooses a stall (§5.2) and walks there.
2. **Search.** The **first member to receive food** becomes the searcher (§5.5); same-ms ties go to the lowest person
   id. The searcher looks for a table where the whole party of `n` fits (decision #3).
3. **Waiting groupmates.** A member who gets food while the searcher is still searching waits, holding food, at its
   stall's walkway stop (R6). The parallel-search option changes this (§5.10).
4. **Commit and sit.** When the searcher commits (§5.9), all `n` seats become `held`.
   - Each member is told its seat: the searcher's rule is in §5.5, the others take the remaining seats.
   - Members walk to their own seat's access node once they have food, and sit.
   - People respect held seats.
5. **Sharing.** Other seats at that table stay available to strangers.
6. **Patience.** If the searcher has not committed within `search.patience` of receiving food, the whole group walks
   away (§5.7).

### 5.4 Reserving group

This applies to groups in canteen A whose reserver draw is below the reserve fraction, **solos included**
(decision #5).

**Claim mode `oneClaimer` (default, decision #16)**

1. The claimer is the member with the lowest person id. Every other member chooses a stall and walks there on entry.
2. **Claim search.** The claimer searches (§5.5) for a **completely empty table**: nobody seated, no held seats, no
   object. The claimer walks at `move.walkSpeed`.
3. **Claim target.** For each remembered, completely empty table `τ`:
   - `a(τ)` is the access node of `τ`'s seats that minimises `dist(current node, a)`; ties go to the lower node id.
   - `score(τ) = n·dist(current node, a(τ)) + Σ over members of dist(a(τ), member's stall walkway stop)`. This is an
     integer equal to `n ×` (the claimer's walk + the mean member walk).
   - The target is `argmin score`, with ties to the lower table id. The claimer walks to `a(τ)`.
   - **Which stall a member uses in the score:**
     - a member that has chosen a stall uses that stall;
     - a member that found every stall full uses the stall whose walkway stop it is walking to or waiting at;
     - a member that has not chosen yet (the claimer; every member in `together`) uses its **provisional best
       stall**: `argmax U_s` over non-full stalls at the group's entry ms. It is computed once, never re-evaluated,
       and not counted in `queueLength`.
4. **Claim.** On reaching the table, if it is still completely empty, the table is **claimed from that ms**, and the
   claimer places the object (3,000 ms).
   - All seats are blocked to everyone else. Any object claims the whole table, because an onlooker cannot tell how
     many are coming.
   - The claimer then chooses a stall and walks there.
   - Members learn the claimed table instantly, the same assumption as free-flow held seats.
5. **Return.** Each member is assigned a seat at its service end (fill order in point 7). It walks **straight** to that
   seat's access node and sits, with no search. This is reservation's real benefit.
6. **Waiting for the claim.** A member who has food before the claim resolves waits at its stall's walkway stop.
   - After a claim, it walks straight to its assigned seat.
   - After a fallback, point 9 applies.
7. **Seat fill order.**
   - The first side is the side whose access node the claimer stood on when placing the object.
   - Order: that side `i = 0 … k−1`, then the opposite side `i = 0 … k−1`.
   - **Assignment time.**
     - Members who already hold food when the claim takes effect (the claimer's arrival ms) are assigned at that ms,
       in ascending (service-end ms, person id). They start walking at that ms, without waiting for the place end.
     - Every other member is assigned at its own service-end ms; same-ms ties go by ascending person id.
   - **Seat states.** An assigned seat whose member has not started sitting is `held`. Unassigned seats are
     `claimedEmpty` until the group is complete.
8. **Claim cutoff.** `reserve.claimSearchLimit`, counted from entry, stops the choice of **new** claim targets.
   - A target chosen before the cutoff is still pursued, and it is then **frozen**. Observations still update memory,
     but they never change the target table or node.
   - If an observation after the cutoff shows the target no longer completely empty (a seat observed occupied, or
     the table claimed), the group falls back at that node-arrival ms. Otherwise the arrival check decides: if the
     table is not completely empty on arrival, the group falls back then.
   - A claimer with no current table target at the cutoff falls back at the cutoff.
   - With a limit of 0, only tables observed at the entrance node at the entry ms can be targeted. If none is empty,
     the group falls back at once.
9. **Fallback.** The group becomes a free-flow party for this visit, and is counted once as a *fallback reserver*.
   - The claim-search memory is discarded.
   - The claimer chooses a stall at the fallback ms. If it is on an edge, it finishes that edge first (§4.2 rule 8).
   - The searcher is the first member with food. If a member already holds food, it becomes the searcher at the
     fallback ms.
   - Patience counts from the later of its service end and the fallback ms.
10. **No walk-away after a claim.** A reserving group that has claimed never walks away.

**Claim mode `together` (setting)**

- The whole group walks as a **convoy** of individual agents. The leader (lowest person id) runs the claim search.
  - The engine records the sequence of nodes the leader arrives at from entry.
  - Each follower walks exactly that sequence, in person-id order behind the leader. It uses no route draws of its
    own and enters each edge under §4.2, including U-turns where the leader turned.
  - Observation, target choice and the arrival check use the leader. In the claim-target score, every member uses its
    provisional best stall (point 3).
- Stalls are chosen at dispersal or fallback.
- Once the object is placed (3,000 ms), or on fallback, each member re-plans toward its stall under §4.2 rule 8. A
  member on an edge finishes that edge first.
- Every other rule is as in `oneClaimer`.

### 5.5 Search and table knowledge

**Memory**

- Memory belongs to the searcher, or to the claimer (or convoy leader) during a claim search.
- It starts empty when the search starts:
  - at the stall walkway stop after service, for a free-flow search;
  - at the next node or walkway stop after a fallback (§4.2 rule 8);
  - at entry, for a claim search.
- It is discarded when the search ends, including at fallback.
- It holds:
  - one entry per observed table: `{observedMs, per-seat occupied|empty, claimed, seatedCount, refusedUntilMs}`;
  - the searcher's visited-intersection history (last arrival ms per intersection).

**Observation**

- The searcher observes every table whose centre lies within `search.visibility` of its node, using the integer test
  `dx² + dy² ≤ vis²` with no occlusion.
- Observation happens at search start and on each node arrival. Waiting at a node does not re-observe.
- **Held seats look empty from a distance.** Group completeness cannot be observed either.

**Suitable tables** (as remembered, and not refused)

| Table | Suitable when |
|---|---|
| Unclaimed | observed-empty seats ≥ `n` |
| Claimed | `n ≤ reserve.shareMaxParty`, `seatedCount ≥ 1`, and observed-empty seats ≥ `max(n, reserve.shareMinEmpty)` |
| Claim search | completely empty and unclaimed |

**Target**

- **Free-flow searches** target the nearest suitable table by `distance(table)`: the minimum path distance (§4.3) to
  the access node of any seat recorded as empty.
- Ties go to the lower table id, then the lower node id. The searcher walks to that node.
- **Claim searches** use §5.4 point 3 instead.
- `search.emptyTableDetour` modifies this rule (§5.10).
- After every observation the target is recomputed. If it changes, the searcher reroutes at once.

**Exploring**

- With no suitable remembered table, the searcher walks to the nearest intersection not visited in the last 60,000 ms.
- If every intersection has been visited within that time, it goes to the one visited longest ago.
- *Nearest* means `dist` (§4.3) from the current node, recomputed at each node arrival. Ties go to the lower node id.
- *Visited* means arriving at that intersection during this search. Earlier walking does not count.
- A free-flow searcher holding food while exploring is **stuck**. Stuck time feeds a metric (§7.3).

**Arrival check** (on the true state)

1. **Unclaimed table, nobody seated.**
   - If ≥ `n` seats are neither occupied nor held, commit.
   - Otherwise update memory and re-target. No refusal is counted.
2. **Unclaimed table, someone seated.** Ask (5,000 ms). At the ask's end:
   - if ≥ `n` seats are neither occupied nor held, commit;
   - otherwise the party is **turned away**: the table is refused for 180,000 ms, and the refusal counts as *refused
     by held/occupied seats*.
3. **Claimed table.** Ask (5,000 ms). At the ask's end:
   - if the table is now unclaimed, apply rule 1's test without a second ask;
   - if every §5.6 condition holds, commit;
   - otherwise the party is turned away: the table is refused for 180,000 ms, and the refusal counts as *refused at
     claimed tables*.
4. **Claim search.** If the table is completely empty, claim it (§5.4). Otherwise re-target, or fall back under the
   cutoff.

**Seat choice at commit**

- **Unclaimed table.** List every `n`-subset of free seats (at most `C(8,4) = 70`). Pick the one that minimises the key
  `(sidesUsed, contiguousRuns, −facingPairs, −here, sorted seat-id list)`:
  - `contiguousRuns` = maximal runs of consecutive `i` on the same side, summed over both sides;
  - `facingPairs` = the number of `i` with both `(N,i)` and `(S,i)` in the set;
  - `here` = 1 if the set contains a seat whose access node is the searcher's current node, else 0.
  - Example: `n = 4` at an empty 6-seat table, with the searcher at seat 0's or seat 1's access node, picks
    `N0, N1, S0, S1`.
- **Joiners at a claimed table.** Minimise `(−min d², contiguousRuns, −Σ nearest d², −here, sorted seat-id list)`:
  - `d²` is the integer squared Euclidean distance (mm²) to every occupied or held seat at the table;
  - seat steps are 600 mm along a side, and 1300 mm across the table.
  - Example: with claimers at `N0, N1`, a joining pair takes `S1, S2`.
- **The searcher's own seat** is the lowest-id seat in the set whose access node is the current node. If there is
  none, it is the lowest-id seat in the set.
- **Other members**, in ascending person id, take the remaining seats in ascending seat id.

### 5.6 Sharing a seated reserved table (owner's rule, decision #14)

**The rule.** A party may take empty seats at a claimed table only when **all** of these hold, judged at the end of its
ask on the true state:

1. every member of the claiming group has started sitting there (the group is complete);
2. the party has at most `reserve.shareMaxParty` people (default 2);
3. the unoccupied, unheld seats number at least **`max(n, reserve.shareMinEmpty)`** (default 4). The check is made
   **at every join**.

**Examples at 6-seat tables**

- A reserving pair (4 empty) plus a joining pair leaves 2 empty, and the table closes.
- A reserving solo (5 empty) plus a joining solo leaves 4 empty, so one more solo or pair may join.

**When the claiming group leaves**

- Its object goes with it, and the table becomes an ordinary unclaimed table. Joiners stay.

**Disabling sharing**

- Setting `reserve.shareMinEmpty = 2k` disables sharing (the strict rule). A complete group has at least one member
  seated, so at most `2k − 1` seats can be empty.

### 5.7 Walking away

**When**

- Patience applies **only to free-flow searchers**, and only while they walk, explore, wait at a node or choose a
  target.
- A reserving group that has claimed never walks away.
- A party that has committed never walks away, and its held seats stay held until each member sits.
- **At the patience timer:**
  - mid-ask: the party walks away at the ask's end unless that ask ends in a commit. Every non-commit outcome counts,
    including a failed rule-1 test at a table that became unclaimed. With `search.parallel`, the decision waits for
    every pending ask: the party commits if any of them commits, and otherwise walks away at the last one's end;
  - committed or sitting: nothing happens;
  - otherwise: the group walks away at that ms.

**What happens at the decision**

- Members holding food go straight to the tray return. Their food is packed as takeaway there, which counts as a
  tray drop: they join the same FIFO and hold a slot for `tray.dropTime`, then walk to the exit at `move.walkSpeed`.
- Members without food keep buying: walking to a stall, waiting for a queue, queuing or being served. Each goes
  straight to the tray return at its service end.
- Every member counts as a **walk-away** from the decision ms.

### 5.8 Eating and leaving

- **Eating time.** Each person's eating time is lognormal with mean `eat.mean` and CV `eat.cv`. Eating starts when the
  sit ends.
- **Standing up.** The party stands up together at `T_stand = max over members (eat end) + eat.linger`.
  - Seats stay `occupied` until `T_stand + 3,000` ms.
  - Then they are released, and the object is removed if this is the claiming group.
- **Tray return.** Every person walks to the tray return carrying their used tray, at `move.traySpeed` with the tray
  cue. They wait FIFO for one of `tray.slots` slots. Dropping a tray takes `tray.dropTime`; the next drop starts in the
  event that frees the slot.
- **Exit.** They then walk to the exit at `move.walkSpeed` and are removed. **Everyone returns a tray** (decision
  #11).

### 5.9 State-change timing (normative)

| Event | When it takes effect |
|---|---|
| **Commit** | At the arrival ms (no ask) or at the ask's end. Every seat in the set becomes `held`, including the searcher's own if it must walk to it. |
| **Sit** | Starts on arrival at the seat's access node, or at the commit ms if the searcher is already there, and lasts 3,000 ms. The seat is `occupied` from the sit start. **"Sat down"** in every metric = sit start. Eating starts at sit start + 3,000 ms. |
| **Group complete** (claimed table) | At the sit start of its last member. |
| **Stand** | Seats are `occupied` until `T_stand + 3,000` ms, then released. The object is removed at the same ms (claiming group only). |
| **Claim** | The table is claimed at the claimer's arrival ms, if completely empty. The object is placed 3,000 ms later, and then the claimer leaves. |
| **Ask** | 5,000 ms, decided at its end against the true state. |
| **Walk-away** | At the decision ms (§5.7). |

### 5.10 Optional behaviors (identical in A and B; off by default)

**`search.parallel`**

- Every member of a free-flow party without seats who holds food is a searcher.
- Searchers share one memory: the union of their observations.
- Each targets the nearest suitable table not targeted by a groupmate. If every suitable table is taken by a
  groupmate, it targets the nearest one anyway; ties go to the lower table id.
- The first searcher to commit holds seats for all. The others stop searching and walk to their seats.
- Patience counts from the first member's food.

**`search.emptyTableDetour = d` (metres)**

- Applies only when `d > 0`. At `d = 0` (the default), targeting is exactly §5.5, including its tie-breaks.
- A free-flow party targets the nearest **completely empty** suitable table if its distance ≤ (distance to the
  nearest suitable table) + `d`. Otherwise it targets the nearest suitable table.
- "Completely empty" is as remembered: every seat observed empty, and the table unclaimed. Ties among completely empty
  tables go to the lower table id, then the lower node id.

---

## 6. The two canteens

- A and B are independent engine instances built from the **same config and seed**, with no shared mutable state.
- The only difference is the reserve fraction:
  - **A:** a group reserves iff `r_g < reserve.percentA`, where `r_g = u(reserve, groupId)` and the setting is stored
    as a fraction 0–1.
  - **B:** 0.
- For `p1 < p2`, the reservers at `p1` are a subset of the reservers at `p2`. At 0, no group reserves.
- In the live view both engines advance to the same sim time each frame.
- **At `reserve.percentA = 0`, A and B are identical at every tick** (§13).
- Different stall choices caused by different queue states are an intended system response, not desynchronisation.

---

## 7. Metrics

### 7.1 Seat states

Every seat is in exactly one state at every ms. **Precedence:**
`occupied > held > claimedEmpty > openToSmall | blockedLeftover > free`.

| State | Definition | Display label |
|---|---|---|
| `occupied` | Someone is sitting there: from sit start to stand end. | Seated |
| `held` | Committed to a party member who has not started sitting. | Saved for a groupmate |
| `claimedEmpty` | Unoccupied seat at a claimed table whose group is not complete. | Reserved, group not all seated |
| `openToSmall` | Unoccupied, unheld seat at a claimed table whose group is complete, where unoccupied unheld seats ≥ `shareMinEmpty`. | Reserved, open to parties of ≤ {min(shareMaxParty, unoccupied unheld seats at that table)} |
| `blockedLeftover` | As above, but with fewer than `shareMinEmpty` unoccupied unheld seats. | Reserved, spare seats nobody can use |
| `free` | Any other unoccupied, unheld seat. | Free |

Seat-seconds per state are integrated exactly, from six running per-state seat totals (§12.2). They are also binned
per sim minute.

### 7.2 Primary endpoints (decision #18)

**The comparison.** The reservation sweep at defaults, **100% vs 0%**, fixed before any results. The batch view shows
these four first. Every other output is labelled *secondary* or *diagnostic*. Intervals are 95%, uncorrected, and the
UI states how many intervals it shows.

| # | Endpoint | Definition | Better |
|---|---|---|---|
| P1 | **Walk-away %** | Walk-away people ÷ actual arrivals × 100. | lower |
| P2 | **Mean entrance-to-seat-or-give-up** | Over **every arrival**: (sit-start ms, or the group's walk-away decision ms) − entrance ms, in minutes. | lower |
| P3 | **Peak seat utilization** | `occupied` seat-seconds ÷ (seats × window length in s) over the pair's peak window (§7.7). It is a *PairMetric*. | higher |
| P4 | **Peak throughput** | The maximum number of sit starts in any 60-minute window `[t, t + 3,600,000)`. It is shown next to the stall ceiling `60·S / serviceMean` people per hour (1,200/h at defaults). | higher |

**Seated diners** = people with a sit start. At done it equals arrivals − walk-aways (invariant, §13.3). It is shown
beside P1 as a count only: it is exactly P1's complement, so it gets no interval and no win count of its own.

### 7.3 Secondary metrics

| Metric | Definition | Better |
|---|---|---|
| Entrance-to-seat-or-give-up, median and p90 | as P2 | lower |
| **Food-to-seat-or-give-up** (mean, median, p90) | (sit start or walk-away decision) − service end, over people whose service ended at or before that outcome. | lower |
| **Seats blocked while needed** | `Σ` over *demand ms* of seats in {held, claimedEmpty, blockedLeftover} ÷ `Σ` over demand ms of all seats. A demand ms is one with ≥ 1 stuck free-flow searcher in that canteen (§5.5). Demand minutes are shown next to it. With no demand, the value is 0. `openToSmall` during demand is shown on a separate line, not in the numerator. | lower |
| **Seat search time (with food)** | Per group: searcher's service end → commit or walk-away decision. It is 0 for groups that sat at their claimed table. Mean and p90 over all groups. | lower |
| Queue wait | Queue join → service start; mean and p90. | lower |
| Seat utilization, whole | `occupied` seat-seconds inside `[0, T + 60 min]` ÷ (seats × (T + 60 min) in s). Occupancy after `T + 60 min` is not counted. | higher |

### 7.4 Diagnostics (no win counts)

- Seat-time share by state, whole run and peak window. The old "seat efficiency" ratio,
  `occupied / (occupied + held + claimedEmpty + blockedLeftover)`, is shown twice: with `openToSmall` counted as
  available, then as waste. Both are labelled.
- Turned-away asks, split into *at claimed tables* and *by held/occupied seats*.
- Fallback reservers.
- Claim search time: per reserving group, entry → claim or fallback.
- **Split-feasible walk-aways:** walk-away groups for which the canteen had ≥ `n` seats in state `free` across all
  tables at the decision ms.
  - Reported per canteen as a count and a % of walk-away groups and of walk-away people, overall and per group size
    1–6.
  - CSV columns: `splitFeasibleGroups`, `splitFeasiblePeople`, and `splitFeasibleGroups_s{n}` /
    `splitFeasiblePeople_s{n}` for n = 1…6.
- Standing-with-food person-minutes: people holding food who are waiting, not walking.
- `walkAwayServedAfterDecision`: the number, and % of walk-away people, whose service ended after their group's
  walk-away decision ms.
- Total visit of seated diners (mean, median, p90).
- Stuck minutes.
- Events per kind.
- `truncated`.

### 7.5 Breakdowns

- **By group size (1–6):**
  - walk-away %;
  - mean entrance-to-seat-or-give-up;
  - mean food-to-seat-or-give-up;
  - group and person counts.
- **By reserver cohort** (R12; a *PairMetric*). For the level being compared:
  - Cohort R = groups with `r_g < fraction`; cohort N = the rest.
  - In B the same group ids form R ("would-be reservers").
  - Within A, R splits into *claimed* and *fallback*, each against the same groups in B.
  - Per cohort, A and B, report walk-away %, and the mean, median and p90 of entrance-to-seat-or-give-up, plus mean
    food-to-seat-or-give-up.
  - Paired free-flow advantage per cohort, with CI. Every cohort metric is lower-is-better, so this is `A − B`.
  - Empty cohorts show `—`.
  - CSV prefixes: `cohortR_`, `cohortN_`, `cohortRclaimed_`, `cohortRfallback_`.

### 7.6 Live counters and time series (per canteen)

**Live counters**

- Seats by state (stacked bar, display labels)
- Queuing: people from reaching their stall's walkway stop until service end, including the person being served
  and people waiting because every queue was full; excludes the tray return. This is the same set as the *Queuing*
  colour class.
- Searching with food now
- Claiming a table now (A only)
- Standing with food now
- Walk-aways so far
- Sit starts in the last 60 min
- Mean entrance-to-seat-or-give-up so far

**Difference strip**

- It shows the *free-flow advantage* (§10.3) for P1–P4.
- It shows `—` until both canteens have a value, and updates once per sim minute.
- **Provisional values before done**, from `engine.live()`:
  - P1 = walk-aways so far ÷ arrivals so far × 100;
  - P2 = the mean over arrivals so far of (outcome ms, or *now* if no outcome yet) − entrance ms;
  - P4 = the maximum sit starts in any 60-min window ending at or before now;
  - P3 shows `—` until both runs are done.

  At done, the §7.2 values replace them.
- It is labelled *"This lunch only. One lunch can be luck; see Batch for 30."*

**Time series.**
- Each minute's point is the mean seat count per state over that minute: the minute bin's seat-seconds ÷ 60. The last
  minute is partial and divides by its actual length.
- They are drawn as two stacked-area panels (A and B), from 0 until done, with a shared y-axis `0 … seats`, a
  clock-time x-axis and the peak window shaded.

### 7.7 Computation rules

- **Quantiles:** nearest rank, `sorted[ceil(q·n) − 1]`, on integer-ms values.
- **Peak window (per paired comparison).** The live A vs B pair, or each batch level vs its 0% run for the same seed,
  shares one window:
  - It is the 60-minute window, starting on a whole sim minute, that maximises the sum over **both** runs of
    seat-seconds in any non-`free` state.
  - Ties go to the earliest start.
  - The window is clipped to `[0, end]`, where `end` = the later of the two runs' final ms, rounded up to a whole
    minute.
  - The start time is written to the CSV. In the live view it is computed once both runs finish.
- **RunMetrics vs PairMetrics.**
  - *RunMetrics* depend on one run only. They are returned by `engine.metrics()`, folded into `runHash`, and written
    as one CSV row per run.
  - *PairMetrics* are P3, the peak-window seat-time shares and the cohort breakdowns. They are computed by
    `pairMetrics(levelRun, baselineRun)` from both runs' minute bins and per-group records. They are never part of
    `runHash`, and are written as one CSV row per (seed, level ≠ 0) pair, with the prefix `pair_`, including
    `pair_peakWindowStart`.
  - In each pair, the baseline's P3 uses that pair's window.
- **Empty populations.** A per-run metric with an empty population, or a 0/0 ratio, is `null`. Nulls are excluded
  from means and CIs, and `n_used` is shown.
- **Timing.** RunMetrics, PairMetrics and hashes are computed only when done. `engine.live()` values are
  provisional.

---

## 8. Randomness and reproducibility

### 8.1 Counter-based random numbers

The sim never calls `Math.random`. Every draw is a pure function of identity:

```
fmix32(h): h ^= h>>>16; h = Math.imul(h, 0x85ebca6b); h ^= h>>>13; h = Math.imul(h, 0xc2b2ae35); h ^= h>>>16; return h>>>0
h(seed, stream, a, b) = fmix32((seed ^ fmix32(Math.imul(stream, 0x9E3779B1) ^ fmix32(a ^ fmix32(b)))) >>> 0)
u(stream, a, b)       = (h(seed, stream, a, b) + 0.5) / 4294967296        // strictly inside (0, 1)
```

Unused `b = 0`.

### 8.2 Streams

| id | Stream | Key `(a, b)` | Used for |
|---|---|---|---|
| 1 | `arrival` | groupId | arrival ms (§5.1) |
| 2 | `size` | groupId | group size |
| 3 | `accept` | groupId | crowd subsetting (§8.3) |
| 4 | `reserve` | groupId | reserver draw `r_g` |
| 5 | `object` | groupId | bottle / umbrella / lanyard (visual) |
| 6 | `service` | personId | service-time percentile |
| 7 | `eat` | personId | eating-time percentile |
| 8 | `stallNoise` | personId, stallId | Gumbel term |
| 9 | `stallRank` | stallId | popularity ranking |
| 10 | `route` | personId, currentNode·N + targetNode | next-hop tie-break |
| 11 | `batchSeed` | i | batch seeds (§10.1) |

### 8.3 Identity and nested crowds

- **Candidate pool.** A fixed pool of **6,000 candidate groups** is generated, with `groupId = 0 … 5999` as the pool
  index. It is never renumbered.
- **Person ids.** `personId = 6·groupId + memberIndex`. Every RNG key, every "lower id" tie-break and every
  outcome-affecting iteration uses these ids. Engine arrays may be dense, ordered by `(arrival ms, groupId, member)`.
- **Acceptance.**
  - Groups are accepted in ascending `u(accept, groupId)` order, with ties broken by groupId.
  - Acceptance stops after the first group whose acceptance makes the cumulative head count ≥ `crowd.totalPeople`. So
    arrivals ∈ `[N, N + 5]`.
  - "% of arrivals" always uses actual arrivals.
- **Nesting.** A smaller crowd is therefore a subset of a larger one, and every common group has identical draws.

### 8.4 Percentile coupling

**Lognormal durations.** For service and eating:

- `σ² = dlog(1 + cv²)` and `μ = dlog(mean) − σ²/2`.
- `x = dexp(μ + σ·dnorminv(u))`, then converted to ms.
- With `cv = 0`, `x = mean` exactly.

**Stability.** If you change `eat.mean`, the same people are still the slow eaters. Changing one setting never
reshuffles unrelated draws.

### 8.5 Deterministic math and code rules (normative)

**Math**

- `src/sim/dmath.ts` provides:
  - `dlog` and `dexp`, using range reduction by exact ×2 / ×0.5 loops plus polynomials;
  - `dnormcdf`, Cody's rational erfc on `dexp`;
  - `dnorminv`, Acklam's method, with tails via `Math.sqrt(−2·dlog p)`.
- Accuracy, checked in Node:
  - `dlog` and `dexp` against `Math.log` and `Math.exp`;
  - `dnormcdf` and `dnorminv` against high-precision reference values (mpmath at 30 digits) stored in
    `tests/golden/dmath.json`, since JavaScript has no `Math` counterpart for them.

  | Function | Tolerance |
  |---|---|
  | `dlog`, `dexp` | ≤ 1e-13 relative |
  | `dnorminv` | ≤ 1.2e-9 relative |
  | `dnormcdf` | ≤ 1e-12 absolute |

- Numeric constants have ≤ 17 significant digits.

**Allowlist** (ESLint on `src/sim/**` and `src/batch/stats.ts`)

- Allowed: `+ − × ÷`, integer and bitwise ops, and `Math.sqrt / floor / ceil / round / trunc / abs / min / max / sign
  / imul / fround / clz32`.
- Banned: `**` and `**=`, every other `Math.*` function, `Math.random`, `Date`, `performance`, `Intl`,
  `toLocaleString` and `toString(radix)`.

**Iteration and sorting**

- Outcome-affecting iteration runs over id-sorted arrays or typed index ranges.
- Every sort comparator is total, with an id tie-break.

**Event order within one ms**

1. **Action completions:**
   - sit end;
   - stand end (seat release and object removal);
   - place end;
   - ask end (with its decision);
   - tray-drop end (the next queued drop starts in the same event).
2. **Service completions**, keyed by the served personId.
3. **Edge exits and node arrivals.** This covers observation and every on-arrival decision:
   - table check, commit and claim;
   - starting a sit, ask or place;
   - arrival at a stall walkway stop (position assignment);
   - tray-queue join or drop start;
   - exit removal.
4. **Queue events**, keyed by stallId: move-ups, walk-in arrivals at slots (queue join) and service starts.
5. **Group arrivals** at the entrance.
6. **Edge admissions.** Every edge entry happens here (§4.2 rule 1).
7. **Timers:**
   - patience;
   - claim cutoff;
   - the 5 s re-choose;
   - eat end;
   - stand start (`T_stand`, keyed by the party's lowest personId).

**Keys and ties**

- Within a kind, order is by entity id: personId; for group events, the lowest member personId; for kind 4, stallId.
  Then comes a global insertion sequence number.
- The heap key is `(ms, kind, entityId, seq)`.
- An entry made ready by a kind-7 event is examined in a kind-6 step scheduled at the same ms, so it is processed
  straight after that event.

**Consequences**

- Releases happen before arrivals, so a seat freed at ms `t` is visible to a searcher arriving at `t`.
- All exits happen before admissions. So capacity freed at a ms can be reused at that ms, and an arriving agent never
  overtakes someone already waiting in a FIFO.
- An arrival exactly at a deadline counts as within it.
- Within one kind, the lower entity id wins every same-ms contest, including a claimer and a sitter reaching the same
  table.
- Across kinds, the kind order decides. For example, an ask that ends at ms `t` is decided before a searcher who
  arrives at `t`.

**Chunk independence**

- `advanceTo(a); advanceTo(b)` ≡ `advanceTo(b)` for any `a ≤ b`.
- Time series come from per-minute bins inside the engine, so they never depend on how the run was stepped.

**Hashes**

- **Run hash:** 32-bit FNV-1a (`h = Math.imul(h ^ byte, 0x01000193) >>> 0`) over the stream of processed events
  `(ms, kind, entityId)` and then the final metrics.
  - Integers are hashed as little-endian bytes.
  - Floats go through `DataView.setFloat64(…, true)`, and `null` is hashed as `0x7FF8000000000000`.
  - Nothing is hashed as a string.
- **State hash:** FNV-1a over the engine's state arrays. The per-tick A ≡ B test uses it.

**Expected result.** Identical inputs give identical hashes in Node, Chromium, WebKit and Firefox (§13.6).

---

## 9. Configuration

### 9.1 Schema

One schema (`src/config/schema.ts`) defines every setting. It gives id, label, group, type, internal unit, UI unit,
default, min, max, step and help text. From it are generated:

- the settings panel;
- validation;
- URL encoding;
- presets;
- the batch-sweep picker;
- the Assumptions panel links.

| Group | id | Default | Range | Step | Notes |
|---|---|---|---|---|---|
| Crowd | `crowd.totalPeople` | 1800 | 100–5000 | 50 | |
| | `crowd.windowStart` | 11:00 | 06:00–20:00 | 5 min | |
| | `crowd.windowEnd` | 13:30 | start + 30 min … start + 5 h | 5 min | |
| | `crowd.peakTime` | 12:15 | inside the window | 5 min | |
| | `crowd.peakShare` | 0.60 | 0–1 | 0.05 | share of arrivals from the rush |
| | `crowd.peakSpread` | 15 min | 5–60 min | 1 min | rush σ |
| | `crowd.groupMix` | 25/30/20/15/5/5 | six integers 0–100 | 1 | type `mix6`; probability per group, normalised; the panel shows the implied mean size (2.6) |
| | `seed` | 1 | 0 – 2³²−1 | 1 | "new seed" button |
| Reservation | `reserve.percentA` | **0.50** | 0–1 | 0.05 | canteen A only (decision #17) |
| | `reserve.claimMode` | **oneClaimer** | oneClaimer / together | — | decision #16 |
| | `reserve.claimSearchLimit` | 60 s | 0–300 s | 5 s | cutoff on new claim targets (§5.4) |
| | `reserve.shareMinEmpty` | 4 | 1 … 2k | 1 | `2k` = "no sharing" |
| | `reserve.shareMaxParty` | 2 | 1–6 | 1 | |
| Stalls | `stalls.serviceMean` | 1.5 min | 0.25–10 min | 0.05 min | order + cook + pay (decision #15) |
| | `stalls.serviceCV` | 0.50 | 0–1.5 | 0.05 | |
| | `stalls.popularitySkew` | 0.6 | 0–2 | 0.1 | 0 = all stalls equally popular |
| | `stalls.queueAversion` | 1.0 | 0–5 | 0.1 | |
| Eating | `eat.mean` | 18 min | 3–60 min | 1 min | |
| | `eat.cv` | 0.30 | 0–1 | 0.05 | |
| | `eat.linger` | 0 min | 0–30 min | 1 min | |
| Movement & search | `move.walkSpeed` | 1.30 m/s | 0.5–2.0 | 0.05 | |
| | `move.traySpeed` | 1.00 m/s | 0.3–2.0 | 0.05 | |
| | `search.visibility` | 10 m | 2–100 m | 1 m | ≥ hall diagonal = sees the whole hall |
| | `search.patience` | 5 min | 0.5–30 min | 0.5 min | |
| | `search.parallel` | off | off / on | — | §5.10 |
| | `search.emptyTableDetour` | 0 m | 0–40 m | 1 m | §5.10 |
| Tray return | `tray.dropTime` | 5 s | 1–60 s | 1 s | |
| | `tray.slots` | 3 | 1–10 | 1 | |
| Layout | `layout.cols` / `layout.rows` | 10 / 10 | 1–20 each | 1 | |
| | `layout.seatsPerSide` | 3 | 2–4 | 1 | 4-, 6- or 8-seat tables |
| | `layout.verticalAisle` | 1.20 m | 0.60–3.00 | 0.05 | |
| | `layout.horizontalAisle` | 0.75 m | 0.60–3.00 | 0.05 | |
| | `layout.stallCount` | 30 | 1–60 | 1 | |
| | `layout.queueDepth` | 5.0 m | 3.2–10.0 | 0.1 | |

**Not settings.** Playback speed, camera, overlays, colour mode and theme are view state and never affect results.

### 9.2 Validation, warnings and the Load readout

**Clamp order.** Values are clamped to range in dependency order:

1. `layout.*`
2. `crowd.windowStart` / `crowd.windowEnd`
3. `crowd.peakTime`
4. `reserve.shareMinEmpty`

`windowEnd` and `peakTime` are always clamped into their dependent ranges, so a bad window or peak can never occur.

**Blocking.** A message names the settings, and the combination cannot run:

- any stall frontage < 1,800 mm;
- an all-zero group mix;
- a group size `s > 2·layout.seatsPerSide` with a non-zero share (a party must fit at one table, decision #3). A
  one-click fix moves those shares onto size `2·seatsPerSide`.
- door conflicts, using the §3.4 integer centres `xIn = Math.round(0.70·W)` and `xOut = Math.round(0.85·W)`:
  - entrance overlaps the tray return when `xIn − 1000 < 3000 + Q + 3500`;
  - doors overlap when `xOut − 1000 < xIn + 1000`.

**Warnings**, shown next to the setting and in the batch header:

- `move.traySpeed > move.walkSpeed`;
- `layout.verticalAisle < 1.20 m`: vertical aisles no longer let two people pass;
- `reserve.shareMinEmpty = 2k`: no sharing;
- offered load `ρ̄ = totalPeople × serviceMean / (stallCount × window) > 0.9`;
- a very large config, with the estimated live frame rate and batch time.

**Load readout** (UI only, may use `Math.*`), shown in the settings drawer and the batch header:

| Quantity | Formula |
|---|---|
| Peak-hour arrivals/min | `N·[p·(Φ((b−μ)/σ) − Φ((a−μ)/σ)) / (Φ(β) − Φ(α)) + (1−p)·(b−a)/T] / (b − a)`, with `[a, b] = [μ − 30 min, μ + 30 min] ∩ [0, T]`, `b − a` in minutes, and `μ, σ, α, β` as in §5.1 |
| Stall capacity/min | `S / serviceMean` |
| Seat-turnover upper bound/min | `2kCR / (eat.mean + eat.linger + 0.1 min)`, labelled *"upper bound: ignores waiting for the slowest groupmate, holds and table fragmentation"* |

At defaults:

- peak-hour arrivals ≈ 22.0/min, with an instantaneous peak ≈ 33.5/min at 12:15;
- stall capacity 20/min;
- seat-turnover bound ≈ 33/min.

So stalls are the binding constraint from about 11:58 to 12:32.

### 9.3 Presets

A preset is the defaults plus its overrides, and it keeps the current seed.

| Preset | Overrides |
|---|---|
| Default lunch | none |
| Quiet day | `crowd.totalPeople = 800` |
| Crush | `crowd.totalPeople = 2600`, `crowd.peakShare = 0.75` |
| **Reservation-friendly** | `crowd.groupMix = 5/10/15/25/20/25`, `stalls.serviceMean = 0.75 min`, `stalls.popularitySkew = 0`, `search.visibility = 5 m`, `move.traySpeed = 0.7 m/s` |

Help text for Reservation-friendly:

> Chosen to favour reservation. Big groups waste few seats per claim. Fast, evenly chosen stalls keep queues short, and
> with them each claim's idle time. Slow tray walking and 5 m visibility make free-flow tray searches costly. Note: 5 m
> visibility also narrows the claimer's view during its claim search.

### 9.4 Persistence, sharing and versions

- **URL hash:** `#v=1&m={MODEL_VERSION}&…` holds the model version, the non-default values and the seed.
  - `groupMix` is written as `25.30.20.15.5.5`.
  - Times are written as `HHMM`.
- **Settings code:** a compact base64url string of exactly the same content, including `m`.
  - The ⚙ drawer has **Copy settings code**, **Copy link** (`location.href` with the hash) and a **Load settings
    code** field. The field accepts a bare code or any URL containing `#v=…`.
  - A valid code replaces the drawer values and marks the run dirty.
  - An invalid code, or one from an unknown version, shows *"This settings code isn't valid or is from a newer
    version"* and changes nothing.
- **JSON export/import.**
- **Saved scenarios** in `localStorage`, wrapped in try/catch. If storage is unavailable, the panel says *"Saving
  isn't available in this browser"*.
- **Loading rules:**
  - Unknown keys are ignored, and out-of-range values are clamped, with a notice.
  - A loaded blocked combination is repaired, with a notice:
    - a group-mix / `seatsPerSide` conflict applies the one-click fix, moving shares onto size `2k`;
    - any other conflict resets the listed `layout.*` keys to their defaults, then re-clamps in §9.2 order.
  - Loading a link, code or JSON whose `m` differs from the running `MODEL_VERSION` applies it and shows the
    model-version notice below.
- **Apply on Restart.** Changing a setting marks the run dirty, and settings apply on **Restart**, so a run is exactly
  one config and seed. The A slider is the one exception (§11.1).
- **Model version.** `MODEL_VERSION` (an integer in `src/sim/version.ts`) is bumped whenever sim behavior changes. It
  and the git short SHA appear in:
  - the About footer;
  - the CSV header;
  - JSON exports;
  - settings codes.

  Loading something from another model version shows *"Shared with model {x}; results may differ in model {y}."*

---

## 10. Batch runs and statistics

### 10.1 Setup

- **Config source.** A batch snapshots the **applied** config, the one from the last Restart, and says *"Using the
  settings of the current live lunch (seed {seed})"*.
- **During a batch** live playback pauses, and the ⚙ drawer is read-only.
- **Seeds.** `seed_1 = seed`, which is the lunch shown live, marked in charts and CSV. For `i = 2 … n`,
  `seed_i = h(seed, 11, i, 0)`.
- **Seed count.** `n ∈ {30, 60, 120}`, default 30. Tests may pass any `n ≥ 2`.

### 10.2 Sweeps

**Reservation sweep**

- Reserve fraction ∈ {0, 0.25, 0.5, 0.75, 1.0} × `n` seeds, for `5n` runs.
- The 0% level is the **baseline**. It is plotted as a point at 0, with no interval and no win count.
- Primary endpoints are read at 1.0 vs 0.

**Sensitivity sweep**

- The user picks one scalar setting and 3–6 values. Seed, `reserve.percentA` and `crowd.groupMix` are excluded.
- For each value: 0 vs the current `reserve.percentA` (1.0 if that is 0), × the **same** `n` seeds, giving
  `values × 2 × n` runs.
- Before starting, every value is validated against §9.2. A blocked value stops the sweep with a message naming it.
- In a `seatsPerSide` sweep, `shareMinEmpty` is clamped per value, the effective value is written to each CSV row,
  and a warning is shown when sharing is disabled at some values.
- One-click shortcut: a `stalls.serviceMean` sweep over {0.75, 1.0, 1.5, 2.0} min.
- Bands are labelled **pointwise** 95% CIs.

### 10.3 Statistics

- **Per-seed values.** The batch value of a metric is the mean over seeds of its per-run values. Paired differences
  are taken per seed. A seed is dropped from a statistic if either side is `null` or truncated.
- **Paired t-interval:** `mean ± t·sd/√n_used`.
  - For `df = n_used − 1 ≤ 29`, `t` comes from this table: 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306,
    2.262, 2.228, 2.201, 2.179, 2.160, 2.145, 2.131, 2.120, 2.110, 2.101, 2.093, 2.086, 2.080, 2.074, 2.069, 2.064,
    2.060, 2.056, 2.052, 2.048, 2.045.
  - For `df ≥ 30`, use the Cornish–Fisher expansion with `z = 1.959964`:
    `t ≈ z + (z³+z)/(4df) + (5z⁵+16z³+3z)/(96df²) + (3z⁷+19z⁵+17z³−15z)/(384df³)`.
  - No interval is shown when `n_used < 10`.
  - If all paired differences are 0, show *"identical in all n lunches"*.
  - If they are all equal but not 0, show the difference with *"the same in every lunch"* and no interval.
  - If more than half are exactly 0, append *"mostly ties — interval approximate"*.
  - Each interval is shown with its half-width and `n`.
- **One sign everywhere: *free-flow advantage*.**
  - It is `A − B` for lower-is-better metrics and `B − A` for higher-is-better metrics, where B is the 0% run.
  - **Positive always means free flow did better.**
  - It is used in the live strip, batch charts, the sensitivity chart and the CSV.
  - Diagnostics (§7.4) have no better direction. They show the A and B values side by side, with no free-flow
    advantage, interval, win count or difference chart.
- **Win count:** *"Free flow better in W · tied in T · reservation better in L (of n)"*.
  - A tie is exact equality of the two per-run values.
  - There are no win counts for diagnostics or the baseline.
- **Charts.**
  - Batch charts plot, per level, the mean *paired difference* with its paired 95% CI band.
  - Per-level means may be drawn as a line without a band, labelled *"mean (uncertainty: see difference chart)"*.
  - Every CI chart has the caption: *"Shaded band: 95% confidence interval of the average paired difference. If it
    crosses zero, these lunches can't tell the two canteens apart. Intervals show seed-to-seed variation under these
    exact settings, not uncertainty about the settings — see the sensitivity sweep."*

### 10.4 Result wording (fixed templates, neutral in both directions)

- **Clear difference:** *"At {p}% reservation, {metric} was {|diff|} {unit} {better|worse} under free flow (95% CI
  {lo} to {hi}) across {n} paired lunches. Free flow better in W, tied in T, reservation better in L."*
- **CI includes 0:** *"At {p}% reservation, these {n} lunches show no clear difference in {metric}."*
- **Too few lunches:** *"At {p}% reservation, {n_used} usable lunches are too few for an interval; mean difference
  {diff} {unit}."*
- Primary endpoints come first, labelled *primary*. Everything else is labelled *secondary* or *diagnostic*.

### 10.5 Execution

- **Worker pool.** `hardwareConcurrency − 1` workers, minimum 1.
- **Worker health check.** A worker is usable only if it answers `{type:'ping'}` with `pong` within 3 s and fires no
  `error` event.
  - Otherwise it is terminated, and the batch uses the fallback. A synchronous throw from the worker wrapper also
    triggers the fallback.
  - A later `error` or `messageerror` re-queues that worker's in-flight run on the fallback.
- **Fallback.** Main-thread slices of ≤ 12 ms, yielding through `MessageChannel`. It shows *paused* while
  `document.hidden`.
- **Targets.** The default 150-run sweep takes ≤ 3 min with ≥ 4 workers, and ≤ 4 min in the fallback.
- **Calibration.** The first run is the calibration run, and its result is kept as a batch run. Estimated time is
  shown before the start and updated live.
- **Progress and cancel.** There is a progress bar. **Cancel** discards the partial results and returns to the batch
  picker. A worker error with no fallback aborts the batch with *"Batch failed: {message}"*.

### 10.6 Truncation

- A truncated run's metrics are not used.
- The paired statistics drop that seed. For a sweep level, the seed is dropped if either run of the pair is truncated.
- The UI shows *"k of n seeds truncated"*.

### 10.7 Outputs

- Primary endpoint cards, with sentences, intervals and win/tie/loss.
- Difference charts, one per primary and secondary metric, against reserve level.
- Group-size and reserver-cohort tables.
- The sensitivity chart.
- Every chart has a *Show table* toggle.
- **CSV export.**
  - One row per run, with RunMetrics: seed, reserve fraction, sweep value, every RunMetric, the per-size metrics, and
    group and person counts per size.
  - One `pair_` row per (seed, level ≠ 0) pair, with PairMetrics: peak-window start, P3, peak-window seat-time shares
    and the per-cohort metrics (§7.7).
  - The header comment holds the settings JSON, `MODEL_VERSION` and the build SHA.
  - Numbers use `Number.prototype.toString`; timestamps are ISO 8601 UTC.

### 10.8 Precomputed evidence (shipped with the page)

- **Build step.** `npm run precompute` runs the default reservation sweep (150 runs) in Node. It embeds each run's
  RunMetrics and run hash, plus each pair's PairMetrics (≈ 60 KB JSON), in `index.html`.
- **Evidence line.** When the applied config equals the defaults (canonical settings code), the top bar shows an
  **Evidence (30 lunches)** line with the P1 sentence at 100% vs 0%.
- **Evidence panel.** The line opens the batch view pre-filled and labelled *"Precomputed for the default settings,
  model {MODEL_VERSION}. Re-run on this device to check."* It leads with P1–P4 at 100% vs 0%, then the 50% level (the
  live default).
- **Re-run check.** Re-running compares per-run hashes, then reports *"All 150 runs match"* or lists the mismatches.
- For any other config the batch view starts empty.
- CI fails if the embedded hashes differ from a fresh Node run.

---

## 11. Screen and visuals

### 11.1 Layout

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│ Canteen Sim [Default lunch ▾] ▶ Restart Speed[60×] 12:14 Skip to  Evidence: …      │
│                                              Assumptions  ⚙  📊  ?  ◐              │
├──────────────────────────────────────────┬─────────────────────────────────────────┤
│ A · RESERVATION  Groups that reserve:    │ B · FREE FLOW (no reservations)         │
│ [────●──────] 50%                        │                                         │
│               3D canteen                 │               3D canteen                │
│ legend strip                             │ legend strip                            │
├──────────────────────────────────────────┼─────────────────────────────────────────┤
│ live counters                            │ live counters                           │
├──────────────────────────────────────────┴─────────────────────────────────────────┤
│ free-flow advantage strip ("This lunch only…") · seat states over time (A | B)     │
└────────────────────────────────────────────────────────────────────────────────────┘
```

**Top bar**

- Title and scenario preset selector
- Play/Pause and Restart
- Speed: 1×, 10×, 30×, 60×, 120×
- Sim clock (formatted with integer math from minutes since midnight) and **Skip to**
- The Evidence line (§10.8)
- Buttons: **Assumptions** (§11.12), ⚙ Settings, 📊 Batch, **?** (How this works) and a theme toggle

A *"Settings changed — Restart to apply"* banner appears while settings are dirty.

**The A slider** (decision #2)

- A range slider in A's header, 0–100%, step 5, labelled *"Groups that reserve in A: {p}%"*. It is the same setting
  as `reserve.percentA` and stays in sync with the drawer.
- Dragging only updates the label.
- **Releasing** restarts both canteens from time 0 with the same seed. It applies any pending drawer changes and keeps
  play/pause and speed. This is the one exception to "apply on Restart".

**Narrow screens (< 900 px)**

- A is stacked above B. Both are drawn at once (scissored viewports), each `max(34vh, 200px)` tall, with cameras
  linked.
- The A slider sits directly above viewport A.
- The two counter panels merge into one table: metric | A | B.
- No tabs; no horizontal page scroll; 16 px side gutter.

### 11.2 Playback

**Frame loop**

- `dt = min(rafDt, 100 ms)`; `simTargetMs += dt × speed`.
- A and B advance alternately, one tick at a time, toward `simTargetMs`, with at most 8 ms of sim work per frame.
  The budget is checked only after B has completed the tick A just ran, so A and B always end a frame at the same
  tick.
- If that budget is hit, the clock falls behind. The top bar shows *"running at N×"*, and the unmet time is dropped,
  not carried as debt.

**Skip to**

- Runs in ≤ 8 ms slices per frame, with both engines advanced to the same ms.
- Shows progress and can be cancelled.
- A target earlier than now rebuilds both engines and replays from 0.
- A target past the end runs to done.

**Restart**

- Rebuilds both engines at time 0 with the pending settings, and leaves them **paused**.
- Keeps the camera preset and drops the follow target.
- The renderer reallocates the dynamic instanced meshes at capacity = the new engine's actual arrivals (≤ totalPeople
  + 5), and disposes the old geometries, materials and textures. The A-slider release (§11.1) does the same.

**First load**

- The app loads **paused at `crowd.windowStart`**.

### 11.3 Cameras and follow mode

**Camera presets**

- 3/4 view (default), top-down and follow a group.
- Cameras are linked by default; a toggle unlinks them.

**Follow mode** (R5)

- Picks a random group, using UI-only randomness, never the sim RNG, from groups that have arrived and not exited in
  **both** canteens.
- Only orbit yaw, pitch and distance are linked between the two views.
- Each viewport's target is the centroid of that group's members still inside **its own** canteen, critically damped
  with a 0.5 s time constant.
- When the group exits one canteen, that camera holds at the exit and shows *"left at hh:mm"*. When it has exited
  both, a new group is picked.

### 11.4 End of lunch

- When one engine is done, its viewport shows *"Finished at {clock}"* and its counters freeze. A truncated engine
  shows *"Run truncated at {clock}"*.
- When both are done:
  - Play is disabled.
  - A card shows P1–P4 for A, B and the free-flow advantage, captioned *"This is one lunch."*
  - The card has a **See 30 lunches** button that opens the batch view (precomputed when on defaults).
- Restart closes the card.

### 11.5 First visit

A dismissible **How this works** panel:

1. *"Left, canteen A: some groups reserve a whole table with a bottle, umbrella or lanyard before buying food. Right,
   canteen B: everyone buys food first, then sits anywhere."*
2. *"Both canteens get exactly the same people, arriving at the same times and choosing the same food."*
3. *"A glowing ring marks a table with seats kept for someone who isn't there yet."*
4. *"One lunch can be luck. The Evidence panel shows 30."*
5. *"Change anything in ⚙; the Assumptions panel lists what's fixed."*

Buttons:

- **Start lunch** (plays at 60×)
- **Show evidence**

Dismissal is remembered in `localStorage`, inside try/catch. Without storage, the panel shows once per page load.
**?** reopens it.

### 11.6 3D scene

**Style**

- Clean low-poly with soft lighting and cut-away low walls.
- Stalls are numbered counters with coloured awnings; the tray return and the IN/OUT doors are labelled.
- All geometry is procedural, with no external model or texture files.

**People and colour classes**

- People are simple figures (body plus head). A small tray shows while they carry food.
- Colour classes, in precedence order:

  | Class | Who |
  |---|---|
  | Claiming a table | claimer or convoy during claim search, and while placing the object |
  | Queuing | from reaching the chosen stall's walkway stop until service end (walking to the slot, in a queue, being served), or waiting at a walkway stop because every queue is full |
  | Searching with food | free-flow searcher |
  | Holding seats | seated, while own party still has members not sitting (both canteens) |
  | Eating | any other seated person, including those waiting for groupmates to finish and those lingering |
  | Walked away | walk-away members holding food, from the decision until they exit; they fade out |
  | Walking | everyone else: entering and walking to a stall, R6 waiters and others carrying food who are not searching (tray cue), walking with food to a seat, going to the tray return or the exit |

- A walk-away member without food at the decision stays in its buying class until service end, then turns
  *walked away*.
- The **tray** is a second, non-colour cue.
- A **colour by group** toggle is available.
- The 7 person classes and the 6 seat-state colours are chosen with the dataviz method and pass a colour-vision-deficiency
  check in both themes.

**Rings and objects**

- **Ring:** a ring glows under every table that has at least one `held` or `claimedEmpty` seat, in **both** canteens,
  with the same colour and pulse. Its legend entry reads *"Seats kept for someone not here yet"*.
- **Objects:** a bottle, umbrella or lanyard model sits on each claimed table.

**Seat overlay.** Optional; it tints each seat by its §7.1 state.

**Waiters at nodes**

- People waiting to enter an edge stand back along their incoming edge, 0.6 m apart, by wait rank.
- Other node waiters (R6 waiters, all-full waiters) stand in a spiral on the node's open side, away from tables and
  counters. The `j`-th such waiter at a node (`j = 0, 1, …` in order of arrival at the node; this is
  `view().waitRank`) is drawn at radius `0.5·ceil(√j)` m and angle `j·137.5°`.
- Tray-return waiters form a line north from the counter, 0.6 m apart, turning west after 4.
- This is rendering only.

**Legend.** A legend strip sits under each viewport, collapsible below 900 px. It lists the person classes, the tray
cue, the ring and the object.

**Labels.** Seat-state labels are as in §7.1. Every counter and metric has an ⓘ with its one-sentence definition. All
strings live in `src/ui/labels.ts`.

### 11.7 Picking

- **Analytic picking**, with no Raycaster:
  - The ray is built from the viewport under the pointer.
  - People are upright cylinders (r 0.25 m, h 1.7 m) at their interpolated positions; the nearest hit wins.
  - Tables are picked by ray–plane intersection at table height, then grid arithmetic.
  - People take precedence over tables.
- **Hover card (person):** group id, size, colour class, minutes in state, and whether they are a reserver or claimer.
- **Table card:** seat states and how long the table has been claimed.
- **Touch:** a tap acts as hover, and a tap outside dismisses the card.

### 11.8 Theme

**Follows the system by default**

- The theme follows `prefers-color-scheme`. The top-bar toggle sets `data-theme` on `:root`.
- Dark tokens are defined under `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` and under
  `:root[data-theme="dark"]`.
- `body` has an explicit background.

**Scene colours**

- Scene colour tokens are authored as `#rrggbb`, and a test asserts the format.
- They are read with `getComputedStyle(document.documentElement).getPropertyValue(name).trim()` and applied with
  `Color.set`.
- State-coded meshes use `MeshBasicMaterial` (no tone mapping, sRGB output), so the pixel equals the token. Lit
  materials are used only for neutral geometry.
- The clear colour comes from the panel background token.

**On a theme change**, the app updates materials, rewrites the instance colours and re-rasterises the labels.

**Labels** are `CanvasTexture` sprites drawn with `fillText` in the system-ui stack at 2× resolution. One atlas is
shared by both scenes, and the old texture is disposed when re-rasterised.

### 11.9 Rendering technique

**Renderer and meshes**

- One `WebGLRenderer` draws two scenes into scissored viewports.
- Dynamic `InstancedMesh` objects (figures, trays, seat tints, rings) use `frustumCulled = false` and
  `DynamicDrawUsage`.
- Active people are compacted into the first `count` instances, with an `instanceToPerson` map.

**Positions**

- Each frame, positions come from the engine's segment data: `lerp(clamp((renderMs − t0)/(t1 − t0), 0, 1))`.
- Followers are then clamped behind their lane leader, and waiters are placed as in §11.6.

**Effects**

- Walked-away figures move to a translucent mesh (opacity 0.4, no depth write) for their last 3 s, then are removed.
- The ring is additive-blended and pulses at 1 Hz. There is no post-processing.

**Performance**

- There are no dynamic shadows; people get a static contact disc.
- Pixel ratio is capped at 2, and drops to 1 if frame time stays above 33 ms for 2 s.
- Target: 60 fps at defaults, ≥ 30 fps at the max config.

### 11.10 Error states

1. **No WebGL.** Both viewports show *"The 3D view needs WebGL, which this browser has blocked. Live numbers and batch
   runs still work."* The engines, counters and charts keep running, and nothing is logged with `console.error`.
2. **`webglcontextlost`.** Rendering stops while the sim continues, and the view shows *"3D view paused — Restore"*.
   On restore, all meshes are rebuilt.
3. **Engine exception.** Both engines stop, and a banner shows the message, time, seed and settings code, with a
   **Copy details** button.
4. **Bad import.** Unparseable JSON or codes, or an unsupported `v`, are rejected whole, and the current settings stay
   unchanged. An inline message appears next to the control used:
   - for a settings code, the §9.4 message;
   - for a JSON import, *"This file isn't a valid Canteen Sim settings file or is from a newer version."*
5. **Batch failure.** Batch cancel and batch errors behave as in §10.5.

### 11.11 Accessibility and touch

**Controls**

- All controls are native `<button>`, `<input type=range>` or `<select>`.
- Icon buttons have `aria-label`s (Settings, Batch runs, Play, Pause, How this works).
- Focus rings stay visible.
- Space toggles play/pause when focus is not in a text field.

**Readability**

- Text contrast is ≥ 4.5:1 in both themes.
- Stacked bars are labelled directly.
- Every chart has a *Show table* toggle that renders its series as an HTML table. This includes the live
  seat-states-over-time panels (§7.6) and all batch charts (§10.7).
- Each 3D canvas has `role=img` and a label.

**Motion.** Under `prefers-reduced-motion`, camera moves and follow mode cut instead of animating.

**Touch gestures**

- One finger orbits.
- Two fingers pan and pinch-zoom.
- A tap acts as hover.

### 11.12 Assumptions panel

- A drawer shows the §15 ledger under its headings, from `src/config/assumptions.ts`.
- Items that map to a setting show its current value and a **Change** link that opens ⚙ at that setting. Every other
  item is tagged *"Fixed in this model"*.
- A test checks that every §15 bullet appears in the panel.

---

## 12. Architecture

```
src/
  config/  schema.ts presets.ts url.ts validate.ts load.ts assumptions.ts
  sim/     (pure TypeScript; no DOM, no three.js, no UI libraries)
           version.ts rng.ts dmath.ts population.ts layout.ts navgraph.ts routing.ts movement.ts
           stalls.ts seating.ts agents.ts metrics.ts events.ts engine.ts
  batch/   worker.ts runner.ts stats.ts csv.ts precompute.ts
  render/  scene.ts people.ts props.ts overlays.ts labels.ts cameras.ts picking.ts theme.ts
  ui/      app.tsx topbar.tsx settings.tsx assumptions.tsx livestats.tsx batchview.tsx evidence.tsx
           howto.tsx charts.ts labels.ts theme.css
```

### 12.1 Engine interface

```ts
createEngine(config, opts?: { seed?: number; reserveFraction?: number }): Engine
// opts override config.seed and config.reserve.percentA (A passes the config value, B passes 0)

engine.advanceTo(simMs)      // processes every event with time ≤ simMs; stops early when done
engine.step(maxEvents)       // processes ≤ maxEvents events and returns the count (batch fallback)
engine.nowMs; engine.done; engine.truncated
engine.layout                // static geometry for the renderer (metres at this boundary)
engine.static                // personId, personGroup, groupSize, isReserver (dense index order)
engine.view()                // reused typed arrays, valid until the next advance
engine.live()                // §7.6 counters and per-state seat counts
engine.series()              // per-minute seat-state and sit-count bins
engine.progress()            // exited ÷ arrivals
engine.metrics()             // RunMetrics incl. breakdowns and events per kind; throws unless done
engine.runHash(); engine.stateHash()

pairMetrics(levelRun, baselineRun): PairMetrics   // pure function in src/sim/metrics.ts (§7.7)
```

**`view()` contents**

- Per person (dense index):
  - active, colour class, carrying tray, walkedAway, stateSinceMs;
  - current segment `x0, y0, x1, y1` (plan metres) and `t0, t1` (ms, Float64);
  - lane offset, leader index (−1 if none), waitRank, waitNode.
- Per table: claimed, complete, objectType, claimSinceMs, ring flag.
- Per seat: the §7.1 state code.
- A version counter.

**Where engines run.** Live engines run on the **main thread**; workers are used only for batch runs.

### 12.2 Performance rules (normative)

1. **No per-event work proportional to the number of seats, tables, people or nodes.**
   - Seat-state time comes from six per-state seat totals, updated at each state change.
   - When the clock advances by Δ ms, Δ is split at every whole-minute boundary. For each part, each state total ×
     that part is added to its Float64 accumulator and to that minute's bin. While ≥ 1 stuck searcher exists, it is
     also added to the §7.3 demand accumulators. This makes the minute bins independent of how the run is stepped.
   - **Exceptions**, only on a searcher's node arrival:
     - observation over the node's precomputed visible-table list;
     - target recomputation over the searcher's memory;
     - choosing an explore target over intersections.
2. **Waiting agents never poll.**
   - Each edge-direction keeps a FIFO.
   - An exit, a busy-node release or a link reopening re-examines only the heads of the affected FIFOs.
3. **Layout precompute is built once per layout and visibility, and cached across runs in a worker.** It covers:
   - routing-node distances and next-hop sets;
   - node-to-table distance tables;
   - per-node visible-table lists.
4. **Searcher memory is allocated at search start and freed at search end.**
5. **Per-person draws are computed lazily, only for accepted people.**
6. **State lives in typed arrays.** Engine state is in typed arrays indexed by dense ids, and the event queue is a
   binary heap on typed arrays. Times are never stored in `Float32Array`.
7. **The 1 s budget excludes invariant checks.**
8. **Memory.**
   - Minute bins and time series are preallocated Float64Arrays of `ceil(simEnd / 60,000) + 1` minutes.
   - The rolling "sit starts in the last 60 min" counter is a 60-bin ring buffer of per-minute counts.
   - No per-event log is kept. The run hash is folded incrementally as each event is processed; the final metrics are
     folded in at done.

### 12.3 Stack and boundaries

**Stack**

- Vite + TypeScript (strict)
- three.js for 3D
- Preact + signals for the panels
- uPlot for charts
- Vitest + fast-check for unit and property tests
- Playwright for browser tests

**Build**

- `vite-plugin-singlefile` produces one self-contained `dist/index.html`.
- The batch worker is imported with `?worker&inline`, `worker.format = 'iife'`.
- No dynamic `import()` under `src/sim` or `src/batch`.
- Size budget: `dist/index.html` ≤ 1.5 MB.

**Boundaries.** A lint rule forbids `src/sim` and `src/batch` from importing three, preact, uplot or DOM APIs.

**Locale.** All UI formatting uses the fixed locale `en-GB`: a 24-hour clock and `.` as the decimal separator. No
locale-sensitive call is made without an explicit locale.

---

## 13. Testing

Development is test-driven: every rule gets a failing test first.

### 13.1 Rule tests (Vitest)

**Layout**

- Default dimensions (§3.4): 600 seats, 18/12 stalls, queue capacity 12, lane counts.
- `queueDepth` 5.6 → capacity 14; 9.2 → capacity 26.
- Every default seat-to-seat edge is exactly 600 mm with capacity 1.
- The next-hop set from (vertical aisle 6, concourse) toward stall 0's walkway stop contains both the north and the
  west neighbour.

**Validation**

- Frontage < 1.8 m is blocked.
- `seatsPerSide = 2` with a non-zero size-5 share is blocked; with sizes 5 and 6 at 0%, it is accepted.
- Door rules, with `stallCount = 10` and other settings at defaults:
  - `cols = 1` (W = 12,200 mm) is blocked by both *doors overlap* and *entrance overlaps the tray return*;
  - `cols = 2` (W = 15,200 mm) is blocked by *entrance overlaps the tray return* only;
  - `cols = 3` (W = 18,200 mm) is accepted.

**Claims and sharing**

- A claimed table blocks every seat to strangers.
- The sharing rule (§5.6):
  - it requires the whole group to be seated;
  - it is checked at every join: pair + pair leaves 2 and closes; solo + solo leaves 4 and stays open;
  - only parties ≤ `shareMaxParty` may join;
  - an incomplete group means refusal;
  - with `shareMinEmpty = 1`, a pair never joins a table with exactly 1 empty seat, and a solo does;
  - the object leaves with the group and joiners stay.
- Claim cutoff:
  - a target chosen before the cutoff is still claimed;
  - with limit 0, only tables visible at entry can be claimed;
  - fallback resets memory and uses the patience start rule.
- Claim modes: `oneClaimer` members queue on entry; `together` convoy members walk the leader's node sequence under
  lane rules.
- Reserver seat assignment: members already holding food at the claim ms are assigned at that ms, in (service-end ms,
  person id) order, and start walking then. Their assigned seats are `held`.
- After the cutoff, a pursued target seen occupied at a node arrival causes fallback at that ms.

**Free flow**

- A party needs `n` seats at one table.
- The first member with food searches. Same-ms ties go to the lowest id.
- All `n` seats are held from commit.
- Asking at an occupied unclaimed table; refusal when the seats are held; the refusal lasts 180 s.

**Seat choice**

- `n = 4` at an empty 6-seat table, with the searcher at seat 0's or seat 1's access node, picks N0, N1, S0, S1.
- Joiners next to claimers at N0, N1 take S1, S2.
- Reservers fill the claimer's side first.

**Walk-aways and leaving**

- Patience expiry makes the whole group walk away. Members without food finish buying, then return trays.
- A pending ask decides the outcome before a walk-away. A committed party never walks away.
- Groups stand up together. Everyone passes the tray return before exiting.

**Movement**

- 1-lane links:
  - no passing inside a link;
  - batch alternation works: a batch is formed from the earliest waiter's direction, and later same-direction
    arrivals wait for the next batch;
  - **starvation bound:** on a single 1-lane link with continuous two-way arrivals, every waiter enters within
    `(w + 1)·(T_L + c_L·h) + 5,000·a` ms of starting to wait, where:
    - `w` = agents registered on the link plus waiters for it (either direction) with a smaller (wait start, person
      id) at the moment it starts waiting;
    - `T_L` = the sum of the link's edge travel ms at `min(walkSpeed, traySpeed)`;
    - `c_L` = the sum of per-lane capacities of the link's edges;
    - `h` = `headwayMs` at that speed;
    - `a` = the number of busy-node actions on the link during the wait.
  - **U-turns:** after a `together`-mode placement on a 1-lane aisle, two followers waiting at adjacent mid-link nodes
    both turn back, and both leave the link within `2·(T_L + h)` of the place end.
- A busy node delays a passer by at most the remaining duration of each action in progress there: ≤ 3,000 ms for sit,
  stand or place, and ≤ 5,000 ms for an ask.
- **Headway on a short edge:** on the default 256 mm edge from stall 29's walkway stop (7300, 33994) to the concourse
  intersection, an agent entering at `t` exits at `t + 197`. A follower admitted at `t + 197` exits at `t + 659`.
- **FIFO order:** an agent that reaches a node never enters ahead of an agent already waiting in that edge-direction's
  FIFO.
- A lone walker covers a 30 m seated aisle at 1.3 m/s within 1 ms per edge of `30/1.3` s; a lone tray-carrier at
  1.0 m/s within the same tolerance of 30 s.

**Stalls**

- `queueLength` counts people walking to the stall, and never exceeds `2m`.
- Two people arriving at a walkway stop never share a position. A walker makes the move-ups it missed on arrival.
- The all-full re-choose runs every 5,000 ms.

### 13.2 Layout property tests (fast-check over all §9.1 ranges)

- Every stop node lies within its line's extent.
- No edge is shorter than 50 mm, and every capacity is ≥ 1.
- Every seat access node, stall stop, tray return and door is reachable from the entrance.
- `N_nodes < 2¹⁶`.

### 13.3 Invariants

**Checked, under the compile-time flag `__SIM_INVARIANTS__` (stripped in production)**

- No seat has two occupants.
- Each seat is in exactly one §7.1 state.
- `arrived = inside + exited`.
- Lane capacity, link-direction and busy-node rules hold.
- Nobody sits at a claimed table except its group or valid joiners.
- At done, `arrivals = seated diners + walk-aways`, where seated diners are people with a sit start.
- `truncated = false` for generated configs with `ρ̄ ≤ 0.8`.

**Bounds**

- fast-check configs are bounded to ≤ 400 people, ≤ 6 × 6 tables and ≤ 90 min windows. They use `numRuns = 200`, with
  full checks after every event.
- Default-size runs check every 1,000th event and at the end.

### 13.4 Model sanity

- **Default termination.** At defaults, seeds 1–30, A at 100% and B: every run ends with `truncated = false` and
  exited = arrivals.
- **Small crowd.** `totalPeople = 100`, seeds 1–30, A at 100% and B: 0 walk-aways, and *seats blocked while needed*
  ≤ 1%, in every run.
- **Maximum patience.** `totalPeople = 100`, `search.patience = 30 min`, seeds 1–30, A at 100% and B: 0 walk-aways in
  every run.
- **Crowd size.**
  - `totalPeople ∈ {400, 1000, 1800, 2600}` (nested), seeds 1–30, A at 100% and B separately.
  - For each consecutive pair, the mean over seeds of the paired difference in walk-away **count** (larger crowd −
    smaller crowd) is ≥ −2·SE, where SE = sd(paired differences)/√30.
  - Per-seed monotonicity is never asserted.
- **Queue aversion.** `queueAversion` 0 vs 5, B only, seeds 1–30: the stall HHI `Σ(served_s/served)²` is higher at 0
  in ≥ 25 of 30 seeds.
- **Little's law.** Two exact integer identities, per stall, on every non-truncated run, with no tolerance:
  1. the ms-sum of people who have reached a slot but not started service = Σ over them of (service start − queue
     join);
  2. the ms-sum of people who have reached a slot but not finished service = Σ over them of (service end − queue
     join).
- **M/G/1 module test.** Poisson arrivals, infinite capacity, `ρ = 0.7`, lognormal service with CV 0.5. The mean wait
  over 10⁶ customers is within 5% of `λm²(1+c²)/(2(1−λm))`.
- **Mechanism test (Reservation-friendly preset, 30 seeds).** People in groups that claimed a table in A have a lower
  median food-to-seat time than the same people in B, and the paired 95% CI excludes 0. **No test asserts which
  canteen wins any headline metric.**
  - *Implementation finding (Plan 2), awaiting the owner's decision:* this expectation **does not hold** in the model.
    The median rises (A − B ≈ +6 s): claims succeed mostly early, at empty tables visible from the entrance, which lie
    farther from the stalls than the tables the same groups find in B off-peak. The mean falls (A − B ≈ −7.5 s, 95% CI
    −9.8 to −5.2): the search a claim avoids shows in the peak and the tail. The suite keeps the median test as a
    documented expected failure and adds the mean as a supplementary check; the model was not changed.

### 13.5 Common random numbers

- **A ≡ B at 0%.** Checked with each engine alone and with both interleaved in one process; per-tick `stateHash` and
  `runHash` must match across modes.
- Reservers are nested: for `p1 < p2`, reservers at `p1` ⊆ reservers at `p2`.
- At 100%, every person's input record (personId, arrival ms, size, service and eat percentiles, Gumbel vector) is
  identical in A and B.
- **Nested crowds.** At `N1 = 800` vs `N2 = 2600`, the accepted groups are nested and have identical draws.
  Likewise at 1,000 vs 1,050 people.
- **Correlation.** At defaults with `p = 0.25`, the correlation of A's and B's mean queue wait over seeds 1–30 is
  ≥ 0.5.
- **RNG quality.** Over 10⁵ persons, `|corr(u_service, u_eat)| < 0.01`, and a 100-bin χ² test of `u` passes at
  α = 0.001.
- **dmath.** Accuracy per §8.5. For 10⁴ values of `u`, the arrival ms `t` satisfies `F(t − 1) < u ≤ F(t)`.
  Reference arrival ms for groupIds 0–9 at seed 1 are pinned.

### 13.6 Determinism

- **Same inputs, same hash.** Chunk independence: random chunk schedules give identical hashes.
- **Self-test mode.** `dist/index.html?selftest=1` creates no renderer.
  - It runs these scenarios on the main thread and in a worker, 3 times each: Default lunch (A and B), Crush,
    Reservation-friendly, `cv = 0` with skew 0, and 20 × 20, `k = 4`, 1,000 people.
  - It writes `window.__selftest = {scenario: {hash, checkpoints every 10 sim-min}}`.
- **Golden hashes.** Playwright (Chromium, Firefox, WebKit) compares the self-test against `tests/golden/hashes.json`,
  generated in Node by `npm run golden:update`, and reports the first differing checkpoint.
- **Worker equivalence** is tested in Playwright, not Vitest.

### 13.7 Statistics

Hand-computed paired-t CIs are checked, including:

- a `df` from the table and one from the expansion;
- the all-equal and tie-flag cases;
- win/tie/loss counts with ties;
- nearest-rank quantiles;
- null dropping.

### 13.8 Browser tests (Playwright, over `vite preview` of `dist/`)

**Launch.** Chromium runs with `--use-angle=swiftshader --enable-unsafe-swiftshader`.

**Smoke**

- The page loads with no console errors.
- *Skip to 12:30*, then play 120 frames at 120×.
- A 2-seed batch completes.
- Settings round-trip through the URL and through the settings code.
- The narrow layout (375 px) has no horizontal scroll and shows A and B stacked.
- Locale: `th-TH` and `de-DE` give byte-identical clock, counters and first CSV row to `en-GB`.

**Fallback**

- `dist/index.html` is served with `Content-Security-Policy: worker-src 'none'`, and separately inside
  `<iframe sandbox="allow-scripts">`.
- A 2-seed batch must complete through the fallback, with the same hashes as a worker run.

**Other**

- No WebGL shows the §11.10 message with no `console.error`.
- Precomputed evidence: the embedded hashes equal a fresh run.

### 13.9 Performance (`npm run bench`, Node 22)

- A (100%) and B are timed separately: 1 warm-up run, then the median of 5.
- The timed span is `createEngine` + `advanceTo(end)`, with the layout cache warm.
- Target: ≤ 1.0 s each on the reference machine (Apple M2).
- The bench reports events per run and events/s.
- **CI fails** if events per run drift more than 10% from `tests/golden/bench.json`, or if either median exceeds
  3.0 s.

---

## 14. Build and publishing

- **Commands.**
  - `npm run dev` for development.
  - `npm test` (Vitest).
  - `npm run test:e2e` (Playwright).
  - `npm run bench`.
  - `npm run precompute`, then `npm run build`, which produces `dist/index.html`.
- **Page.** `<title>Canteen Sim</title>`, `<html lang="en">`. There are no external requests, and everything is
  inlined.
- **Publishing.** `dist/index.html` is published as a **private claude.ai artifact**. Republishing goes to the same
  artifact URL, recorded in the README, so shared links never change.
- **Fallbacks inside the artifact sandbox:**
  - time-sliced batch runs (§10.5);
  - settings codes (§9.4).
- **Repo.** The GitHub repo `kengggg/canteen-sim` is private. The README covers:
  - what it is, and the private link;
  - run, test, build;
  - publish/update;
  - reproducing a result (settings code + seed + `MODEL_VERSION`);
  - links to this spec and the §15 ledger.

---

## 15. Assumptions and fairness ledger

This ledger is also shown in-app (§11.12).

**Left out — would make reservation look worse (conservative toward the owner's hypothesis)**

- Reserving long before arriving.
- One group claiming several tables.
- Claims abandoned when a group leaves early.

**Built in — helps reservation**

- Reservers return with food straight to their table, with no search.
- One claimer by default: groupmates queue at once and learn the table instantly.
- The claim target is chosen near the members' stalls.
- Solos and pairs may share a seated reserved table (owner's rule).
- Reservers fall back to free flow when no empty table is found.
- Free-flow groups never split: if `n` seats at one table can't be found within patience, the whole group walks away
  (decisions #3, #12). The *split-feasible walk-aways* diagnostic shows how often scattered seats existed.
- With `search.parallel` off (the default), free-flow groupmates with food wait at their stall instead of searching in
  parallel.
- The Reservation-friendly preset.

**Built in — helps free flow**

- Routes never get lost.
- Held seats are always respected once asked about.
- Visibility has no occlusion.
- People waiting at nodes block no one. R6 waiters standing with food are almost all free-flow. The *standing with
  food* counter and person-minutes make this visible.

**Direction unclear**

- Strangers moving objects is not modelled: it would mean fewer blocked seats, but reservers lose their tables.
- No preference for empty tables at `search.emptyTableDetour = 0`. This packs free-flow parties tighter, which helps
  big free-flow groups but leaves more empty tables for claimers.
- No hovering beside diners about to leave. Modelling it would shorten free-flow searches but block 1-lane aisles.

**Neutral — identical in A and B**

- Mesoscopic lanes instead of collisions.
- Static routing.
- Everyone can see queue lengths.
- Fixed patience.
- The same eating-time distribution.
- Held seats look empty from afar, and sitting at any table where someone is seated requires asking.

**Identical in A and B, but not neutral in effect**

- Stall capacity (one server per stall, `stalls.serviceMean`). Longer queues lengthen every claim's `claimedEmpty` time
  and every free-flow hold. See the service-time sweep and the Load readout.

**Metric choices disclosed**

- In the diagnostic seat-efficiency ratio, `openToSmall` seats are shown both as available and as waste. The headline
  seat metric (P3) counts only `occupied` seats.

---

## 16. Decisions log

### 16.1 Owner-confirmed decisions

| # | Decision |
|---|---|
| 1 | Metrics: seat utilization, wait/search time, walk-aways, peak throughput |
| 2 | Side-by-side A/B on the identical seeded crowd, plus reserve-% slider |
| 3 | Free-flow groups need `n` seats at one table and share tables with strangers |
| 4 | 3D + live stats + batch runs with confidence intervals |
| 5 | Any object claims the whole table (an object doesn't reveal group size); no "claim only needed seats" option; solos who reserve also claim the whole table |
| 6 | Default group mix 25/30/20/15/5/5 %; sensible defaults, no real data |
| 7 | Vite + TS project, single-file build, published as a private claude.ai link; private GitHub repo `kengggg/canteen-sim` |
| 8 | English only |
| 9 | Approach A: agents on an aisle network |
| 10 | 10 × 10 grid; 1.2 m vertical / 0.75 m horizontal aisles; stalls in an L (top + left); entrance and exit on the bottom wall, right third, entrance left of exit |
| 11 | No cashier (payment at stalls); tray return at bottom-left; everyone returns trays |
| 12 | Walk-away rule (5 min patience, whole group) and 10 m visibility |
| 13 | Both batch sweeps; settings configurable, including layout |
| 14 | Sharing rule: once the reserving group is fully seated, a solo or pair may join if ≥ 4 seats are empty, **checked at every join** |
| 15 | Default `stalls.serviceMean` stays 1.5 min, with the Load readout and service-time sweep |
| 16 | Default claim mode: **one claimer** (`together` stays available as a setting) |
| 17 | Live-view default `reserve.percentA` = **50%** |
| 18 | Primary endpoints P1–P4 at 100% vs 0%, 95% uncorrected; everything else secondary |

### 16.2 Refinements by the spec author (for owner review)

| # | Refinement | Why |
|---|---|---|
| R1 | Stall split is 18 top / 12 left (≈ 2.2–2.3 m each), not the rough 16/14 estimate | Exact geometry under the "proportional to wall length" rule |
| R2 | Tray return at the left end of the bottom concourse (x 8.5–11.5 m) | The left stall band and its queue zone run to the bottom wall |
| R3 | Claimers search for up to 60 s (a setting) before falling back; the limit is a cutoff on *new* targets | "Visible on arrival" alone would cause unrealistic fallbacks at the doorway |
| R4 | Event-driven movement with integer-ms event times and integer-mm geometry | ≈ 1 s per lunch; exact speeds, ties and capacities |
| R5 | Follow mode follows the same group in both canteens | Possible because the crowds are identical |
| R6 | Free-flow members who get food while their searcher is still searching wait at their stall's walkway (the `search.parallel` option changes this) | Needs an explicit rule |
| R7 | Queue capacity 12 per stall; people walking to a stall count toward its queue | Finite queue space, no overfill |
| R8 | `together` claim mode moves as a convoy of individual agents | Keeps lane rules intact |
| R9 | The headline seat metric is utilization (P3). *Seats blocked while needed* is secondary; the old ratio is a diagnostic | The old ratio counted idle claimed seats even when nobody needed them |
| R10 | Time metrics count walk-aways at their give-up time | Removes survivorship bias |
| R11 | Held seats look empty from afar, and sitting beside anyone requires asking, in both canteens | The same information problem applies to both policies |
| R12 | Reserver-cohort breakdown | Shows reservers' private gain and the cost to others |
| R13 | Per-pair peak window chosen by total seat pressure | A window fixed at the arrival peak over-weights claims |
| R14 | Lane direction rules apply per link; busy nodes during actions; node merging within 50 mm | Fixes impassable sub-edges and passing at every seat |
| R15 | Default evidence precomputed at build and embedded | The page otherwise opens on its weakest evidence |
| R16 | Narrow screens stack A above B (no tabs) | Keeps the side-by-side comparison on phones |
| R17 | Rings mark kept seats (`held` or `claimedEmpty`) in both canteens alike | The same kind of waiting seat-time looks the same in both |
| R18 | "Reservation-friendly" preset (renamed, stronger), checked by a mechanism test, never an outcome test | An honest best case for reservation |
| R19 | All edge entries happen in one admission step. 1-lane links alternate in batches, and U-turns deregister the agent | Removes self-blocking deadlocks and overtaking of waiting agents |
| R20 | Metrics split into RunMetrics (one run, hashed) and PairMetrics (P3, peak-window shares, cohorts) | Those metrics depend on the paired run |
| R21 | A reserver's assigned seat is `held` until the member sits; members already holding food are assigned at the claim | Defines seat state and timing for early members |
