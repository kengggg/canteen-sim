import { defaultConfig } from '../../src/config/schema';
import { validate, toLayoutParams } from '../../src/config/validate';

const codes = (xs: { code: string }[]) => xs.map((x) => x.code).sort();

test('defaults are valid with no warnings', () => {
  expect(validate(defaultConfig())).toEqual({ blocking: [], warnings: [] });
});

test('defaults match spec §9.1 in internal units', () => {
  const c = defaultConfig();
  expect(c.crowd).toEqual({ totalPeople: 1800, windowStart: 660, windowEnd: 810, peakTime: 735, peakShare: 0.6, peakSpread: 900, groupMix: [25, 30, 20, 15, 5, 5] });
  expect(c.reserve).toEqual({ percentA: 0.5, claimMode: 'oneClaimer', claimSearchLimit: 60, shareMinEmpty: 4, shareMaxParty: 2 });
  expect(c.stalls.serviceMean).toBe(90);
  expect(c.eat.mean).toBe(1080);
  expect(c.search).toEqual({ visibility: 10, patience: 300, parallel: false, emptyTableDetour: 0 });
});

test('door rules with stallCount = 10 (spec §13.1)', () => {
  const at = (cols: number) => {
    const c = defaultConfig();
    c.layout.cols = cols;
    c.layout.stallCount = 10;
    return codes(validate(c).blocking);
  };
  expect(at(1)).toEqual(['doorsOverlap', 'entranceTray']);
  expect(at(2)).toEqual(['entranceTray']);
  expect(at(3)).toEqual([]);
});

test('frontage below 1.8 m is blocked', () => {
  const c = defaultConfig();
  c.layout.cols = 2;
  expect(codes(validate(c).blocking)).toContain('frontage');
});

test('groups larger than a table are blocked; zeroing their share fixes it', () => {
  const c = defaultConfig();
  c.layout.seatsPerSide = 2;
  expect(codes(validate(c).blocking)).toEqual(['groupTooBig']);
  c.crowd.groupMix = [25, 30, 20, 15, 0, 0];
  expect(validate(c).blocking).toEqual([]);
});

test('all-zero mix is blocked', () => {
  const c = defaultConfig();
  c.crowd.groupMix = [0, 0, 0, 0, 0, 0];
  expect(codes(validate(c).blocking)).toContain('mixZero');
});

test('warnings: tray speed, narrow vertical aisle, no sharing, load', () => {
  const c = defaultConfig();
  c.move.traySpeed = 1.5;
  c.layout.verticalAisle = 0.6;
  c.reserve.shareMinEmpty = 6;
  c.crowd.totalPeople = 5000;
  expect(codes(validate(c).warnings)).toEqual(['load', 'noSharing', 'traySpeed', 'verticalAisle']);
});

test('off-step metre values snap to 50 mm so geometry stays integer', () => {
  const c = defaultConfig();
  c.layout.verticalAisle = 1.234;
  c.layout.horizontalAisle = 0.777;
  c.layout.queueDepth = 5.04;
  const p = toLayoutParams(c);
  expect([p.verticalAisleMm, p.horizontalAisleMm, p.queueDepthMm]).toEqual([1250, 800, 5000]);
});
