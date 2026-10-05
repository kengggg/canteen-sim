import { language, msg, setLanguage, type Language } from '../i18n';

export function LanguagePicker() {
  return <label class="language-picker">
    <span>{msg('Language')}</span>
    <select aria-label="Language / ภาษา" value={language.value} onChange={(e) => setLanguage(e.currentTarget.value as Language)}>
      <option value="th" lang="th">ไทย</option>
      <option value="en" lang="en">English</option>
    </select>
  </label>;
}
