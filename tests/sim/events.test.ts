import { EventQueue } from '../../src/sim/events';
import { uniform } from '../../src/sim/rng';

test('pops in (ms, kind, entity, seq) order; equal keys in insertion order', () => {
  const q = new EventQueue(4);
  const pushed: [number, number, number, number][] = [];
  for (let i = 0; i < 10_000; i++) {
    const ms = Math.floor(uniform(9, 1, i) * 50);
    const kind = 1 + Math.floor(uniform(9, 2, i) * 7);
    const ent = Math.floor(uniform(9, 3, i) * 20);
    q.push(ms, kind, ent, 1, i, 0);
    pushed.push([ms, kind, ent, i]);
  }
  pushed.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3]);
  const got: number[] = [];
  while (q.pop()) got.push(q.arg);
  expect(got).toEqual(pushed.map((x) => x[3]));
  expect(q.size).toBe(0);
});

test('a kind-6 event pushed at t while kind-7 events at t remain pops first', () => {
  const q = new EventQueue();
  q.push(100, 7, 5, 1, 1, 0);
  q.push(100, 7, 9, 1, 2, 0);
  expect(q.pop()).toBe(true);
  expect(q.arg).toBe(1);
  q.push(100, 6, 0, 2, 3, 0);
  expect(q.pop() && q.arg).toBe(3);
  expect(q.pop() && q.arg).toBe(2);
  expect(q.pop()).toBe(false);
});

test('fields and peek', () => {
  const q = new EventQueue();
  expect(q.peekMs()).toBe(Infinity);
  q.push(32_400_000, 3, 35_999, 11, -1, 42);
  expect(q.peekMs()).toBe(32_400_000);
  q.pop();
  expect([q.ms, q.kind, q.entity, q.type, q.arg, q.stamp]).toEqual([32_400_000, 3, 35_999, 11, -1, 42]);
});
