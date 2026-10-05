import { describe, expect, it, afterEach } from 'vitest';
import { chooseLanguage, language, messageIn, msg, rich } from '../../src/i18n';
import { defaultConfig } from '../../src/config/schema';
import { studyPlanKey } from '../../src/batch/sensitivity-plan';
import { visibilityPlanKey } from '../../src/research/visibility-plan';

afterEach(() => { language.value = 'en'; });

describe('language is independent of the research model', () => {
  it('uses a link before a saved choice, with Thai as the default', () => {
    expect(chooseLanguage('?lang=en', 'th')).toBe('en');
    expect(chooseLanguage('?lang=th', 'en')).toBe('th');
    expect(chooseLanguage('?lang=unknown', 'en')).toBe('en');
    expect(chooseLanguage('', 'en')).toBe('en');
    expect(chooseLanguage('', 'th')).toBe('th');
    expect(chooseLanguage('', null)).toBe('th');
    expect(chooseLanguage('?lang=unknown', 'invalid')).toBe('th');
  });

  it('formats a complete Thai sentence without changing the values', () => {
    language.value = 'th';
    expect(msg('About {v0} {v1} people out of 100 leave when every group reserves.', { v0: '5', v1: 'more' }))
      .toBe('เมื่อทุกกลุ่มจองโต๊ะ คนออกไปเพิ่มขึ้นประมาณ 5 คน จากทุก 100 คน');
    expect(messageIn('en', 'Restart')).toBe('Restart');
    expect(messageIn('th', 'reserveFraction')).toBe('reserveFraction');
  });

  it('retains literal content as text and supports reordering rich slots', () => {
    language.value = 'th';
    const node = { type: 'b', props: { children: '5' }, key: null } as never;
    const children = rich('About {v0} {v1} people out of 100 leave when every group reserves.', { v0: node, v1: 'more' });
    expect(children).toContain(node);
    expect(msg('{v0}', { v0: '<script>literal</script>' })).toBe('<script>literal</script>');
  });

  it('keeps settings and both experiment plan fingerprints identical across languages', () => {
    language.value = 'en';
    const baseline = [JSON.stringify(defaultConfig()), studyPlanKey(), visibilityPlanKey()];
    language.value = 'th';
    expect([JSON.stringify(defaultConfig()), studyPlanKey(), visibilityPlanKey()]).toEqual(baseline);
  });
});
