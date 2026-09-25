import { readFileSync } from 'node:fs';
import { CLASS_LABELS, SEAT_LABELS, CLASS_HELP } from '../../src/ui/labels';

const css = readFileSync(new URL('../../src/ui/theme.css', import.meta.url), 'utf8');

function block(selector: string): Map<string, string> {
  const i = css.indexOf(selector);
  expect(i).toBeGreaterThanOrEqual(0);
  const open = css.indexOf('{', i);
  let depth = 0, j = open;
  for (; j < css.length; j++) {
    if (css[j] === '{') depth++;
    if (css[j] === '}' && --depth === 0) break;
  }
  const body = css.slice(open + 1, j);
  return new Map([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

test('scene, class and seat tokens are #rrggbb in every theme block, and dark blocks redefine the same set', () => {
  const light = block(':root {');
  const media = block(":root:not([data-theme='light'])");
  const dark = block(":root[data-theme='dark'] {");
  const sceneKeys = [...light.keys()].filter((k) => /^--(scene|cls|seat)-/.test(k));
  expect(sceneKeys.length).toBeGreaterThan(25);
  for (const b of [light, media, dark]) for (const k of sceneKeys) expect(b.get(k)).toMatch(/^#[0-9a-f]{6}$/i);
  const colourKeys = [...media.keys()];
  expect([...dark.keys()].sort()).toEqual(colourKeys.sort());
  for (const k of colourKeys) expect(light.has(k)).toBe(true);
  expect([...media.entries()]).toEqual([...dark.entries()]);
});

test('labels exist for all 7 person classes and 6 seat states', () => {
  expect(CLASS_LABELS).toHaveLength(7);
  expect(CLASS_HELP).toHaveLength(7);
  expect(SEAT_LABELS).toHaveLength(6);
});
