import { defaultConfig, type Config } from './schema';

export interface Preset {
  id: string;
  label: string;
  help: string;
  apply: (c: Config) => void;
}

/** Scenario presets (spec §9.3): the defaults plus overrides; the current seed is kept by the caller. */
export const PRESETS: Preset[] = [
  { id: 'default', label: 'Default lunch', help: 'The default settings.', apply: () => {} },
  { id: 'quiet', label: 'Quiet day', help: '800 people instead of 1,800.', apply: (c) => { c.crowd.totalPeople = 800; } },
  {
    id: 'crush', label: 'Crush', help: '2,600 people, 75% of them in the rush.',
    apply: (c) => { c.crowd.totalPeople = 2600; c.crowd.peakShare = 0.75; },
  },
  {
    id: 'reservationFriendly',
    label: 'Reservation-friendly',
    help:
      'Chosen to favour reservation. Big groups waste few seats per claim. Fast, evenly chosen stalls keep queues short, and with them each claim’s idle time. Slow tray walking and 5 m visibility make free-flow tray searches costly. Note: 5 m visibility also narrows the claimer’s view during its claim search.',
    apply: (c) => {
      c.crowd.groupMix = [5, 10, 15, 25, 20, 25];
      c.stalls.serviceMean = 45;
      c.stalls.popularitySkew = 0;
      c.search.visibility = 5;
      c.move.traySpeed = 0.7;
    },
  },
];

export function presetConfig(id: string, seed?: number): Config {
  const c = defaultConfig();
  const p = PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`unknown preset ${id}`);
  p.apply(c);
  if (seed !== undefined) c.seed = seed;
  return c;
}
