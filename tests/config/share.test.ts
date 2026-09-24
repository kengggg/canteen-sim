import { readFileSync } from 'node:fs';
import fc from 'fast-check';
import { ASSUMPTIONS } from '../../src/config/assumptions';
import { clampConfig } from '../../src/config/clamp';
import { applyValues, exportJson, importJson } from '../../src/config/load';
import { META, getSetting, setSetting } from '../../src/config/meta';
import { defaultConfig } from '../../src/config/schema';
import { encodeHash, encodeQuery, parseShared, settingsCode } from '../../src/config/url';
import { validate } from '../../src/config/validate';
import { MODEL_VERSION } from '../../src/sim/version';

test('defaults encode to just the version, model and seed', () => {
  expect(encodeHash(defaultConfig())).toBe(`#v=1&m=${MODEL_VERSION}&seed=1`);
});

test('non-default values, mix and times round-trip through the hash and the settings code', () => {
  const c = defaultConfig();
  c.seed = 4000000000;
  c.crowd.totalPeople = 2600;
  c.crowd.groupMix = [5, 10, 15, 25, 20, 25];
  c.crowd.peakTime = 745;
  c.search.parallel = true;
  c.reserve.claimMode = 'together';
  c.stalls.serviceMean = 45;
  expect(encodeQuery(c)).toContain('crowd.groupMix=5.10.15.25.20.25');
  expect(encodeQuery(c)).toContain('crowd.peakTime=1225');
  for (const shared of [encodeHash(c), settingsCode(c), `https://example.test/app${encodeHash(c)}`]) {
    const d = parseShared(shared);
    expect(d.ok).toBe(true);
    if (!d.ok) return;
    expect(applyValues(d.values, d.model).cfg).toEqual(c);
  }
});

test('random in-range configs round-trip', () => {
  fc.assert(fc.property(fc.array(fc.integer({ min: 0, max: 1000 }), { minLength: META.length, maxLength: META.length }), (r) => {
    const c = defaultConfig();
    META.forEach((m, i) => {
      if (m.type === 'enum') setSetting(c, m.id, m.options![r[i] % m.options!.length]);
      else if (m.type === 'bool') setSetting(c, m.id, r[i] % 2 === 0);
      else if (m.type === 'mix6') setSetting(c, m.id, [r[i] % 100, 30, 20, 15, 5, 5]);
      else setSetting(c, m.id, m.min + ((r[i] % 1000) / 1000) * (m.max - m.min));
    });
    clampConfig(c);
    const d = parseShared(settingsCode(c));
    expect(d.ok).toBe(true);
    if (d.ok) {
      const back = applyValues(d.values, d.model).cfg;
      const again = structuredClone(c);
      const expected = applyValues(new Map(META.map((m) => [m.id, getSetting(again, m.id)])), MODEL_VERSION).cfg;
      expect(back).toEqual(expected);
    }
  }), { numRuns: 100 });
});

test('garbage, unknown share versions and bad values are rejected whole', () => {
  for (const bad of ['', 'hello', '!!!', '#v=2&m=1&seed=1', '#v=1&m=x&seed=1', '#v=1&m=1&crowd.totalPeople=lots', '#v=1&m=1&crowd.groupMix=1.2.3']) {
    expect(parseShared(bad).ok).toBe(false);
  }
});

test('unknown keys are ignored, out-of-range values clamped with a notice, other models flagged', () => {
  const d = parseShared('#v=1&m=99&seed=5&future.thing=3&crowd.totalPeople=99999&crowd.peakTime=0000');
  expect(d.ok).toBe(true);
  if (!d.ok) return;
  const r = applyValues(d.values, d.model);
  expect(r.cfg.crowd.totalPeople).toBe(5000);
  expect(r.cfg.crowd.peakTime).toBe(r.cfg.crowd.windowStart);
  expect(r.notices.join(' ')).toMatch(/adjusted/);
  expect(r.modelNotice).toEqual({ from: 99, to: MODEL_VERSION });
});

test('blocked combinations are repaired on load', () => {
  const d = parseShared('#v=1&m=1&seed=1&layout.seatsPerSide=2');
  if (!d.ok) throw new Error('decode');
  const r = applyValues(d.values, d.model);
  expect(r.cfg.crowd.groupMix).toEqual([25, 30, 20, 25, 0, 0]);
  expect(validate(r.cfg).blocking).toEqual([]);
  const f = parseShared('#v=1&m=1&seed=1&layout.rows=1&layout.stallCount=60');
  if (!f.ok) throw new Error('decode');
  const rf = applyValues(f.values, f.model);
  expect(validate(rf.cfg).blocking).toEqual([]);
  expect(rf.notices.length).toBeGreaterThan(0);
});

test('JSON export and import round-trip; invalid files are rejected', () => {
  const c = defaultConfig();
  c.eat.mean = 1500;
  const r = importJson(exportJson(c));
  expect('error' in r).toBe(false);
  if (!('error' in r)) expect(r.cfg).toEqual(c);
  expect('error' in importJson('{"app":"other"}')).toBe(true);
  expect('error' in importJson('not json')).toBe(true);
});

test('every §15 ledger bullet appears in the Assumptions panel data', () => {
  const spec = readFileSync(new URL('../../docs/superpowers/specs/2026-09-24-canteen-sim-design.md', import.meta.url), 'utf8');
  const sec = spec.slice(spec.indexOf('## 15. Assumptions'), spec.indexOf('## 16. Decisions'));
  const norm = (s: string) => s.replace(/[`*]/g, '').replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
  const bullets = sec.split('\n- ').slice(1).map((b) => norm(b.split('\n\n')[0]));
  const texts = new Set(ASSUMPTIONS.flatMap((g) => g.items.map((i) => norm(i.text))));
  expect(bullets.length).toBe(26);
  for (const b of bullets) expect(texts.has(b)).toBe(true);
  const headings = [...sec.matchAll(/\*\*(.+?)\*\*/g)].map((m) => norm(m[1]));
  expect(ASSUMPTIONS.map((g) => norm(g.heading))).toEqual(headings);
});
