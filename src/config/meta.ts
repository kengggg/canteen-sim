import type { Config } from './schema';

/**
 * Setting metadata (spec §9.1): one row per setting, in internal units. The settings panel, validation clamps, URL
 * encoding, presets, the sweep picker and the Assumptions links are generated from this table.
 */
export type SettingType = 'int' | 'number' | 'time' | 'mix6' | 'enum' | 'bool';

export interface SettingMeta {
  id: string;
  label: string;
  group: 'Crowd' | 'Reservation' | 'Stalls' | 'Eating' | 'Movement & search' | 'Tray return' | 'Layout';
  type: SettingType;
  /** Internal unit and the factor from internal to UI units (UI = internal × uiFactor). */
  unit: string;
  uiUnit: string;
  uiFactor: number;
  min: number;
  max: number;
  step: number;
  options?: string[];
  help: string;
}

export const META: SettingMeta[] = [
  { id: 'crowd.totalPeople', label: 'People', group: 'Crowd', type: 'int', unit: 'people', uiUnit: 'people', uiFactor: 1, min: 100, max: 5000, step: 50, help: 'How many people come to lunch.' },
  { id: 'crowd.windowStart', label: 'Lunch starts', group: 'Crowd', type: 'time', unit: 'min', uiUnit: 'clock', uiFactor: 1, min: 360, max: 1200, step: 5, help: 'When the first people can arrive.' },
  { id: 'crowd.windowEnd', label: 'Last arrivals', group: 'Crowd', type: 'time', unit: 'min', uiUnit: 'clock', uiFactor: 1, min: 390, max: 1500, step: 5, help: 'When the last people arrive (30 min to 5 h after the start).' },
  { id: 'crowd.peakTime', label: 'Rush peak', group: 'Crowd', type: 'time', unit: 'min', uiUnit: 'clock', uiFactor: 1, min: 360, max: 1500, step: 5, help: 'The busiest moment of the rush (inside the window).' },
  { id: 'crowd.peakShare', label: 'Share in the rush', group: 'Crowd', type: 'number', unit: 'fraction', uiUnit: '%', uiFactor: 100, min: 0, max: 1, step: 0.05, help: 'Share of arrivals that come in the rush; the rest arrive evenly.' },
  { id: 'crowd.peakSpread', label: 'Rush spread', group: 'Crowd', type: 'number', unit: 's', uiUnit: 'min', uiFactor: 1 / 60, min: 300, max: 3600, step: 60, help: 'How spread out the rush is (one standard deviation).' },
  { id: 'crowd.groupMix', label: 'Group sizes', group: 'Crowd', type: 'mix6', unit: 'weight', uiUnit: '%', uiFactor: 1, min: 0, max: 100, step: 1, help: 'Chance of each group size 1–6 (normalised).' },
  { id: 'seed', label: 'Seed', group: 'Crowd', type: 'int', unit: '', uiUnit: '', uiFactor: 1, min: 0, max: 4294967295, step: 1, help: 'Which random lunch. Same seed, same crowd.' },
  { id: 'reserve.percentA', label: 'Groups that reserve in A', group: 'Reservation', type: 'number', unit: 'fraction', uiUnit: '%', uiFactor: 100, min: 0, max: 1, step: 0.05, help: 'Share of groups in canteen A that reserve a table before buying food.' },
  { id: 'reserve.claimMode', label: 'Who reserves', group: 'Reservation', type: 'enum', unit: '', uiUnit: '', uiFactor: 1, min: 0, max: 1, step: 1, options: ['oneClaimer', 'together'], help: 'One member reserves while the others queue, or the whole group reserves together.' },
  { id: 'reserve.claimSearchLimit', label: 'Claim search limit', group: 'Reservation', type: 'number', unit: 's', uiUnit: 's', uiFactor: 1, min: 0, max: 300, step: 5, help: 'How long a claimer keeps choosing new tables before giving up and eating free-flow.' },
  { id: 'reserve.shareMinEmpty', label: 'Empty seats to share', group: 'Reservation', type: 'int', unit: 'seats', uiUnit: 'seats', uiFactor: 1, min: 1, max: 8, step: 1, help: 'A seated reserved table accepts joiners only with at least this many empty seats (2k = no sharing).' },
  { id: 'reserve.shareMaxParty', label: 'Largest joining party', group: 'Reservation', type: 'int', unit: 'people', uiUnit: 'people', uiFactor: 1, min: 1, max: 6, step: 1, help: 'The largest party that may join a seated reserved table.' },
  { id: 'stalls.serviceMean', label: 'Service time', group: 'Stalls', type: 'number', unit: 's', uiUnit: 'min', uiFactor: 1 / 60, min: 15, max: 600, step: 3, help: 'Average time to order, cook and pay at a stall.' },
  { id: 'stalls.serviceCV', label: 'Service variability', group: 'Stalls', type: 'number', unit: '', uiUnit: '', uiFactor: 1, min: 0, max: 1.5, step: 0.05, help: 'Coefficient of variation of service time.' },
  { id: 'stalls.popularitySkew', label: 'Popularity skew', group: 'Stalls', type: 'number', unit: '', uiUnit: '', uiFactor: 1, min: 0, max: 2, step: 0.1, help: '0 = every stall equally popular.' },
  { id: 'stalls.queueAversion', label: 'Queue aversion', group: 'Stalls', type: 'number', unit: '', uiUnit: '', uiFactor: 1, min: 0, max: 5, step: 0.1, help: 'How strongly people avoid long queues.' },
  { id: 'eat.mean', label: 'Eating time', group: 'Eating', type: 'number', unit: 's', uiUnit: 'min', uiFactor: 1 / 60, min: 180, max: 3600, step: 60, help: 'Average time to eat.' },
  { id: 'eat.cv', label: 'Eating variability', group: 'Eating', type: 'number', unit: '', uiUnit: '', uiFactor: 1, min: 0, max: 1, step: 0.05, help: 'Coefficient of variation of eating time.' },
  { id: 'eat.linger', label: 'Linger', group: 'Eating', type: 'number', unit: 's', uiUnit: 'min', uiFactor: 1 / 60, min: 0, max: 1800, step: 60, help: 'Extra time a group stays after the slowest member finishes.' },
  { id: 'move.walkSpeed', label: 'Walking speed', group: 'Movement & search', type: 'number', unit: 'm/s', uiUnit: 'm/s', uiFactor: 1, min: 0.5, max: 2, step: 0.05, help: 'Walking speed without a tray.' },
  { id: 'move.traySpeed', label: 'Tray speed', group: 'Movement & search', type: 'number', unit: 'm/s', uiUnit: 'm/s', uiFactor: 1, min: 0.3, max: 2, step: 0.05, help: 'Walking speed while carrying food or a used tray.' },
  { id: 'search.visibility', label: 'Visibility', group: 'Movement & search', type: 'number', unit: 'm', uiUnit: 'm', uiFactor: 1, min: 2, max: 100, step: 1, help: 'How far a searcher can see tables (no walls block the view).' },
  { id: 'search.patience', label: 'Patience', group: 'Movement & search', type: 'number', unit: 's', uiUnit: 'min', uiFactor: 1 / 60, min: 30, max: 1800, step: 30, help: 'How long a free-flow group searches with food before walking away.' },
  { id: 'search.parallel', label: 'Search in parallel', group: 'Movement & search', type: 'bool', unit: '', uiUnit: '', uiFactor: 1, min: 0, max: 1, step: 1, help: 'Every groupmate with food searches, instead of waiting at the stall.' },
  { id: 'search.emptyTableDetour', label: 'Empty-table detour', group: 'Movement & search', type: 'number', unit: 'm', uiUnit: 'm', uiFactor: 1, min: 0, max: 40, step: 1, help: 'Walk up to this much farther to sit at a completely empty table.' },
  { id: 'tray.dropTime', label: 'Tray drop time', group: 'Tray return', type: 'number', unit: 's', uiUnit: 's', uiFactor: 1, min: 1, max: 60, step: 1, help: 'Time to drop a tray at the return counter.' },
  { id: 'tray.slots', label: 'Tray slots', group: 'Tray return', type: 'int', unit: '', uiUnit: '', uiFactor: 1, min: 1, max: 10, step: 1, help: 'How many people can drop trays at once.' },
  { id: 'layout.cols', label: 'Table columns', group: 'Layout', type: 'int', unit: '', uiUnit: '', uiFactor: 1, min: 1, max: 20, step: 1, help: 'Tables across the hall.' },
  { id: 'layout.rows', label: 'Table rows', group: 'Layout', type: 'int', unit: '', uiUnit: '', uiFactor: 1, min: 1, max: 20, step: 1, help: 'Tables down the hall.' },
  { id: 'layout.seatsPerSide', label: 'Seats per side', group: 'Layout', type: 'int', unit: '', uiUnit: '', uiFactor: 1, min: 2, max: 4, step: 1, help: '4-, 6- or 8-seat tables.' },
  { id: 'layout.verticalAisle', label: 'Vertical aisle width', group: 'Layout', type: 'number', unit: 'm', uiUnit: 'm', uiFactor: 1, min: 0.6, max: 3, step: 0.05, help: '1.2 m or more lets two people pass.' },
  { id: 'layout.horizontalAisle', label: 'Horizontal aisle width', group: 'Layout', type: 'number', unit: 'm', uiUnit: 'm', uiFactor: 1, min: 0.6, max: 3, step: 0.05, help: 'Below 1.2 m people walk single file.' },
  { id: 'layout.stallCount', label: 'Stalls', group: 'Layout', type: 'int', unit: '', uiUnit: '', uiFactor: 1, min: 1, max: 60, step: 1, help: 'Food stalls along the top and left walls.' },
  { id: 'layout.queueDepth', label: 'Queue depth', group: 'Layout', type: 'number', unit: 'm', uiUnit: 'm', uiFactor: 1, min: 3.2, max: 10, step: 0.1, help: 'Depth of the queue zone in front of the stalls.' },
];

export const META_BY_ID = new Map(META.map((m) => [m.id, m]));

type Leaf = number | boolean | string | number[];

export function getSetting(c: Config, id: string): Leaf {
  const [a, b] = id.split('.');
  const rec = c as unknown as Record<string, Record<string, Leaf> | Leaf>;
  return b === undefined ? (rec[a] as Leaf) : (rec[a] as Record<string, Leaf>)[b];
}

export function setSetting(c: Config, id: string, v: Leaf): void {
  const [a, b] = id.split('.');
  const rec = c as unknown as Record<string, Record<string, Leaf> | Leaf>;
  if (b === undefined) rec[a] = v;
  else (rec[a] as Record<string, Leaf>)[b] = v;
}

export function cloneConfig(c: Config): Config {
  return JSON.parse(JSON.stringify(c)) as Config;
}
