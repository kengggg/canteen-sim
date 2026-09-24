import { ESLint } from 'eslint';

async function errorsFor(code: string): Promise<number> {
  const eslint = new ESLint();
  const [r] = await eslint.lintText(code, { filePath: 'src/sim/_probe.ts' });
  return r.messages.filter((m) => m.ruleId === 'no-restricted-syntax').length;
}

test('the determinism allowlist bans toString(radix) and Math aliasing', async () => {
  expect(await errorsFor('export const a = (255).toString(16);')).toBe(1);
  expect(await errorsFor('export const b = String(1);')).toBe(0);
  expect(await errorsFor('const { exp } = Math; export const c = exp;')).toBeGreaterThanOrEqual(1);
  expect(await errorsFor('const M = Math; export const d = M;')).toBeGreaterThanOrEqual(1);
  expect(await errorsFor('export const e = globalThis.Math;')).toBeGreaterThanOrEqual(1);
  expect(await errorsFor('export const f = Math.floor(1.5) + Math.sqrt(2);')).toBe(0);
}, 30_000);
