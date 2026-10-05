import { readFileSync, readdirSync } from 'node:fs';
import ts from 'typescript';
import { afterEach, expect, test } from 'vitest';
import source from '../../src/i18n/th.json';
import generated from '../../src/i18n/th.generated.json';
import documentMessages from '../../docs/translations/research-th.json';
import { messageKey } from '../../src/i18n/key';
import { documentTemplate, translateDocument } from '../../src/i18n/document';
import { language, msg } from '../../src/i18n';
import { META } from '../../src/config/meta';
import { PRESETS } from '../../src/config/presets';
import { ASSUMPTIONS } from '../../src/config/assumptions';
import { CATALOG } from '../../src/batch/catalog';
import { STUDY_PLAN } from '../../src/batch/sensitivity-plan';
import { pairedStat } from '../../src/batch/stats';
import { sentence } from '../../src/batch/wording';
import { studyCaseLabel } from '../../src/ui/sensitivity-model';
import { noticeText } from '../../src/ui/notice-text';
import { ARIA, CLASS_LABELS, CLASS_HELP, SEAT_LABELS, LEFT_LABELS, OBJECT_NAMES, HOWTO_STEPS, COUNTERS, MSG } from '../../src/ui/labels';

afterEach(() => { language.value = 'en'; });
const catalogue = source as Record<string, string>;
const slots = (s: string) => [...new Set(s.match(/\{\w+\}/g))].sort();

test('the complete source catalogue has unique compact keys, matching slots and current generated content', () => {
  const keys = Object.keys(source).map(messageKey);
  expect(new Set(keys).size).toBe(keys.length);
  expect(generated).toEqual(Object.fromEntries(Object.entries(source).map(([key, value]) => [messageKey(key), value])));
  for (const [key, value] of Object.entries(source)) expect(slots(value), key).toEqual(slots(key));
});

test('all explicit UI messages and model metadata shown to readers have Thai entries', () => {
  const messages = new Set<string>();
  const dir = new URL('../../src/ui/', import.meta.url);
  for (const file of readdirSync(dir).filter((name) => /\.tsx?$/.test(name))) {
    const text = readFileSync(new URL(file, dir), 'utf8');
    const tree = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const walk = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && ['trText', 'msg', 'rich'].includes(node.expression.text)) {
        const key = node.arguments[0];
        if (key && ts.isStringLiteral(key)) messages.add(key.text);
      }
      ts.forEachChild(node, walk);
    };
    walk(tree);
  }
  for (const m of META) [m.label, m.help, m.group].forEach((s) => messages.add(s));
  for (const m of CATALOG) [m.label, m.help].forEach((s) => messages.add(s));
  for (const p of PRESETS) [p.label, p.help].forEach((s) => messages.add(s));
  for (const a of ASSUMPTIONS) [a.heading, ...a.items.map((x) => x.text)].forEach((s) => messages.add(s));
  for (const f of STUDY_PLAN.families) [f.label, f.explanation].forEach((s) => messages.add(s));
  for (const label of [...CLASS_LABELS, ...CLASS_HELP, ...SEAT_LABELS, ...LEFT_LABELS, ...OBJECT_NAMES, ...HOWTO_STEPS,
    ...Object.values(ARIA), ...Object.values(MSG).filter((s): s is string => typeof s === 'string')]) {
    if (label) messages.add(label);
  }
  for (const counter of COUNTERS) [counter.label, counter.help].forEach((s) => messages.add(s));
  expect([...messages].filter((key) => !(key in catalogue))).toEqual([]);
});

test('every sensitivity choice names all selected factors in Thai', () => {
  language.value = 'th';
  for (const family of STUDY_PLAN.families) for (const id of family.scenarios) {
    const scenario = STUDY_PLAN.scenarios.find((s) => s.id === id)!;
    expect(msg(studyCaseLabel(family.id, scenario)), `${family.id}/${id}`).not.toMatch(/[a-z]{2}/i);
  }
});

test('Thai result sentences keep benefit direction, percentage-point units, and inconclusive results distinct', () => {
  language.value = 'th';
  const metric = CATALOG.find((m) => m.id === 'leftPct')!;
  expect(sentence(metric, 1, pairedStat([2, 2, 2, 2, 2, 2, 2, 2, 2, 2]), null)).toContain('ดีกว่า 2.0 จุดเปอร์เซ็นต์');
  expect(sentence(metric, 1, pairedStat([-2, -2, -2, -2, -2, -2, -2, -2, -2, -2]), null)).toContain('แย่กว่า 2.0 จุดเปอร์เซ็นต์');
  const uncertain = sentence(metric, 1, pairedStat([-1, 1, -1, 1, -1, 1, -1, 1, -1, 1]), null);
  expect(uncertain).toContain('ยังไม่พบความต่างชัดเจน');
  expect(uncertain).not.toContain('เท่ากัน');
  expect(sentence(metric, 1, pairedStat([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), null)).toContain('เท่ากันทั้ง 10 มื้อ');
});

test('Thai validation and import notices keep exact offending values and model identifiers', () => {
  language.value = 'th';
  expect(noticeText('Groups of 5 and 6 cannot sit at 4-seat tables: set their share to 0% or use larger tables.')).toContain('5 และ 6 คน');
  expect(noticeText('Offered stall load 1.27 is above 0.9; queues may never clear.')).toContain('1.27 สูงกว่า 0.9');
  expect(noticeText('Out-of-range values were adjusted: People, Walking speed.')).toBe('ปรับค่าที่เกินช่วงที่กำหนด: จำนวนคน, ความเร็วเดิน');
  expect(noticeText('Shared with model 1; results may differ in model 2.')).toBe('แชร์จากแบบจำลอง 1 ผลอาจต่างไปเมื่อใช้แบบจำลอง 2');
  expect(noticeText('The value 0.6 for Service time is outside its range (15–600, step 3).')).toContain('0.6 ของเวลาให้บริการอยู่นอกช่วง (15–600 เพิ่มทีละ 3)');
});

for (const name of ['research-protocol', 'studies/visibility-roles-v1']) test(`Thai ${name} preserves every numerical value, code identifier, link and table row`, () => {
  const english = readFileSync(new URL(`../../docs/${name}.md`, import.meta.url), 'utf8');
  const thai = readFileSync(new URL(`../../docs/${name}.th.md`, import.meta.url), 'utf8');
  const translated = translateDocument(english, (key, values) => {
    const template = (documentMessages as Record<string, string>)[key];
    expect(template, key).toBeDefined();
    expect(slots(template), key).toEqual(slots(key));
    return template.replace(/\{v(\d+)\}/g, (_match, i: string) => values[Number(i)]);
  });
  expect(thai).toBe(translated);
  expect(thai).not.toMatch(/\{v\d+\}/);
  expect(documentTemplate(thai).values.sort()).toEqual(documentTemplate(english).values.sort());
  const rows = (text: string) => text.split('\n').filter((line) => line.startsWith('|')).map((line) => line.split('|'));
  const enRows = rows(english), thRows = rows(thai);
  expect(thRows).toHaveLength(enRows.length);
  for (let row = 0; row < enRows.length; row++) {
    expect(thRows[row]).toHaveLength(enRows[row].length);
    enRows[row].forEach((cell, col) => { if (!/[a-z]/i.test(cell)) expect(thRows[row][col]).toBe(cell); });
  }
});
