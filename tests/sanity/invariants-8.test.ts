import { invariantProperty } from '../sim/helpers/invprop';

// 5 × 5 runs per file, 8 files: 200 runs in total with invariant checks after every event (spec §13.3).
test.each([0, 1, 2, 3, 4])('invariants after every event over random small configs (part 8, chunk %i)', (chunk) => {
  invariantProperty(5, 8 * 7919 + chunk * 104729);
});
