import { Color } from 'three';

/** Scene colours read from the CSS tokens (spec §11.8). Every token is #rrggbb, applied with Color.set. */
export interface SceneTokens {
  clear: Color;
  floor: Color;
  zone: Color;
  aisle: Color;
  wall: Color;
  table: Color;
  chair: Color;
  counter: Color;
  kitchen: Color;
  tray: Color;
  door: Color;
  label: string;
  object: Color;
  ring: Color;
  contact: Color;
  cls: Color[];
  seat: Color[];
  a: string;
  b: string;
}

export function readTokens(el: Element = document.documentElement): SceneTokens {
  const cs = getComputedStyle(el);
  const hex = (name: string) => cs.getPropertyValue(name).trim() || '#ff00ff';
  const c = (name: string) => new Color().set(hex(name));
  return {
    clear: c('--scene-clear'),
    floor: c('--scene-floor'),
    zone: c('--scene-zone'),
    aisle: c('--scene-aisle'),
    wall: c('--scene-wall'),
    table: c('--scene-table'),
    chair: c('--scene-chair'),
    counter: c('--scene-counter'),
    kitchen: c('--scene-kitchen'),
    tray: c('--scene-tray'),
    door: c('--scene-door'),
    label: hex('--scene-label'),
    object: c('--scene-object'),
    ring: c('--scene-ring'),
    contact: c('--scene-contact'),
    cls: Array.from({ length: 7 }, (_, i) => c(`--cls-${i}`)),
    seat: Array.from({ length: 6 }, (_, i) => c(`--seat-${i}`)),
    a: hex('--a'),
    b: hex('--b'),
  };
}

/** A per-stall awning colour: evenly spaced hues, muted so they never compete with the person classes. */
export function awningColor(i: number, n: number, dark: boolean): Color {
  return new Color().setHSL(((i * 0.618034) % 1 + 1) % 1, dark ? 0.35 : 0.42, dark ? 0.42 : 0.62);
}
