import { MODEL_VERSION } from '../sim/version';
import { META, getSetting, type SettingMeta } from './meta';
import { defaultConfig, type Config } from './schema';

/** Sharing format version (the `v` key). */
export const SHARE_VERSION = 1;

export type Leaf = number | boolean | string | number[];
export type Decoded = { ok: true; values: Map<string, Leaf>; model: number } | { ok: false };

const pad2 = (n: number) => (n < 10 ? '0' : '') + n;

function encodeValue(m: SettingMeta, v: Leaf): string {
  if (m.type === 'mix6') return (v as number[]).join('.');
  if (m.type === 'time') return `${pad2(Math.floor((v as number) / 60))}${pad2((v as number) % 60)}`;
  if (m.type === 'bool') return v ? '1' : '0';
  return String(v);
}

function decodeValue(m: SettingMeta, s: string): Leaf | undefined {
  if (m.type === 'mix6') {
    const parts = s.split('.');
    if (parts.length !== 6 || parts.some((p) => !/^\d+$/.test(p))) return undefined;
    return parts.map(Number);
  }
  if (m.type === 'time') {
    const t = /^(\d{2})(\d{2})$/.exec(s);
    return t ? Number(t[1]) * 60 + Number(t[2]) : undefined;
  }
  if (m.type === 'bool') return s === '1' ? true : s === '0' ? false : undefined;
  if (m.type === 'enum') return m.options!.includes(s) ? s : undefined;
  if (!/^-?\d+(\.\d+)?(e[-+]?\d+)?$/i.test(s)) return undefined;
  return Number(s);
}

/** `v=1&m=…&seed=…` plus every non-default setting (spec §9.4). */
export function encodeQuery(c: Config): string {
  const d = defaultConfig();
  const parts = [`v=${SHARE_VERSION}`, `m=${MODEL_VERSION}`, `seed=${c.seed >>> 0}`];
  for (const m of META) {
    if (m.id === 'seed') continue;
    const v = getSetting(c, m.id);
    if (JSON.stringify(v) === JSON.stringify(getSetting(d, m.id))) continue;
    parts.push(`${m.id}=${encodeURIComponent(encodeValue(m, v))}`);
  }
  return parts.join('&');
}

export const encodeHash = (c: Config) => `#${encodeQuery(c)}`;

function toBase64Url(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64Url(s: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  try {
    return atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  } catch {
    return null;
  }
}

/** The settings code: base64url of exactly the hash content. */
export const settingsCode = (c: Config) => toBase64Url(encodeQuery(c));

export function decodeQuery(q: string): Decoded {
  const map = new Map<string, string>();
  for (const part of q.replace(/^#/, '').split('&')) {
    if (!part) continue;
    const i = part.indexOf('=');
    if (i <= 0) return { ok: false };
    try {
      map.set(part.slice(0, i), decodeURIComponent(part.slice(i + 1)));
    } catch {
      return { ok: false };
    }
  }
  if (map.get('v') !== String(SHARE_VERSION)) return { ok: false };
  const model = Number(map.get('m'));
  if (!Number.isInteger(model) || model < 1) return { ok: false };
  const values = new Map<string, Leaf>();
  for (const m of META) {
    const s = map.get(m.id);
    if (s === undefined) continue;
    const v = decodeValue(m, s);
    if (v === undefined) return { ok: false };
    values.set(m.id, v);
  }
  return { ok: true, values, model };
}

/** Accepts a bare settings code, a `#v=…` hash, or any URL containing `#v=…`. */
export function parseShared(input: string): Decoded {
  const s = input.trim();
  const h = s.indexOf('#v=');
  if (h >= 0) return decodeQuery(s.slice(h + 1));
  if (s.startsWith('v=')) return decodeQuery(s);
  const q = fromBase64Url(s);
  return q === null ? { ok: false } : decodeQuery(q);
}
