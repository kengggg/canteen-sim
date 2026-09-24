import { chooseUnclaimed, chooseJoin, fillOrder, joinAllowed, seatStateOf, ownSeat, SEAT } from '../../src/sim/seating';

test('n = 4 at an empty 6-seat table picks N0, N1, S0, S1 from seat 0 or seat 1 access node', () => {
  expect(chooseUnclaimed(3, 0b111111, 4, 0b000001)).toEqual([0, 1, 3, 4]);
  expect(chooseUnclaimed(3, 0b111111, 4, 0b000010)).toEqual([0, 1, 3, 4]);
});

test('unclaimed key: fewer sides, then fewer runs, then more facing pairs, then here', () => {
  expect(chooseUnclaimed(3, 0b111111, 2, 0b100000)).toEqual([4, 5]); // one side, one run, here at S2
  expect(chooseUnclaimed(3, 0b111111, 3, 0)).toEqual([0, 1, 2]);
  expect(chooseUnclaimed(3, 0b101101, 2, 0)).toEqual([0, 2]); // one side beats a facing pair across two sides
});

test('joiners next to claimers at N0, N1 take S1, S2', () => {
  expect(chooseJoin(3, 0b111100, 0b000011, 2, 0)).toEqual([4, 5]);
});

test('reservers fill the claimer side first', () => {
  expect(fillOrder(3, 0)).toEqual([0, 1, 2, 3, 4, 5]);
  expect(fillOrder(3, 1)).toEqual([3, 4, 5, 0, 1, 2]);
  expect(fillOrder(4, 1)).toEqual([4, 5, 6, 7, 0, 1, 2, 3]);
});

test('sharing rule (§5.6): checked at every join', () => {
  const base = { complete: true, shareMaxParty: 2, shareMinEmpty: 4 };
  // Reserving pair leaves 4 empty: a pair may join, leaving 2: the table closes.
  expect(joinAllowed({ ...base, n: 2, freeCount: 4 })).toBe(true);
  expect(joinAllowed({ ...base, n: 1, freeCount: 2 })).toBe(false);
  // Reserving solo leaves 5: a solo joins, 4 remain, one more solo or pair may join.
  expect(joinAllowed({ ...base, n: 1, freeCount: 5 })).toBe(true);
  expect(joinAllowed({ ...base, n: 2, freeCount: 4 })).toBe(true);
  expect(joinAllowed({ ...base, n: 3, freeCount: 5 })).toBe(false);
  expect(joinAllowed({ ...base, complete: false, n: 1, freeCount: 5 })).toBe(false);
  // shareMinEmpty = 1: a pair never joins a table with exactly one empty seat; a solo does.
  expect(joinAllowed({ ...base, shareMinEmpty: 1, n: 2, freeCount: 1 })).toBe(false);
  expect(joinAllowed({ ...base, shareMinEmpty: 1, n: 1, freeCount: 1 })).toBe(true);
});

test('seat-state precedence', () => {
  const s = (o: Partial<Parameters<typeof seatStateOf>[0]>) =>
    seatStateOf({ occupied: false, held: false, claimed: false, complete: false, freeCount: 6, shareMinEmpty: 4, ...o });
  expect(s({ occupied: true, held: true, claimed: true })).toBe(SEAT.OCCUPIED);
  expect(s({ held: true, claimed: true })).toBe(SEAT.HELD);
  expect(s({ claimed: true })).toBe(SEAT.CLAIMED_EMPTY);
  expect(s({ claimed: true, complete: true, freeCount: 4 })).toBe(SEAT.OPEN);
  expect(s({ claimed: true, complete: true, freeCount: 3 })).toBe(SEAT.BLOCKED);
  expect(s({})).toBe(SEAT.FREE);
  expect([SEAT.FREE, SEAT.OPEN, SEAT.BLOCKED, SEAT.CLAIMED_EMPTY, SEAT.HELD, SEAT.OCCUPIED]).toEqual([0, 1, 2, 3, 4, 5]);
});

test("the searcher's own seat is the lowest here seat, else the lowest seat", () => {
  expect(ownSeat([0, 1, 3, 4], 0b000010)).toBe(1);
  expect(ownSeat([3, 4], 0b000001)).toBe(3);
});
