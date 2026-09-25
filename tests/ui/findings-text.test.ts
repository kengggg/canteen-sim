import { aboutTwoThirds, bracket, fold, howMuch, list, pc, range, runBelow, sgn, straddlesZero } from '../../src/ui/findings-text';

test('signed numbers and ranges', () => {
  expect(sgn(5.051)).toBe('+5.1');
  expect(sgn(-6.011)).toBe('−6.0');
  expect(sgn(0.04, 1)).toBe('0.0');
  expect(range(0.67, 0.69, 0, 100, '%')).toBe('67–69%');
  expect(range(0.6701, 0.6699, 0, 100, '%')).toBe('67%');
  expect(range(9.3, 6.5)).toBe('7–9');
  expect(bracket(-0.425, 0.61, 1, true)).toBe(' [−0.4, +0.6]');
  expect(bracket(-6.58, -5.44, 1)).toBe(' [−6.6, −5.4]');
  expect(bracket(null, 1, 1)).toBe('');
  expect(pc(0.2045)).toBe('20%');
  expect(list(['a'])).toBe('a');
  expect(list(['a', 'b', 'c'])).toBe('a, b and c');
});

test('judgement words need the data to back them', () => {
  expect(aboutTwoThirds([0.639, 0.669, 0.688])).toBe(true);
  expect(aboutTwoThirds([0.639, 0.8])).toBe(false);
  expect(fold(7.683 / 0.694)).toBe('more than tenfold');
  expect(fold(4.2)).toBe('about 4-fold');
  expect(howMuch(0.86)).toBe('most');
  expect(howMuch(0.97)).toBe('nearly all');
  expect(howMuch(0.3)).toBe('part');
  expect(straddlesZero(-7.1, 9.7)).toBe(true);
  expect(straddlesZero(0.1, 9.7)).toBe(false);
});

test('runBelow finds the contiguous stretch around the minimum only', () => {
  expect(runBelow([5, 1, 0.5, 2, 1, 5], 1.5)).toEqual([1, 2]);
  expect(runBelow([5, 3, 2], 1.5)).toBeNull();
  expect(runBelow([1, 1, 1], 1.5)).toEqual([0, 2]);
});
