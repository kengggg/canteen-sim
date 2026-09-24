import { clock, parseClock, num, int } from '../../src/ui/format';

test('clock uses integer math from minutes since midnight', () => {
  expect(clock(660, 0)).toBe('11:00');
  expect(clock(660, 74 * 60_000 + 59_999)).toBe('12:14');
  expect(clock(1435, 10 * 60_000)).toBe('00:05');
  expect(parseClock('1215')).toBe(735);
  expect(parseClock('12:15')).toBe(735);
  expect(parseClock('25:00')).toBeNull();
});

test('numbers use "." decimals and "," groups whatever the locale', () => {
  expect(num(1.25, 1)).toBe('1.3');
  expect(num(-0.04, 1)).toBe('0.0');
  expect(num(null)).toBe('—');
  expect(int(1801)).toBe('1,801');
  expect(int(1234567)).toBe('1,234,567');
});
