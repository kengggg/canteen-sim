import { MODEL_VERSION } from '../src/sim/version';

test('model version is a positive integer', () => {
  expect(Number.isInteger(MODEL_VERSION)).toBe(true);
  expect(MODEL_VERSION).toBeGreaterThan(0);
});
