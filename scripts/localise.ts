import { readFileSync, writeFileSync } from 'node:fs';
import { messageKey } from '../src/i18n/key';
import { translateDocument } from '../src/i18n/document';

/** English messages already live at call sites; emit short keys so the offline app carries each only once. */
const source = JSON.parse(readFileSync(new URL('../src/i18n/th.json', import.meta.url), 'utf8')) as Record<string, string>;
const output: Record<string, string> = {};
const owners = new Map<string, string>();
const placeholders = (s: string) => [...new Set(s.match(/\{\w+\}/g))].sort().join(',');
for (const [english, thai] of Object.entries(source)) {
  const key = messageKey(english);
  if (owners.has(key)) throw new Error(`Translation key collision: ${english} / ${owners.get(key)}`);
  if (placeholders(english) !== placeholders(thai)) throw new Error(`Translation placeholders differ: ${english}`);
  owners.set(key, english);
  output[key] = thai;
}
const file = new URL('../src/i18n/th.generated.json', import.meta.url);
const body = JSON.stringify(output) + '\n';
if (process.argv.includes('--check')) {
  if (readFileSync(file, 'utf8') !== body) throw new Error('Translation catalogue is stale. Run npm run localise.');
} else writeFileSync(file, body);
console.log(`Thai catalogue: ${owners.size} complete messages, no key collisions, matching placeholders.`);

const documents = JSON.parse(readFileSync(new URL('../docs/translations/research-th.json', import.meta.url), 'utf8')) as Record<string, string>;
for (const name of ['research-protocol', 'studies/visibility-roles-v1']) {
  const english = readFileSync(new URL(`../docs/${name}.md`, import.meta.url), 'utf8');
  const thai = translateDocument(english, (key, values) => {
    const template = documents[key];
    if (template === undefined) throw new Error(`Missing Thai research text: ${key}`);
    if (placeholders(key) !== placeholders(template)) throw new Error(`Research placeholders differ: ${key}`);
    return template.replace(/\{v(\d+)\}/g, (_match, index: string) => values[Number(index)]);
  });
  const target = new URL(`../docs/${name}.th.md`, import.meta.url);
  if (process.argv.includes('--check')) {
    if (readFileSync(target, 'utf8') !== thai) throw new Error(`Thai ${name} is stale. Run npm run localise.`);
  } else writeFileSync(target, thai);
}
console.log('Thai protocol and complete results reconstructed from the English originals; numbers, code and links preserved.');
