import { signal } from '@preact/signals';
import type { ComponentChildren } from 'preact';
import { th } from './th';
import { messageKey } from './key';

export type Language = 'en' | 'th';
export const LANGUAGE_KEY = 'canteen-sim:language';

/** Language is a presentation preference, separate from settings codes and simulation seeds. */
export function chooseLanguage(query: string, saved: string | null): Language {
  const explicit = new URLSearchParams(query).get('lang');
  if (explicit === 'en' || explicit === 'th') return explicit;
  if (saved === 'en' || saved === 'th') return saved;
  return 'th';
}

function initialLanguage(): Language {
  if (typeof window === 'undefined') return 'en'; // Research CLI output retains its source language.
  let saved: string | null = null;
  try { saved = localStorage.getItem(LANGUAGE_KEY); } catch { /* Storage is optional in offline viewers. */ }
  return chooseLanguage(typeof location === 'undefined' ? '' : location.search, saved);
}

export const language = signal<Language>(initialLanguage());

export function setLanguage(next: Language): void {
  language.value = next;
  try { localStorage.setItem(LANGUAGE_KEY, next); } catch { /* Keep the in-memory choice. */ }
  try {
    const url = new URL(location.href);
    url.searchParams.set('lang', next);
    history.replaceState(null, '', url);
  } catch { /* Some embedded viewers disallow history changes. */ }
}

export function messageIn(lang: Language, source: string): string {
  return lang === 'th' ? th[messageKey(source)] ?? source : source;
}

/** Source messages are catalogue IDs, as in gettext. Whole-message templates allow Thai word order. */
export function msg(source: string | undefined, values: Record<string, string | number> = {}): string {
  const lang = language.value;
  return messageIn(lang, source ?? '').replace(/\{(\w+)\}/g, (token, key: string) => {
    const value = values[key];
    return value === undefined ? token : typeof value === 'string' ? messageIn(lang, value) : String(value);
  });
}

/** Translate display values from unchanged model metadata; identifiers with no message remain literal. */
export function localise(value: ComponentChildren): ComponentChildren {
  if (typeof value === 'string') return msg(value);
  if (Array.isArray(value)) return value.map(localise);
  return value;
}

/** Rich messages retain real links, buttons and emphasis, with no HTML parsing or innerHTML. */
export function rich(source: string, values: Record<string, ComponentChildren>): ComponentChildren {
  return messageIn(language.value, source).split(/(\{\w+\})/g).map((part) => {
    const key = /^\{(\w+)\}$/.exec(part)?.[1];
    return key && key in values ? localise(values[key]) : part;
  });
}
