# Canteen Sim — Plan 1: Deterministic Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure, deterministic base layer of the canteen simulation: project scaffold, the counter-based
random numbers, deterministic math, the config schema with validation, the integer-millimetre layout, the aisle graph
and routing. It must be fully unit- and property-tested.

**Architecture:** Everything in this plan lives in `src/sim/` and `src/config/`, as plain TypeScript with no DOM,
three.js or UI imports. Geometry is integer millimetres, and random numbers are pure functions of identity. A lint
rule enforces the determinism allowlist from spec §8.5. Later plans (engine, batch, renderer, UI) consume these
modules through the exported interfaces listed in each task.

**Tech Stack:** Node 22, TypeScript 5 (strict), Vitest, fast-check, ESLint 9 (flat config) with typescript-eslint.

**Spec:** `docs/superpowers/specs/2026-09-24-canteen-sim-design.md`. Sections implemented here: §3 (units, layout),
§4.1 and §4.3 (aisle graph, routing), §8.1–8.2 and §8.5 (RNG, dmath, allowlist), and §9.1–9.2 (config defaults,
validation). The rest of the spec is covered by later plans.

**Plan series** (each produces working, tested software):

1. **Foundations** (this plan).
2. **Engine**:
   - population and nested crowds (§5.1, §8.3–8.4);
   - event queue and order (§8.5);
   - movement and lane rules (§4.2);
   - stalls, seating, claims and walk-aways (§5);
   - metrics (§7);
   - `createEngine` (§12.1), invariants, model sanity tests and the benchmark (§13.3–13.5, §13.9).
3. **Batch and statistics** (§10): sweeps, paired stats, the CSV, worker pool with fallback, and precompute.
4. **App**:
   - Vite single-file build;
   - three.js renderer (§11.6–11.9);
   - Preact UI (§11.1–11.5, §11.10–11.12);
   - config URL / code / JSON (§9.4);
   - presets (§9.3);
   - Playwright tests (§13.6, §13.8);
   - publishing (§14).

## Global Constraints

- **Integer geometry.** All plan geometry is integer millimetres (spec §3.0). No fractional mm may reach the graph.
- **No floats for derived integers.** Lane count is `Math.floor(widthMm / 600)`, and per-lane capacity is
  `max(1, Math.floor(lengthMm / 600))`.
- **Determinism allowlist** (spec §8.5), enforced by ESLint on `src/sim/**`:
  - allowed: `Math.sqrt / floor / ceil / round / trunc / abs / min / max / sign / imul / fround / clz32`;
  - banned: `**`, `Math.random`, every other `Math.*`, `Date`, `performance`, `Intl`, `toLocaleString`.
- **Module boundaries.** `src/sim/**` and `src/config/**` must not import three, preact, uplot or DOM APIs.
- **RNG.** `fmix32` is the murmur3 finaliser; `h(seed, stream, a, b) = fmix32((seed ^ fmix32(Math.imul(stream,
  0x9E3779B1) ^ fmix32(a ^ fmix32(b)))) >>> 0)`; `u = (h + 0.5) / 2³²`. Stream ids: arrival 1, size 2, accept 3,
  reserve 4, object 5, service 6, eat 7, stallNoise 8, stallRank 9, route 10, batchSeed 11.
- **dmath tolerances:** `dlog`, `dexp` ≤ 1e-13 relative; `dnorminv` ≤ 1.2e-9 relative; `dnormcdf` ≤ 1e-12 absolute.
- **Node merge distance** is 50 mm; after merging, every edge is > 50 mm.
- **Node ids:**
  - routing nodes first, by horizontal line index then x;
  - then stops on horizontal lines, by line index then x;
  - then left-walkway-only stops, by y;
  - `N_nodes < 2¹⁶`.
- **Default config values** (spec §9.1):

  | Setting | Default |
  |---|---|
  | `totalPeople` | 1800 |
  | window | 11:00–13:30 |
  | peak | 12:15 |
  | `peakShare` | 0.6 |
  | `peakSpread` | 900 s |
  | group mix | 25/30/20/15/5/5 |
  | `percentA` | 0.5 |
  | `claimMode` | oneClaimer |
  | `claimSearchLimit` | 60 s |
  | `shareMinEmpty` | 4 |
  | `shareMaxParty` | 2 |
  | `serviceMean` | 90 s |
  | `serviceCV` | 0.5 |
  | `popularitySkew` | 0.6 |
  | `queueAversion` | 1.0 |
  | `eat.mean` | 1080 s |
  | `eat.cv` | 0.3 |
  | `linger` | 0 |
  | walk / tray speed | 1.3 / 1.0 m/s |
  | visibility | 10 m |
  | patience | 300 s |
  | `parallel` | off |
  | `emptyTableDetour` | 0 |
  | `dropTime` | 5 s |
  | tray `slots` | 3 |
  | layout | 10 × 10, k = 3, 1.2 / 0.75 m aisles, 30 stalls, 5.0 m queue depth |

## Review Focus

1. **Hand-edited metre values not on the 50 mm step** (e.g. 0.777 m from a URL). Expected: snapped to 50 mm, so the
   geometry stays integer. The test is in Task 7.
2. **Degenerate layouts that still pass validation**, such as `rows = 1` (no horizontal aisles) or a single stall.
   Expected: the graph builds, is connected, and every seat and stall has a node. The test is in Task 6.
3. **Extreme seeds** (0 and 2³²−1). Expected: `uniform` stays strictly inside (0, 1) and is deterministic. The test is
   in Task 2.
4. **Probabilities at the extremes** (`u = 0.5/2³²` and `1 − 0.5/2³²`). Expected: `dnorminv` returns finite values.
   The test is in Task 3.
5. **The maximum layout** (20 × 20, k = 4, 3 m aisles, 60 stalls, 10 m queue). Expected: builds under `2¹⁶` nodes,
   and routing distances are symmetric. The test is in Task 6.

---

## File Structure

| File | Responsibility |
|---|---|
| `package.json`, `tsconfig.json`, `vitest.config.ts`, `eslint.config.js` | Tooling |
| `src/sim/rng.ts` | Counter-based RNG: `fmix32`, `hash4`, `uniform`, `STREAM` |
| `src/sim/dmath.ts` | `dexp`, `dlog`, `dnormcdf`, `dnorminv`, built only from allowed ops |
| `src/sim/layout.ts` | Config-independent layout geometry from `LayoutParams` (mm) |
| `src/sim/navgraph.ts` | Lines → nodes (merged), edges, links, role maps, node ids |
| `src/sim/routing.ts` | Dijkstra over routing nodes, `dist`, `options` (equal-shortest next moves) |
| `src/config/schema.ts` | `Config` type and `defaultConfig()` (internal units) |
| `src/config/validate.ts` | `toLayoutParams`, `validate` (blocking and warnings) |
| `tests/…` | One test file per module; `tests/golden/dmath.json` |

---

### Task 1: Project scaffold with the determinism lint rule

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `eslint.config.js`, `src/sim/version.ts`,
  `tests/scaffold.test.ts`
- Modify: `.gitignore` (already present; no change needed)

**Interfaces:**
- Produces: `MODEL_VERSION: number` from `src/sim/version.ts`, plus the `npm test` and `npm run lint` scripts.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "canteen-sim",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src tests",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 2: Install dev dependencies**

Run: `npm install -D typescript@^5 vitest@^3 fast-check@^3 eslint@^9 typescript-eslint@^8`
Expected: `node_modules/` is created, and `package.json` gains `devDependencies`.

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": false,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "lib": ["ES2022"],
    "types": ["vitest/globals"]
  },
  "include": ["src", "tests", "vitest.config.ts"]
}
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globals: true,
  },
});
```

- [ ] **Step 5: Create `eslint.config.js` with the allowlist**

```js
import tseslint from 'typescript-eslint';

const ALLOWED_MATH = ['sqrt', 'floor', 'ceil', 'round', 'trunc', 'abs', 'min', 'max', 'sign', 'imul', 'fround', 'clz32'];

export default tseslint.config(
  { ignores: ['node_modules', 'dist', 'coverage'] },
  ...tseslint.configs.recommended,
  {
    files: ['src/sim/**/*.ts', 'src/config/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: "BinaryExpression[operator='**']", message: '`**` is not deterministic across engines; use repeated multiplication or dmath.' },
        { selector: "AssignmentExpression[operator='**=']", message: '`**=` is not deterministic across engines.' },
        {
          selector: `MemberExpression[object.name='Math'][property.name!=/^(${ALLOWED_MATH.join('|')})$/]`,
          message: 'Only Math.sqrt/floor/ceil/round/trunc/abs/min/max/sign/imul/fround/clz32 are allowed in the sim (spec §8.5).',
        },
        { selector: "Identifier[name='Date']", message: 'Date is banned in the sim.' },
        { selector: "Identifier[name='performance']", message: 'performance is banned in the sim.' },
        { selector: "Identifier[name='Intl']", message: 'Intl is banned in the sim.' },
        { selector: "CallExpression[callee.property.name='toLocaleString']", message: 'toLocaleString is banned in the sim.' },
      ],
      'no-restricted-imports': ['error', { patterns: ['three', 'three/*', 'preact', 'preact/*', 'uplot', '@preact/*'] }],
    },
  },
);
```

- [ ] **Step 6: Create `src/sim/version.ts`**

```ts
/** Bump whenever sim behavior changes (spec §9.4). */
export const MODEL_VERSION = 1;
```

- [ ] **Step 7: Write the scaffold test**

`tests/scaffold.test.ts`:

```ts
import { MODEL_VERSION } from '../src/sim/version';

test('model version is a positive integer', () => {
  expect(Number.isInteger(MODEL_VERSION)).toBe(true);
  expect(MODEL_VERSION).toBeGreaterThan(0);
});
```

- [ ] **Step 8: Run tests, lint and typecheck**

Run: `npm test && npm run lint && npm run typecheck`
Expected: 1 test passes; lint and typecheck exit 0.

- [ ] **Step 9: Prove the lint rule bites**

Create a temporary file `src/sim/_lintprobe.ts` containing
`export const x = Math.exp(1) + 2 ** 3; export const d = Date.now();`, then run `npm run lint`.
Expected: 3 errors (Math.exp, `**`, Date). Then delete the file: `rm src/sim/_lintprobe.ts`.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts eslint.config.js src/sim/version.ts tests/scaffold.test.ts
git commit -m "chore: scaffold TypeScript project with determinism lint rules"
```

---

### Task 2: Counter-based RNG

**Files:**
- Create: `src/sim/rng.ts`
- Test: `tests/sim/rng.test.ts`

**Interfaces:**
- Produces:
  - `STREAM: { arrival: 1, size: 2, accept: 3, reserve: 4, object: 5, service: 6, eat: 7, stallNoise: 8, stallRank: 9, route: 10, batchSeed: 11 }`
  - `fmix32(h: number): number` (uint32)
  - `hash4(seed: number, stream: number, a: number, b?: number): number` (uint32)
  - `uniform(seed: number, stream: number, a: number, b?: number): number` (strictly in (0, 1))

- [ ] **Step 1: Write the failing tests**

`tests/sim/rng.test.ts`:

```ts
import { fmix32, hash4, uniform, STREAM } from '../../src/sim/rng';

test('fmix32 known values', () => {
  expect(fmix32(0)).toBe(0);
  expect(fmix32(1)).toBe(1364076727);
});

test('hash4 known values (pins the formula)', () => {
  expect(hash4(1, 1, 0, 0)).toBe(1626978197);
  expect(hash4(1, 6, 7, 0)).toBe(3749425112);
  expect(uniform(1, 1, 0)).toBe(0.3788103809347376);
});

test('stream ids match spec §8.2', () => {
  expect(STREAM).toEqual({ arrival: 1, size: 2, accept: 3, reserve: 4, object: 5, service: 6, eat: 7, stallNoise: 8, stallRank: 9, route: 10, batchSeed: 11 });
});

test('uniform stays strictly inside (0,1) at extreme seeds and keys', () => {
  for (const seed of [0, 1, 0xffffffff]) {
    for (const a of [0, 1, 0x7fffffff, 0xffffffff]) {
      const u = uniform(seed, STREAM.eat, a, 0xffffffff);
      expect(u).toBeGreaterThan(0);
      expect(u).toBeLessThan(1);
      expect(uniform(seed, STREAM.eat, a, 0xffffffff)).toBe(u);
    }
  }
});

test('service and eat percentiles are uncorrelated over 1e5 persons', () => {
  const n = 100_000;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let p = 0; p < n; p++) {
    const x = uniform(1, STREAM.service, p);
    const y = uniform(1, STREAM.eat, p);
    sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
  }
  const cov = sxy / n - (sx / n) * (sy / n);
  const corr = cov / Math.sqrt((sxx / n - (sx / n) ** 2) * (syy / n - (sy / n) ** 2));
  expect(Math.abs(corr)).toBeLessThan(0.01);
});

test('100-bin chi-square passes at alpha = 0.001', () => {
  const n = 100_000;
  const bins = new Array(100).fill(0);
  for (let p = 0; p < n; p++) bins[Math.floor(uniform(7, STREAM.arrival, p) * 100)]++;
  const expected = n / 100;
  const chi2 = bins.reduce((s, o) => s + ((o - expected) * (o - expected)) / expected, 0);
  expect(chi2).toBeLessThan(148.23); // chi-square 0.999 quantile, df = 99
});
```

(`**` is fine in tests: the lint allowlist only covers `src/sim` and `src/config`.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/sim/rng.test.ts`
Expected: FAIL, "Failed to resolve import ../../src/sim/rng".

- [ ] **Step 3: Implement `src/sim/rng.ts`**

```ts
/** Stream ids (spec §8.2). */
export const STREAM = {
  arrival: 1, size: 2, accept: 3, reserve: 4, object: 5, service: 6,
  eat: 7, stallNoise: 8, stallRank: 9, route: 10, batchSeed: 11,
} as const;

/** murmur3 32-bit finaliser; returns a uint32. */
export function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** h(seed, stream, a, b) from spec §8.1; returns a uint32. */
export function hash4(seed: number, stream: number, a: number, b = 0): number {
  const inner = fmix32(a ^ fmix32(b >>> 0));
  const mid = fmix32(Math.imul(stream, 0x9e3779b1) ^ inner);
  return fmix32((seed ^ mid) >>> 0);
}

/** u(stream, a, b) in the open interval (0, 1). */
export function uniform(seed: number, stream: number, a: number, b = 0): number {
  return (hash4(seed, stream, a, b) + 0.5) / 4294967296;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/sim/rng.test.ts && npm run lint`
Expected: 6 tests pass; lint is clean.

- [ ] **Step 5: Commit**

```bash
git add src/sim/rng.ts tests/sim/rng.test.ts
git commit -m "feat(sim): counter-based RNG with pinned hash vectors"
```

---

### Task 3: Deterministic math

**Files:**
- Create: `src/sim/dmath.ts`, `tests/golden/dmath.json`
- Test: `tests/sim/dmath.test.ts`

**Interfaces:**
- Produces:
  - `dexp(x: number): number`
  - `dlog(x: number): number`
  - `dnormcdf(z: number): number`
  - `dnorminv(p: number): number` (throws `RangeError` outside (0, 1))

- [ ] **Step 1: Create the golden reference file**

These values were generated with Python's `statistics.NormalDist`, which is accurate to well below the tolerances.
The spec names mpmath; `NormalDist` is an accepted substitute because its error is ≪ 1e-12.

`tests/golden/dmath.json`:

```json
{
  "cdf": [
    [-8, 6.106226635438361e-16], [-6, 9.865876449133282e-10], [-3, 0.0013498980316301035],
    [-1.96, 0.024997895148220428], [-1, 0.15865525393145707], [-0.5, 0.30853753872598694],
    [0, 0.5], [0.5, 0.691462461274013], [1, 0.8413447460685429], [1.96, 0.9750021048517796],
    [3, 0.9986501019683699], [6, 0.9999999990134123], [8, 0.9999999999999993]
  ],
  "inv": [
    [1e-9, -5.997807015007685], [1e-5, -4.264890793922825], [0.001, -3.090232306167813],
    [0.02, -2.0537489106318225], [0.02425, -1.9729610513118845], [0.1, -1.2815515655446006],
    [0.3, -0.5244005127080408], [0.7, 0.5244005127080407], [0.9, 1.2815515655446006],
    [0.975, 1.9599639845400534], [0.999, 3.090232306167813], [0.999999, 4.753424308817086]
  ]
}
```

- [ ] **Step 2: Write the failing tests**

`tests/sim/dmath.test.ts`:

```ts
import { dexp, dlog, dnormcdf, dnorminv } from '../../src/sim/dmath';
import golden from '../golden/dmath.json';

test('dexp matches Math.exp to 1e-13 relative over [-700, 700]', () => {
  let worst = 0;
  for (let i = 0; i <= 20000; i++) {
    const x = -700 + (1400 * i) / 20000;
    const ref = Math.exp(x);
    worst = Math.max(worst, Math.abs(dexp(x) - ref) / ref);
  }
  expect(worst).toBeLessThan(1e-13);
  expect(dexp(0)).toBe(1);
});

test('dlog matches Math.log to 1e-13 relative over [1e-300, 1e300]', () => {
  let worst = 0;
  for (let i = 1; i < 20000; i++) {
    const x = Math.pow(10, -300 + (600 * i) / 20000);
    const ref = Math.log(x);
    if (ref !== 0) worst = Math.max(worst, Math.abs(dlog(x) - ref) / Math.abs(ref));
  }
  expect(worst).toBeLessThan(1e-13);
  expect(dlog(1)).toBe(0);
  expect(dlog(0)).toBe(-Infinity);
});

test('dnormcdf within 1e-12 absolute of reference', () => {
  for (const [z, ref] of golden.cdf) expect(Math.abs(dnormcdf(z) - ref)).toBeLessThan(1e-12);
});

test('dnorminv within 1.2e-9 relative of reference, and 0 at 0.5', () => {
  for (const [p, ref] of golden.inv) expect(Math.abs(dnorminv(p) - ref) / Math.abs(ref)).toBeLessThan(1.2e-9);
  expect(dnorminv(0.5)).toBe(0);
});

test('dnorminv is finite at the extreme uniforms and rejects 0 and 1', () => {
  const lo = 0.5 / 4294967296;
  const hi = 1 - lo;
  expect(Number.isFinite(dnorminv(lo))).toBe(true);
  expect(Number.isFinite(dnorminv(hi))).toBe(true);
  expect(dnorminv(lo)).toBeLessThan(-6);
  expect(() => dnorminv(0)).toThrow(RangeError);
  expect(() => dnorminv(1)).toThrow(RangeError);
});

test('Gumbel form -dlog(-dlog(u)) is finite for every extreme u', () => {
  for (const u of [0.5 / 4294967296, 0.5, 1 - 0.5 / 4294967296]) {
    expect(Number.isFinite(-dlog(-dlog(u)))).toBe(true);
  }
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/sim/dmath.test.ts`
Expected: FAIL, "Failed to resolve import ../../src/sim/dmath".

- [ ] **Step 4: Implement `src/sim/dmath.ts`**

```ts
// Deterministic math: only + − × ÷, integer ops and Math.sqrt/round (spec §8.5).
const LN2_HI = 6.9314718036912381649e-1;
const LN2_LO = 1.90821492927058770002e-10;
const INV_LN2 = 1.442695040888963387;
const SQRT2 = 1.4142135623730951;
const SQRT1_2 = 0.7071067811865476;
const TWO_OVER_SQRT_PI = 1.1283791670955126;

/** e^x. Range reduction x = k·ln2 + r, Taylor series for e^r, exact ×2 / ×0.5 scaling. */
export function dexp(x: number): number {
  if (x !== x) return NaN;
  if (x > 709.78) return Infinity;
  if (x < -745.1) return 0;
  const k = Math.round(x * INV_LN2);
  const r = x - k * LN2_HI - k * LN2_LO;
  let term = 1;
  let sum = 1;
  for (let n = 1; n <= 20; n++) {
    term = (term * r) / n;
    sum += term;
  }
  let result = sum;
  if (k > 0) for (let i = 0; i < k; i++) result *= 2;
  else for (let i = 0; i < -k; i++) result *= 0.5;
  return result;
}

/** ln x. Scale to m ∈ [√½, √2) by exact ×2 / ×0.5, then 2·atanh((m−1)/(m+1)). */
export function dlog(x: number): number {
  if (!(x > 0)) return x === 0 ? -Infinity : NaN;
  if (x === Infinity) return Infinity;
  let m = x;
  let e = 0;
  while (m >= SQRT2) { m *= 0.5; e++; }
  while (m < SQRT1_2) { m *= 2; e--; }
  const s = (m - 1) / (m + 1);
  const s2 = s * s;
  let term = s;
  let sum = s;
  for (let n = 3; n <= 41; n += 2) {
    term *= s2;
    sum += term / n;
  }
  return e * LN2_HI + (e * LN2_LO + 2 * sum);
}

/** erf via the all-positive series erf(x) = 2/√π · e^{−x²} · Σ 2ⁿx^{2n+1}/(1·3···(2n+1)); |x| > 6 → ±1. */
function derf(x: number): number {
  const ax = x < 0 ? -x : x;
  if (ax > 6) return x < 0 ? -1 : 1;
  const x2 = ax * ax;
  let term = ax;
  let sum = ax;
  for (let n = 1; n <= 400; n++) {
    term = (term * 2 * x2) / (2 * n + 1);
    sum += term;
    if (term < sum * 1e-17) break;
  }
  const v = TWO_OVER_SQRT_PI * dexp(-x2) * sum;
  return x < 0 ? -v : v;
}

/** Standard normal CDF Φ(z), absolute error < 1e-12. */
export function dnormcdf(z: number): number {
  return 0.5 * (1 + derf(z * SQRT1_2));
}

const A = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
const B = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
const C = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
const D = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
const P_LOW = 0.02425;

function tail(q: number): number {
  return (((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) /
    ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1);
}

/** Inverse standard normal CDF (Acklam), relative error < 1.2e-9. */
export function dnorminv(p: number): number {
  if (!(p > 0 && p < 1)) throw new RangeError('dnorminv: p must be in (0, 1)');
  if (p < P_LOW) return tail(Math.sqrt(-2 * dlog(p)));
  if (p > 1 - P_LOW) return -tail(Math.sqrt(-2 * dlog(1 - p)));
  const q = p - 0.5;
  const r = q * q;
  return ((((((A[0] * r + A[1]) * r + A[2]) * r + A[3]) * r + A[4]) * r + A[5]) * q) /
    (((((B[0] * r + B[1]) * r + B[2]) * r + B[3]) * r + B[4]) * r + 1);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/sim/dmath.test.ts && npm run lint`
Expected: 6 tests pass (the prototype measured dexp 7.7e-16, dlog 3.7e-16); lint is clean.

- [ ] **Step 6: Commit**

```bash
git add src/sim/dmath.ts tests/sim/dmath.test.ts tests/golden/dmath.json
git commit -m "feat(sim): deterministic exp, log, normal CDF and inverse"
```

---

### Task 4: Layout geometry

**Files:**
- Create: `src/sim/layout.ts`
- Test: `tests/sim/layout.test.ts`

**Interfaces:**
- Produces:
  - constants: `STALL_BAND_MM = 3000`, `WALKWAY_MM = 1400`, `CONCOURSE_MM = 3000`, `TABLE_DEPTH_MM = 800`,
    `CHAIR_ZONE_MM = 500`, `SEAT_PITCH_MM = 600`, `LANE_MM = 600`, `MIN_FRONTAGE_MM = 1800`, `DOOR_MM = 2000`
  - types: `LayoutParams`, `Table`, `Seat`, `Stall`, `HLine`, `VLine`, `Layout` (exact shapes in Step 3)
  - `buildLayout(p: LayoutParams): Layout`
  - Conventions:
    - `Seat.line` = the horizontal line index where its access node lies (north seats of row r → r; south seats →
      r + 1).
    - `Stall.slots[j]` = the position `j + 1` coordinate.
    - `HLine.index`: 0 = top walkway, r + 1 = aisle below row r, `rows` = concourse.
    - `VLine.index`: 0 = left walkway, j + 1 = vertical aisle j.

- [ ] **Step 1: Write the failing tests**

`tests/sim/layout.test.ts`:

```ts
import { buildLayout, type LayoutParams } from '../../src/sim/layout';

const DEFAULT: LayoutParams = { cols: 10, rows: 10, seatsPerSide: 3, verticalAisleMm: 1200, horizontalAisleMm: 750, stallCount: 30, queueDepthMm: 5000 };

test('default hall dimensions and counts (spec §3.4)', () => {
  const L = buildLayout(DEFAULT);
  expect([L.W, L.H]).toEqual([39200, 35750]);
  expect(L.tables).toHaveLength(100);
  expect(L.seats).toHaveLength(600);
  expect([L.topStalls, L.leftStalls]).toEqual([18, 12]);
  expect(L.queueCapacity).toBe(12);
  expect([L.entranceX, L.exitX, L.trayX]).toEqual([27440, 33320, 10000]);
});

test('stall frontages ~2178 top and ~2313 left', () => {
  const L = buildLayout(DEFAULT);
  const top = new Set(L.stalls.filter((s) => s.band === 'top').map((s) => s.frontage));
  const left = new Set(L.stalls.filter((s) => s.band === 'left').map((s) => s.frontage));
  expect([...top].sort()).toEqual([2177, 2178]);
  expect([...left].sort()).toEqual([2312, 2313]);
});

test('seat positions and ids (spec §3.5)', () => {
  const L = buildLayout(DEFAULT);
  expect(L.seats.slice(0, 3).map((s) => s.x)).toEqual([9500, 10100, 10700]);
  const s = L.seats[4]; // table 0, south, i = 1
  expect([s.table, s.side, s.i, s.line]).toEqual([0, 1, 1, 1]);
  expect(L.seats.every((seat) => Number.isInteger(seat.x) && Number.isInteger(seat.y))).toBe(true);
});

test('walkway stops of stall 0 and stall 29', () => {
  const L = buildLayout(DEFAULT);
  expect([L.stalls[0].stopX, L.stalls[0].stopY]).toEqual([1689, 7300]);
  expect([L.stalls[29].stopX, L.stalls[29].stopY]).toEqual([7300, 33994]);
});

test('line positions', () => {
  const L = buildLayout(DEFAULT);
  expect(L.hLines.map((h) => h.y)).toEqual([7300, 10175, 12725, 15275, 17825, 20375, 22925, 25475, 28025, 30575, 34250]);
  expect(L.vLines[0].x).toBe(7300);
  expect(L.vLines[1].x).toBe(8600);
  expect(L.vLines[11].x).toBe(38600);
});

test('queue capacity uses integer math (5.6 m → 14, 9.2 m → 26)', () => {
  expect(buildLayout({ ...DEFAULT, queueDepthMm: 5600 }).queueCapacity).toBe(14);
  expect(buildLayout({ ...DEFAULT, queueDepthMm: 9200 }).queueCapacity).toBe(26);
});

test('queue position order folds back toward the counter (spec §3.6)', () => {
  const s = buildLayout(DEFAULT).stalls[0];
  expect(s.slots[0]).toEqual({ x: 300, y: 3300 }); // position 1 = service position
  expect(s.slots[5]).toEqual({ x: 300, y: 6300 });
  expect(s.slots[6]).toEqual({ x: 900, y: 6300 });
  expect(s.slots[11]).toEqual({ x: 900, y: 3300 });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/sim/layout.test.ts`
Expected: FAIL, "Failed to resolve import ../../src/sim/layout".

- [ ] **Step 3: Implement `src/sim/layout.ts`**

```ts
export interface LayoutParams {
  cols: number;
  rows: number;
  seatsPerSide: number;
  verticalAisleMm: number; // multiple of 50
  horizontalAisleMm: number; // multiple of 50
  stallCount: number;
  queueDepthMm: number; // multiple of 100
}

export const STALL_BAND_MM = 3000;
export const WALKWAY_MM = 1400;
export const CONCOURSE_MM = 3000;
export const TABLE_DEPTH_MM = 800;
export const CHAIR_ZONE_MM = 500;
export const SEAT_PITCH_MM = 600;
export const LANE_MM = 600;
export const MIN_FRONTAGE_MM = 1800;
export const DOOR_MM = 2000;

export interface Table { id: number; row: number; col: number; x0: number; y0: number; x1: number; y1: number; cx: number; cy: number }
export interface Seat { id: number; table: number; side: 0 | 1; i: number; x: number; y: number; line: number }
export interface Stall {
  id: number;
  band: 'top' | 'left';
  start: number; // xw for top stalls, yn for left stalls
  frontage: number;
  stopX: number;
  stopY: number;
  slots: { x: number; y: number }[]; // slots[j] is queue position j + 1
}
export interface HLine { index: number; y: number; x0: number; x1: number; widthMm: number }
export interface VLine { index: number; x: number; y0: number; y1: number; widthMm: number; kind: 'leftWalkway' | 'aisle' }

export interface Layout {
  params: LayoutParams;
  W: number;
  H: number;
  blockX: number;
  blockY: number;
  tableLength: number;
  tables: Table[];
  seats: Seat[];
  stalls: Stall[];
  topStalls: number;
  leftStalls: number;
  slotsPerLine: number;
  queueCapacity: number;
  entranceX: number;
  exitX: number;
  trayX: number;
  hLines: HLine[];
  vLines: VLine[];
}

const ROW_UNIT_MM = TABLE_DEPTH_MM + 2 * CHAIR_ZONE_MM;

export function buildLayout(p: LayoutParams): Layout {
  const { cols: C, rows: R, seatsPerSide: k, verticalAisleMm: Wv, horizontalAisleMm: Wh, stallCount: S, queueDepthMm: Q } = p;
  const Lt = SEAT_PITCH_MM * k;
  const Bw = C * Lt + (C + 1) * Wv;
  const Bh = R * ROW_UNIT_MM + (R - 1) * Wh;
  const W = STALL_BAND_MM + Q + Bw;
  const H = STALL_BAND_MM + Q + Bh + CONCOURSE_MM;
  const blockX = STALL_BAND_MM + Q;
  const blockY = STALL_BAND_MM + Q;

  const tables: Table[] = [];
  const seats: Seat[] = [];
  for (let row = 0; row < R; row++) {
    for (let col = 0; col < C; col++) {
      const id = row * C + col;
      const x0 = blockX + Wv + col * (Lt + Wv);
      const y0 = blockY + row * (ROW_UNIT_MM + Wh) + CHAIR_ZONE_MM;
      const t: Table = { id, row, col, x0, y0, x1: x0 + Lt, y1: y0 + TABLE_DEPTH_MM, cx: x0 + Lt / 2, cy: y0 + TABLE_DEPTH_MM / 2 };
      tables.push(t);
      for (const side of [0, 1] as const) {
        for (let i = 0; i < k; i++) {
          seats.push({
            id: id * 2 * k + side * k + i,
            table: id,
            side,
            i,
            x: x0 + 300 + SEAT_PITCH_MM * i,
            y: side === 0 ? y0 - 250 : t.y1 + 250,
            line: side === 0 ? row : row + 1,
          });
        }
      }
    }
  }

  const Ft = W;
  const Fl = H - STALL_BAND_MM - Q;
  const top = Math.round((S * Ft) / (Ft + Fl));
  const left = S - top;
  const m = Math.floor((Q - WALKWAY_MM) / LANE_MM);
  const walkwayY = STALL_BAND_MM + Q - 700;
  const walkwayX = STALL_BAND_MM + Q - 700;
  const stalls: Stall[] = [];
  for (let j = 0; j < top; j++) {
    const xw = Math.round((j * Ft) / top);
    const f = Math.round(((j + 1) * Ft) / top) - xw;
    const slots: { x: number; y: number }[] = [];
    for (let s = 0; s < m; s++) slots.push({ x: xw + 300, y: 3300 + 600 * s });
    for (let s = m - 1; s >= 0; s--) slots.push({ x: xw + 900, y: 3300 + 600 * s });
    stalls.push({ id: j, band: 'top', start: xw, frontage: f, stopX: xw + 1200 + Math.round((f - 1200) / 2), stopY: walkwayY, slots });
  }
  for (let j = 0; j < left; j++) {
    const yn = blockY + Math.round((j * Fl) / left);
    const f = blockY + Math.round(((j + 1) * Fl) / left) - yn;
    const slots: { x: number; y: number }[] = [];
    for (let s = 0; s < m; s++) slots.push({ x: 3300 + 600 * s, y: yn + f - 300 });
    for (let s = m - 1; s >= 0; s--) slots.push({ x: 3300 + 600 * s, y: yn + f - 900 });
    stalls.push({ id: top + j, band: 'left', start: yn, frontage: f, stopX: walkwayX, stopY: yn + Math.round((f - 1200) / 2), slots });
  }

  const concourseY = H - 1500;
  const firstAisleX = blockX + Wv / 2;
  const lastAisleX = blockX + C * (Lt + Wv) + Wv / 2;
  const hLines: HLine[] = [{ index: 0, y: walkwayY, x0: 0, x1: W, widthMm: WALKWAY_MM }];
  for (let r = 0; r < R - 1; r++) {
    hLines.push({ index: r + 1, y: blockY + r * (ROW_UNIT_MM + Wh) + ROW_UNIT_MM + Wh / 2, x0: walkwayX, x1: lastAisleX, widthMm: Wh });
  }
  hLines.push({ index: R, y: concourseY, x0: walkwayX, x1: lastAisleX, widthMm: CONCOURSE_MM });
  const vLines: VLine[] = [{ index: 0, x: walkwayX, y0: walkwayY, y1: concourseY, widthMm: WALKWAY_MM, kind: 'leftWalkway' }];
  for (let j = 0; j <= C; j++) {
    vLines.push({ index: j + 1, x: firstAisleX + j * (Lt + Wv), y0: walkwayY, y1: concourseY, widthMm: Wv, kind: 'aisle' });
  }

  return {
    params: p, W, H, blockX, blockY, tableLength: Lt, tables, seats, stalls,
    topStalls: top, leftStalls: left, slotsPerLine: m, queueCapacity: 2 * m,
    entranceX: Math.round(0.7 * W), exitX: Math.round(0.85 * W), trayX: blockX + 2000,
    hLines, vLines,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/sim/layout.test.ts && npm run lint && npm run typecheck`
Expected: 7 tests pass; lint and typecheck are clean.

- [ ] **Step 5: Commit**

```bash
git add src/sim/layout.ts tests/sim/layout.test.ts
git commit -m "feat(sim): integer-mm layout geometry"
```

---

### Task 5: Aisle graph

**Files:**
- Create: `src/sim/navgraph.ts`
- Test: `tests/sim/navgraph.test.ts`

**Interfaces:**
- Consumes: `buildLayout`, `Layout`, `LANE_MM` from `src/sim/layout.ts`.
- Produces:
  - `MERGE_MM = 50`, `lanesFor(widthMm)`, `capacityFor(lengthMm)`
  - `type Role = {kind:'seat';seat} | {kind:'stall';stall} | {kind:'entrance'} | {kind:'exit'} | {kind:'tray'}`
  - `interface NavNode { id; x; y; hLine; onLeftWalkway; intersection; routing; roles: Role[] }`, where `hLine` is −1
    for left-walkway-only stops
  - `interface Edge { id; a; b; lengthMm; lanes; capacity; link }`, where `a` → `b` is increasing coordinate along its
    line
  - `interface Link { id; a; b; edges: number[]; lengthMm; lanes }`, where `a` and `b` are routing nodes and `edges`
    are in `a` → `b` order
  - `interface NavGraph { nodes; edges; links; nodeEdges: number[][]; seatNode: Int32Array; stallNode: Int32Array; entranceNode; exitNode; trayNode; routingIds: number[] }`
  - `buildNavGraph(L: Layout): NavGraph`
  - Routing node ids are exactly `0 … routingIds.length − 1`.

- [ ] **Step 1: Write the failing tests**

`tests/sim/navgraph.test.ts`:

```ts
import { buildLayout, type LayoutParams } from '../../src/sim/layout';
import { buildNavGraph } from '../../src/sim/navgraph';

const DEFAULT: LayoutParams = { cols: 10, rows: 10, seatsPerSide: 3, verticalAisleMm: 1200, horizontalAisleMm: 750, stallCount: 30, queueDepthMm: 5000 };
const G = buildNavGraph(buildLayout(DEFAULT));

test('every seat, stall and door has a node', () => {
  expect([...G.seatNode].every((n) => n >= 0)).toBe(true);
  expect([...G.stallNode].every((n) => n >= 0)).toBe(true);
  expect(new Set([G.entranceNode, G.exitNode, G.trayNode]).size).toBe(3);
});

test('south seats of row r and north seats of row r+1 share access nodes', () => {
  const L = buildLayout(DEFAULT);
  const south = L.seats.find((s) => s.table === 0 && s.side === 1 && s.i === 0)!;
  const north = L.seats.find((s) => s.table === 10 && s.side === 0 && s.i === 0)!;
  expect(G.seatNode[south.id]).toBe(G.seatNode[north.id]);
});

test('inner-aisle seat-to-seat edges are exactly 600 mm with capacity 1 (spec §13.1)', () => {
  const seatish = (id: number) => G.nodes[id].roles.some((r) => r.kind === 'seat');
  const inner = G.edges.filter((e) => seatish(e.a) && seatish(e.b) && G.nodes[e.a].hLine >= 1 && G.nodes[e.a].hLine <= 9);
  expect(inner.length).toBeGreaterThan(0);
  expect(new Set(inner.map((e) => e.lengthMm))).toEqual(new Set([600]));
  expect(inner.every((e) => e.capacity === 1 && e.lanes === 1)).toBe(true);
});

test('no edge ≤ 50 mm and every capacity ≥ 1', () => {
  expect(Math.min(...G.edges.map((e) => e.lengthMm))).toBeGreaterThan(50);
  expect(G.edges.every((e) => e.capacity >= 1)).toBe(true);
});

test('stall 29 walkway stop joins the concourse by a 256 mm edge', () => {
  const n = G.stallNode[29];
  const lengths = G.nodeEdges[n].map((e) => G.edges[e].lengthMm).sort((a, b) => a - b);
  expect(lengths).toEqual([256, 2312]);
});

test('lane counts by line type', () => {
  const lanesAt = (y: number) => new Set(G.edges.filter((e) => G.nodes[e.a].y === y && G.nodes[e.b].y === y).map((e) => e.lanes));
  expect(lanesAt(7300)).toEqual(new Set([2])); // top walkway
  expect(lanesAt(10175)).toEqual(new Set([1])); // horizontal aisle
  expect(lanesAt(34250)).toEqual(new Set([5])); // concourse
});

test('routing nodes are 0..n-1 and include the two top-walkway terminals', () => {
  expect(G.routingIds.every((id, i) => id === i)).toBe(true);
  const terminals = G.nodes.filter((n) => n.routing && !n.intersection).map((n) => [n.x, n.y]);
  expect(terminals).toEqual([[1689, 7300], [38711, 7300]]);
  expect(G.nodes.length).toBeLessThan(65536);
});

test('links run routing node to routing node', () => {
  for (const l of G.links) {
    expect(G.nodes[l.a].routing && G.nodes[l.b].routing).toBe(true);
    expect(l.lengthMm).toBe(l.edges.reduce((s, e) => s + G.edges[e].lengthMm, 0));
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/sim/navgraph.test.ts`
Expected: FAIL, "Failed to resolve import ../../src/sim/navgraph".

- [ ] **Step 3: Implement `src/sim/navgraph.ts`**

```ts
import { type Layout, LANE_MM } from './layout';

export const MERGE_MM = 50;

export type Role =
  | { kind: 'seat'; seat: number }
  | { kind: 'stall'; stall: number }
  | { kind: 'entrance' }
  | { kind: 'exit' }
  | { kind: 'tray' };

export interface NavNode {
  id: number;
  x: number;
  y: number;
  hLine: number; // horizontal line index; −1 for stops that lie only on the left walkway
  onLeftWalkway: boolean;
  intersection: boolean;
  routing: boolean;
  roles: Role[];
}
export interface Edge { id: number; a: number; b: number; lengthMm: number; lanes: number; capacity: number; link: number }
export interface Link { id: number; a: number; b: number; edges: number[]; lengthMm: number; lanes: number }
export interface NavGraph {
  nodes: NavNode[];
  edges: Edge[];
  links: Link[];
  nodeEdges: number[][];
  seatNode: Int32Array;
  stallNode: Int32Array;
  entranceNode: number;
  exitNode: number;
  trayNode: number;
  routingIds: number[];
}

interface Pt { pos: number; key: string | null; roles: Role[] }
interface Proto { x: number; y: number; hLine: number; onLeft: boolean; key: string | null; roles: Role[] }

export function lanesFor(widthMm: number): number {
  return Math.floor(widthMm / LANE_MM);
}

export function capacityFor(lengthMm: number): number {
  return Math.max(1, Math.floor(lengthMm / LANE_MM));
}

export function buildNavGraph(L: Layout): NavGraph {
  // 1. Points per line. Intersections are keyed "h{i}v{j}" and shared by both lines.
  const hPts: Pt[][] = L.hLines.map(() => []);
  const vPts: Pt[][] = L.vLines.map(() => []);
  for (const h of L.hLines) {
    for (const v of L.vLines) {
      if (v.x >= h.x0 && v.x <= h.x1 && h.y >= v.y0 && h.y <= v.y1) {
        const key = `h${h.index}v${v.index}`;
        hPts[h.index].push({ pos: v.x, key, roles: [] });
        vPts[v.index].push({ pos: h.y, key, roles: [] });
      }
    }
  }
  for (const s of L.seats) hPts[s.line].push({ pos: s.x, key: null, roles: [{ kind: 'seat', seat: s.id }] });
  for (const st of L.stalls) {
    if (st.band === 'top') hPts[0].push({ pos: st.stopX, key: null, roles: [{ kind: 'stall', stall: st.id }] });
    else vPts[0].push({ pos: st.stopY, key: null, roles: [{ kind: 'stall', stall: st.id }] });
  }
  const concourse = L.params.rows;
  hPts[concourse].push({ pos: L.entranceX, key: null, roles: [{ kind: 'entrance' }] });
  hPts[concourse].push({ pos: L.exitX, key: null, roles: [{ kind: 'exit' }] });
  hPts[concourse].push({ pos: L.trayX, key: null, roles: [{ kind: 'tray' }] });

  // 2. Merge clusters (≤ 50 mm apart, transitively) along each line.
  const protos: Proto[] = [];
  const byKey = new Map<string, number>();
  const protoFor = (key: string | null, x: number, y: number, hLine: number, onLeft: boolean): number => {
    if (key !== null) {
      const existing = byKey.get(key);
      if (existing !== undefined) return existing;
    }
    protos.push({ x, y, hLine, onLeft, key, roles: [] });
    const idx = protos.length - 1;
    if (key !== null) byKey.set(key, idx);
    return idx;
  };
  const mergeLine = (pts: Pt[], toXY: (pos: number) => [number, number], hLine: number, onLeft: boolean): number[] => {
    const sorted = [...pts].sort((p, q) => p.pos - q.pos || (p.key === null ? 1 : 0) - (q.key === null ? 1 : 0));
    const clusters: Pt[][] = [];
    for (const p of sorted) {
      const last = clusters[clusters.length - 1];
      if (last && p.pos - last[last.length - 1].pos <= MERGE_MM) last.push(p);
      else clusters.push([p]);
    }
    return clusters.map((c) => {
      const inter = c.find((p) => p.key !== null);
      const [x, y] = toXY(inter ? inter.pos : c[0].pos);
      const idx = protoFor(inter ? inter.key : null, x, y, hLine, onLeft);
      for (const p of c) protos[idx].roles.push(...p.roles);
      return idx;
    });
  };
  const lineSeq: number[][] = [];
  for (const h of L.hLines) lineSeq.push(mergeLine(hPts[h.index], (pos) => [pos, h.y], h.index, false));
  for (const v of L.vLines) {
    const isLeft = v.kind === 'leftWalkway';
    const seq = mergeLine(vPts[v.index], (pos) => [v.x, pos], -1, isLeft);
    if (isLeft) for (const i of seq) protos[i].onLeft = true;
    lineSeq.push(seq);
  }

  // 3. Routing nodes = intersections + terminals (outermost stops beyond the last intersection).
  const isInter = protos.map((p) => p.key !== null);
  const isRouting = [...isInter];
  for (const seq of lineSeq) {
    const first = seq.findIndex((i) => isInter[i]);
    let last = -1;
    for (let q = seq.length - 1; q >= 0; q--) {
      if (isInter[seq[q]]) { last = q; break; }
    }
    if (first > 0) isRouting[seq[0]] = true;
    if (last >= 0 && last < seq.length - 1) isRouting[seq[seq.length - 1]] = true;
  }

  // 4. Node ids (spec §4.1).
  const group = (i: number) => (isRouting[i] ? 0 : protos[i].hLine >= 0 ? 1 : 2);
  const order = protos.map((_, i) => i).sort((i, j) => {
    const gi = group(i), gj = group(j);
    if (gi !== gj) return gi - gj;
    if (gi === 2) return protos[i].y - protos[j].y;
    return protos[i].hLine - protos[j].hLine || protos[i].x - protos[j].x;
  });
  const idOf = new Int32Array(protos.length);
  order.forEach((pi, id) => { idOf[pi] = id; });
  const nodes: NavNode[] = order.map((pi, id) => ({
    id, x: protos[pi].x, y: protos[pi].y, hLine: protos[pi].hLine, onLeftWalkway: protos[pi].onLeft,
    intersection: isInter[pi], routing: isRouting[pi], roles: protos[pi].roles,
  }));

  // 5. Edges and links along each line (h lines first, then v lines, same order as lineSeq).
  const edges: Edge[] = [];
  const links: Link[] = [];
  const nodeEdges: number[][] = nodes.map(() => []);
  const widths = [...L.hLines.map((h) => h.widthMm), ...L.vLines.map((v) => v.widthMm)];
  lineSeq.forEach((seq, li) => {
    const lanes = lanesFor(widths[li]);
    let link: Link | null = null;
    for (let q = 0; q + 1 < seq.length; q++) {
      const a = idOf[seq[q]];
      const b = idOf[seq[q + 1]];
      const len = Math.abs(nodes[b].x - nodes[a].x) + Math.abs(nodes[b].y - nodes[a].y);
      if (link === null) {
        link = { id: links.length, a, b, edges: [], lengthMm: 0, lanes };
        links.push(link);
      }
      const e: Edge = { id: edges.length, a, b, lengthMm: len, lanes, capacity: capacityFor(len), link: link.id };
      edges.push(e);
      nodeEdges[a].push(e.id);
      nodeEdges[b].push(e.id);
      link.edges.push(e.id);
      link.b = b;
      link.lengthMm += len;
      if (nodes[b].routing) link = null;
    }
  });

  // 6. Role lookups.
  const seatNode = new Int32Array(L.seats.length).fill(-1);
  const stallNode = new Int32Array(L.stalls.length).fill(-1);
  let entranceNode = -1;
  let exitNode = -1;
  let trayNode = -1;
  for (const n of nodes) {
    for (const r of n.roles) {
      if (r.kind === 'seat') seatNode[r.seat] = n.id;
      else if (r.kind === 'stall') stallNode[r.stall] = n.id;
      else if (r.kind === 'entrance') entranceNode = n.id;
      else if (r.kind === 'exit') exitNode = n.id;
      else trayNode = n.id;
    }
  }
  const routingIds = nodes.filter((n) => n.routing).map((n) => n.id);
  return { nodes, edges, links, nodeEdges, seatNode, stallNode, entranceNode, exitNode, trayNode, routingIds };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/sim/navgraph.test.ts && npm run lint && npm run typecheck`
Expected: 8 tests pass (the prototype gave 492 nodes, 134 routing, 601 edges, 243 links, a 55 mm minimum edge);
lint and typecheck are clean.

- [ ] **Step 5: Commit**

```bash
git add src/sim/navgraph.ts tests/sim/navgraph.test.ts
git commit -m "feat(sim): aisle graph with node merging, lanes and links"
```

---

### Task 6: Routing

**Files:**
- Create: `src/sim/routing.ts`
- Test: `tests/sim/routing.test.ts`

**Interfaces:**
- Consumes: `NavGraph` from `src/sim/navgraph.ts`.
- Produces:
  - `interface Option { link: number; toward: number; next: number }`
    - `link` = the link to walk along;
    - `toward` = which end of that link is the walking direction (a routing node id);
    - `next` = where this move ends (the far routing node, or the target when it lies on that link).
  - `interface Router { graph; routingCount; D: Int32Array; dist(from, to): number; options(at, target): Option[] }`
    - `options` returns the equal-shortest moves, sorted by `next` then `link`. Plan 2's movement code picks among
      them with `Math.floor(u·k)`, using the `route` stream keyed by `(personId, at·N_nodes + target)`.
  - `buildRouter(G: NavGraph): Router`
  - `INF = 0x3fffffff` marks unreachable.

- [ ] **Step 1: Write the failing tests**

`tests/sim/routing.test.ts`:

```ts
import fc from 'fast-check';
import { buildLayout, type LayoutParams } from '../../src/sim/layout';
import { buildNavGraph } from '../../src/sim/navgraph';
import { buildRouter, INF, type Router } from '../../src/sim/routing';

const DEFAULT: LayoutParams = { cols: 10, rows: 10, seatsPerSide: 3, verticalAisleMm: 1200, horizontalAisleMm: 750, stallCount: 30, queueDepthMm: 5000 };
const G = buildNavGraph(buildLayout(DEFAULT));
const R = buildRouter(G);

/** Walk options[0] repeatedly and return the total length walked. */
function walk(r: Router, from: number, to: number): number {
  const g = r.graph;
  let at = from;
  let len = 0;
  for (let guard = 0; at !== to; guard++) {
    if (guard > 10_000) throw new Error('walk did not terminate');
    const o = r.options(at, to)[0];
    const l = g.links[o.link];
    const seq = [l.a, ...l.edges.map((e) => g.edges[e].b)];
    let i = seq.indexOf(at);
    const j = seq.indexOf(o.next);
    const step = j > i ? 1 : -1;
    while (i !== j) {
      const u = g.nodes[seq[i]], v = g.nodes[seq[i + step]];
      len += Math.abs(u.x - v.x) + Math.abs(u.y - v.y);
      i += step;
    }
    at = o.next;
  }
  return len;
}

test('from (vertical aisle 6, concourse) to stall 0: north and west both optimal (spec §13.1)', () => {
  const start = G.nodes.find((n) => n.intersection && n.x === 26600 && n.y === 34250)!;
  const tgt = G.stallNode[0];
  expect(R.dist(start.id, tgt)).toBe(51861);
  const next = R.options(start.id, tgt).map((o) => [G.nodes[o.next].x, G.nodes[o.next].y]);
  expect(next).toContainEqual([26600, 30575]); // north
  expect(next).toContainEqual([23600, 34250]); // west
});

test('both ends of a stop segment tie: S1 → N1 of table 0 gives two first moves', () => {
  const s1 = G.seatNode[4], n1 = G.seatNode[1];
  expect(R.dist(s1, n1)).toBe(5875);
  expect(R.options(s1, n1)).toHaveLength(2);
});

test('same-segment target goes directly', () => {
  const a = G.seatNode[0], b = G.seatNode[2]; // north seats 0 and 2 of table 0, same line
  expect(R.dist(a, b)).toBe(1200);
  expect(R.options(a, b)).toEqual([expect.objectContaining({ next: b })]);
});

test('every node is reachable from the entrance, and following options walks exactly dist', () => {
  for (const n of G.nodes) expect(R.dist(G.entranceNode, n.id)).toBeLessThan(INF);
  for (let s = 0; s < 600; s += 13) {
    const t = G.seatNode[s];
    expect(walk(R, G.entranceNode, t)).toBe(R.dist(G.entranceNode, t));
  }
  for (let st = 0; st < 30; st++) {
    const t = G.stallNode[st];
    expect(walk(R, G.seatNode[0], t)).toBe(R.dist(G.seatNode[0], t));
  }
});

test('distances are symmetric on the default and the maximum layout', () => {
  const max = buildRouter(buildNavGraph(buildLayout({ cols: 20, rows: 20, seatsPerSide: 4, verticalAisleMm: 3000, horizontalAisleMm: 3000, stallCount: 60, queueDepthMm: 10000 })));
  expect(max.graph.nodes.length).toBeLessThan(65536);
  for (const r of [R, max]) {
    fc.assert(fc.property(fc.nat(r.graph.nodes.length - 1), fc.nat(r.graph.nodes.length - 1), (a, b) => r.dist(a, b) === r.dist(b, a)), { numRuns: 300 });
  }
});

test('degenerate layouts build and connect: 1 row, 1 stall', () => {
  for (const p of [{ ...DEFAULT, rows: 1 }, { ...DEFAULT, stallCount: 1 }]) {
    const g = buildNavGraph(buildLayout(p));
    const r = buildRouter(g);
    expect([...g.seatNode].every((n) => n >= 0)).toBe(true);
    expect([...g.stallNode].every((n) => n >= 0)).toBe(true);
    for (const n of g.nodes) expect(r.dist(g.entranceNode, n.id)).toBeLessThan(INF);
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/sim/routing.test.ts`
Expected: FAIL, "Failed to resolve import ../../src/sim/routing".

- [ ] **Step 3: Implement `src/sim/routing.ts`**

```ts
import type { NavGraph } from './navgraph';

export const INF = 0x3fffffff;

export interface Option { link: number; toward: number; next: number }
export interface Router {
  graph: NavGraph;
  routingCount: number;
  D: Int32Array; // routingCount × routingCount, integer mm
  dist(from: number, to: number): number;
  options(at: number, target: number): Option[];
}

/** Where a node sits: on link `link` at offsets `da`/`db` from its ends, or link = −1 for routing nodes. */
interface Seg { link: number; a: number; b: number; da: number; db: number }

type HeapItem = [dist: number, node: number];

function less(h: HeapItem[], i: number, j: number): boolean {
  return h[i][0] < h[j][0] || (h[i][0] === h[j][0] && h[i][1] < h[j][1]);
}
function push(h: HeapItem[], item: HeapItem): void {
  h.push(item);
  let i = h.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (!less(h, i, p)) break;
    [h[p], h[i]] = [h[i], h[p]];
    i = p;
  }
}
function pop(h: HeapItem[]): HeapItem {
  const top = h[0];
  const last = h.pop()!;
  if (h.length > 0) {
    h[0] = last;
    let i = 0;
    for (;;) {
      const l = 2 * i + 1, r = l + 1;
      let m = i;
      if (l < h.length && less(h, l, m)) m = l;
      if (r < h.length && less(h, r, m)) m = r;
      if (m === i) break;
      [h[m], h[i]] = [h[i], h[m]];
      i = m;
    }
  }
  return top;
}

export function buildRouter(G: NavGraph): Router {
  const n = G.routingIds.length;
  const D = new Int32Array(n * n).fill(INF);
  const adj: { to: number; len: number; link: number }[][] = Array.from({ length: n }, () => []);
  for (const l of G.links) {
    adj[l.a].push({ to: l.b, len: l.lengthMm, link: l.id });
    adj[l.b].push({ to: l.a, len: l.lengthMm, link: l.id });
  }
  for (const list of adj) list.sort((p, q) => p.to - q.to || p.link - q.link);

  for (let s = 0; s < n; s++) {
    const row = s * n;
    D[row + s] = 0;
    const heap: HeapItem[] = [[0, s]];
    while (heap.length > 0) {
      const [d, u] = pop(heap);
      if (d > D[row + u]) continue;
      for (const e of adj[u]) {
        const nd = d + e.len;
        if (nd < D[row + e.to]) {
          D[row + e.to] = nd;
          push(heap, [nd, e.to]);
        }
      }
    }
  }

  const seg: Seg[] = G.nodes.map((node) => ({ link: -1, a: node.id, b: node.id, da: 0, db: 0 }));
  for (const l of G.links) {
    let acc = 0;
    for (let q = 0; q < l.edges.length - 1; q++) {
      const e = G.edges[l.edges[q]];
      acc += e.lengthMm;
      seg[e.b] = { link: l.id, a: l.a, b: l.b, da: acc, db: l.lengthMm - acc };
    }
  }
  const along = (u: number, v: number) => Math.abs(G.nodes[u].x - G.nodes[v].x) + Math.abs(G.nodes[u].y - G.nodes[v].y);

  function dist(from: number, to: number): number {
    const sf = seg[from];
    const st = seg[to];
    if (sf.link !== -1 && sf.link === st.link) return along(from, to);
    const fe: [number, number][] = sf.link === -1 ? [[from, 0]] : [[sf.a, sf.da], [sf.b, sf.db]];
    const te: [number, number][] = st.link === -1 ? [[to, 0]] : [[st.a, st.da], [st.b, st.db]];
    let best = INF;
    for (const [e, de] of fe) {
      for (const [f, df] of te) {
        const v = de + D[e * n + f] + df;
        if (v < best) best = v;
      }
    }
    return best;
  }

  function options(at: number, target: number): Option[] {
    if (at === target) return [];
    const total = dist(at, target);
    const s = seg[at];
    const st = seg[target];
    const out: Option[] = [];
    if (s.link !== -1) {
      if (st.link === s.link) return [{ link: s.link, toward: st.da > s.da ? s.b : s.a, next: target }];
      if (s.da + dist(s.a, target) === total) out.push({ link: s.link, toward: s.a, next: s.a });
      if (s.db + dist(s.b, target) === total) out.push({ link: s.link, toward: s.b, next: s.b });
    } else {
      for (const e of adj[at]) {
        if (st.link === e.link) {
          const l = G.links[e.link];
          if ((l.a === at ? st.da : st.db) === total) out.push({ link: e.link, toward: e.to, next: target });
        } else if (e.len + dist(e.to, target) === total) {
          out.push({ link: e.link, toward: e.to, next: e.to });
        }
      }
    }
    return out.sort((p, q) => p.next - q.next || p.link - q.link);
  }

  return { graph: G, routingCount: n, D, dist, options };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/sim/routing.test.ts && npm run lint && npm run typecheck`
Expected: 6 tests pass; lint and typecheck are clean.

- [ ] **Step 5: Commit**

```bash
git add src/sim/routing.ts tests/sim/routing.test.ts
git commit -m "feat(sim): routing with exact equal-shortest options"
```

---

### Task 7: Config defaults and validation

**Files:**
- Create: `src/config/schema.ts`, `src/config/validate.ts`
- Test: `tests/config/validate.test.ts`

**Interfaces:**
- Consumes: `buildLayout`, `LayoutParams`, `MIN_FRONTAGE_MM` from `src/sim/layout.ts`.
- Produces:
  - `type ClaimMode = 'oneClaimer' | 'together'`
  - `interface Config` (exact shape in Step 3; internal units: fractions, seconds, minutes-since-midnight, metres)
  - `defaultConfig(): Config`
  - `toLayoutParams(c: Config): LayoutParams`: metres → mm, snapped to 50 mm (aisles) and 100 mm (queue depth)
  - `interface Issue { code: string; message: string; settings: string[] }`
  - `validate(c: Config): { blocking: Issue[]; warnings: Issue[] }`
  - Blocking codes: `frontage`, `mixZero`, `groupTooBig`, `entranceTray`, `doorsOverlap`.
  - Warning codes: `traySpeed`, `verticalAisle`, `noSharing`, `load`.

- [ ] **Step 1: Write the failing tests**

`tests/config/validate.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/config/validate.test.ts`
Expected: FAIL, "Failed to resolve import ../../src/config/schema".

- [ ] **Step 3: Implement `src/config/schema.ts`**

```ts
export type ClaimMode = 'oneClaimer' | 'together';

/** Internal units: fractions 0–1, durations in seconds, clock times in minutes since midnight, lengths in metres. */
export interface Config {
  seed: number;
  crowd: {
    totalPeople: number;
    windowStart: number;
    windowEnd: number;
    peakTime: number;
    peakShare: number;
    peakSpread: number;
    groupMix: [number, number, number, number, number, number];
  };
  reserve: { percentA: number; claimMode: ClaimMode; claimSearchLimit: number; shareMinEmpty: number; shareMaxParty: number };
  stalls: { serviceMean: number; serviceCV: number; popularitySkew: number; queueAversion: number };
  eat: { mean: number; cv: number; linger: number };
  move: { walkSpeed: number; traySpeed: number };
  search: { visibility: number; patience: number; parallel: boolean; emptyTableDetour: number };
  tray: { dropTime: number; slots: number };
  layout: {
    cols: number;
    rows: number;
    seatsPerSide: number;
    verticalAisle: number;
    horizontalAisle: number;
    stallCount: number;
    queueDepth: number;
  };
}

export function defaultConfig(): Config {
  return {
    seed: 1,
    crowd: { totalPeople: 1800, windowStart: 660, windowEnd: 810, peakTime: 735, peakShare: 0.6, peakSpread: 900, groupMix: [25, 30, 20, 15, 5, 5] },
    reserve: { percentA: 0.5, claimMode: 'oneClaimer', claimSearchLimit: 60, shareMinEmpty: 4, shareMaxParty: 2 },
    stalls: { serviceMean: 90, serviceCV: 0.5, popularitySkew: 0.6, queueAversion: 1.0 },
    eat: { mean: 1080, cv: 0.3, linger: 0 },
    move: { walkSpeed: 1.3, traySpeed: 1.0 },
    search: { visibility: 10, patience: 300, parallel: false, emptyTableDetour: 0 },
    tray: { dropTime: 5, slots: 3 },
    layout: { cols: 10, rows: 10, seatsPerSide: 3, verticalAisle: 1.2, horizontalAisle: 0.75, stallCount: 30, queueDepth: 5.0 },
  };
}
```

- [ ] **Step 4: Implement `src/config/validate.ts`**

```ts
import type { Config } from './schema';
import { buildLayout, type LayoutParams, MIN_FRONTAGE_MM } from '../sim/layout';

export interface Issue { code: string; message: string; settings: string[] }
export interface Validation { blocking: Issue[]; warnings: Issue[] }

const snap = (metres: number, stepMm: number) => Math.round((metres * 1000) / stepMm) * stepMm;

export function toLayoutParams(c: Config): LayoutParams {
  return {
    cols: c.layout.cols,
    rows: c.layout.rows,
    seatsPerSide: c.layout.seatsPerSide,
    verticalAisleMm: snap(c.layout.verticalAisle, 50),
    horizontalAisleMm: snap(c.layout.horizontalAisle, 50),
    stallCount: c.layout.stallCount,
    queueDepthMm: snap(c.layout.queueDepth, 100),
  };
}

export function validate(c: Config): Validation {
  const blocking: Issue[] = [];
  const warnings: Issue[] = [];
  const p = toLayoutParams(c);
  const L = buildLayout(p);
  const k = p.seatsPerSide;

  if (L.stalls.some((s) => s.frontage < MIN_FRONTAGE_MM)) {
    blocking.push({ code: 'frontage', message: 'Stalls are narrower than 1.8 m. Use fewer stalls or a larger hall.', settings: ['layout.stallCount'] });
  }
  if (c.crowd.groupMix.every((w) => w === 0)) {
    blocking.push({ code: 'mixZero', message: 'The group mix needs at least one non-zero size.', settings: ['crowd.groupMix'] });
  }
  const tooBig = c.crowd.groupMix.map((w, i) => (w > 0 && i + 1 > 2 * k ? i + 1 : 0)).filter((s) => s > 0);
  if (tooBig.length > 0) {
    blocking.push({
      code: 'groupTooBig',
      message: `Groups of ${tooBig.join(' and ')} cannot sit at ${2 * k}-seat tables: set their share to 0% or use larger tables.`,
      settings: ['crowd.groupMix', 'layout.seatsPerSide'],
    });
  }
  if (L.entranceX - 1000 < 3000 + p.queueDepthMm + 3500) {
    blocking.push({ code: 'entranceTray', message: 'The entrance overlaps the tray return: add table columns.', settings: ['layout.cols'] });
  }
  if (L.exitX - 1000 < L.entranceX + 1000) {
    blocking.push({ code: 'doorsOverlap', message: 'The entrance and exit overlap: add table columns.', settings: ['layout.cols'] });
  }

  if (c.move.traySpeed > c.move.walkSpeed) {
    warnings.push({ code: 'traySpeed', message: 'Tray speed is faster than walking speed.', settings: ['move.traySpeed'] });
  }
  if (p.verticalAisleMm < 1200) {
    warnings.push({ code: 'verticalAisle', message: 'Vertical aisles no longer let two people pass (1 lane).', settings: ['layout.verticalAisle'] });
  }
  if (c.reserve.shareMinEmpty >= 2 * k) {
    warnings.push({ code: 'noSharing', message: 'No sharing: solos and pairs can never join a reserved table.', settings: ['reserve.shareMinEmpty'] });
  }
  const windowSec = (c.crowd.windowEnd - c.crowd.windowStart) * 60;
  const rho = (c.crowd.totalPeople * c.stalls.serviceMean) / (c.layout.stallCount * windowSec);
  if (rho > 0.9) {
    warnings.push({
      code: 'load',
      message: `Offered stall load ${Math.round(rho * 100) / 100} is above 0.9; queues may never clear.`,
      settings: ['crowd.totalPeople', 'stalls.serviceMean', 'layout.stallCount'],
    });
  }
  return { blocking, warnings };
}
```

(`toFixed` would also be deterministic, but `Math.round(x*100)/100` keeps the code inside the allowlist without
exceptions.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/config/validate.test.ts && npm run lint && npm run typecheck`
Expected: 8 tests pass; lint and typecheck are clean.

- [ ] **Step 6: Commit**

```bash
git add src/config tests/config
git commit -m "feat(config): defaults and layout validation rules"
```

---

### Task 8: Layout property tests over all ranges

**Files:**
- Test: `tests/sim/layout.property.test.ts`

**Interfaces:**
- Consumes: `defaultConfig` (Task 7), `validate` and `toLayoutParams` (Task 7), `buildLayout` (Task 4),
  `buildNavGraph` (Task 5), `buildRouter` and `INF` (Task 6).
- Produces: no new code, only the spec §13.2 guarantees.

- [ ] **Step 1: Write the property test**

`tests/sim/layout.property.test.ts`:

```ts
import fc from 'fast-check';
import { defaultConfig } from '../../src/config/schema';
import { validate, toLayoutParams } from '../../src/config/validate';
import { buildLayout } from '../../src/sim/layout';
import { buildNavGraph } from '../../src/sim/navgraph';
import { buildRouter, INF } from '../../src/sim/routing';

const layoutArb = fc.record({
  cols: fc.integer({ min: 1, max: 20 }),
  rows: fc.integer({ min: 1, max: 20 }),
  seatsPerSide: fc.integer({ min: 2, max: 4 }),
  verticalAisle: fc.integer({ min: 12, max: 60 }).map((x) => x * 0.05),
  horizontalAisle: fc.integer({ min: 12, max: 60 }).map((x) => x * 0.05),
  stallCount: fc.integer({ min: 1, max: 60 }),
  queueDepth: fc.integer({ min: 32, max: 100 }).map((x) => x / 10),
});

test('every valid layout yields a well-formed, connected graph (spec §13.2)', () => {
  fc.assert(
    fc.property(layoutArb, (layout) => {
      const c = defaultConfig();
      c.layout = layout;
      c.crowd.groupMix = [25, 30, 20, 15, 0, 0]; // fits every table size
      fc.pre(validate(c).blocking.length === 0);
      const L = buildLayout(toLayoutParams(c));
      const G = buildNavGraph(L);
      const R = buildRouter(G);
      expect(G.nodes.length).toBeLessThan(65536);
      expect(G.edges.every((e) => e.lengthMm > 50 && e.capacity >= 1 && Number.isInteger(e.lengthMm))).toBe(true);
      expect(G.nodes.every((n) => Number.isInteger(n.x) && Number.isInteger(n.y))).toBe(true);
      for (const h of L.hLines) {
        for (const n of G.nodes) if (n.hLine === h.index) expect(n.x >= h.x0 && n.x <= h.x1).toBe(true);
      }
      expect([...G.seatNode].every((x) => x >= 0)).toBe(true);
      expect([...G.stallNode].every((x) => x >= 0)).toBe(true);
      expect(new Set([G.entranceNode, G.exitNode, G.trayNode]).size).toBe(3);
      for (const n of G.nodes) expect(R.dist(G.entranceNode, n.id)).toBeLessThan(INF);
    }),
    { numRuns: 150 },
  );
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/sim/layout.property.test.ts`
Expected: PASS. The prototype checked 287 random valid layouts with 0 failures. If fast-check reports a
counterexample, fix the geometry code it points at, not the test. Run it again until it passes.

- [ ] **Step 3: Run the whole suite**

Run: `npm test && npm run lint && npm run typecheck`
Expected: all test files pass; lint and typecheck are clean.

- [ ] **Step 4: Commit**

```bash
git add tests/sim/layout.property.test.ts
git commit -m "test(sim): property tests for layout and graph over all ranges"
```

---

## Self-Review Notes

- **Spec coverage for this plan's scope.**

  | Spec | Task |
  |---|---|
  | §3.0 integer units (geometry) | 4, 7 |
  | §3.3–3.6 dimensions, stalls, queue slots | 4 |
  | §4.1 lines, nodes, merging, lanes, links, node ids | 5 |
  | §4.3 routing, distances, options, tie-break inputs | 6 |
  | §8.1–8.2 RNG and streams | 2 |
  | §8.5 dmath and allowlist | 1, 3 |
  | §9.1 defaults | 7 |
  | §9.2 blocking rules and warnings | 7 |
  | §13.1 layout and validation tests | 4–7 |
  | §13.2 property tests | 8 |

- **Deliberately in later plans:**
  - §9.2 clamp order, the Load readout and the `peakTime`/window clamps need the schema metadata table, which belongs
    to Plan 4's UI generator.
  - Arrival CDF inversion and lognormal draws use `dmath` in Plan 2.
- **Types used across tasks:** `LayoutParams`, `Layout`, `NavGraph`, `Router`, `Option`, `Config`, `Issue`. Each is
  defined once and consumed with the same names.
