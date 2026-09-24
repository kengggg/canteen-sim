import { invariantProperty } from './helpers/invprop';

test('invariants hold after every event over random small configs (quick)', () => {
  invariantProperty(3, 20260924);
}, 240_000);
