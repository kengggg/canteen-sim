import { Fnv, FNV_OFFSET } from '../../src/sim/hash';

test('empty stream is the FNV offset basis', () => {
  expect(new Fnv().h).toBe(FNV_OFFSET);
  expect(FNV_OFFSET).toBe(0x811c9dc5);
});

test('FNV-1a("a") known vector', () => {
  const f = new Fnv();
  f.byte(0x61);
  expect(f.h).toBe(0xe40c292c);
});

test('int hashes 4 little-endian bytes', () => {
  const a = new Fnv();
  a.int(1);
  const b = new Fnv();
  for (const x of [1, 0, 0, 0]) b.byte(x);
  expect(a.h).toBe(b.h);
  const c = new Fnv();
  c.int(-1);
  const d = new Fnv();
  for (const x of [255, 255, 255, 255]) d.byte(x);
  expect(c.h).toBe(d.h);
});

test('null float hashes the canonical NaN bytes; floats are 8 bytes LE', () => {
  const a = new Fnv();
  a.float(null);
  const b = new Fnv();
  for (const x of [0, 0, 0, 0, 0, 0, 0xf8, 0x7f]) b.byte(x);
  expect(a.h).toBe(b.h);
  const c = new Fnv();
  c.float(1);
  const d = new Fnv();
  for (const x of [0, 0, 0, 0, 0, 0, 0xf0, 0x3f]) d.byte(x);
  expect(c.h).toBe(d.h);
});
