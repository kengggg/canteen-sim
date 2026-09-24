/** Every user-facing string (spec §11.6 Labels). */

export const APP_TITLE = 'Canteen Sim';

/** Person colour classes in precedence order (CLS ids 0–6). */
export const CLASS_LABELS = [
  'Claiming a table',
  'Queuing',
  'Searching with food',
  'Holding seats',
  'Eating',
  'Walked away',
  'Walking',
];
export const CLASS_HELP = [
  'A group member looking for an empty table to reserve, or placing the object on it.',
  'At a stall: walking to a queue place, queuing, being served, or waiting because every queue is full.',
  'Carrying food and looking for a table where the whole group fits.',
  'Seated while groupmates are still on their way.',
  'Seated: eating, waiting for groupmates to finish, or lingering.',
  'Gave up on a seat and is leaving with takeaway.',
  'Entering, walking to a stall or a seat, waiting for the group, or heading to the tray return and exit.',
];

/** Seat states (SEAT ids 0–5) with their §7.1 display labels. */
export const SEAT_LABELS = [
  'Free',
  'Reserved, open to small parties',
  'Reserved, spare seats nobody can use',
  'Reserved, group not all seated',
  'Saved for a groupmate',
  'Seated',
];
export const seatOpenLabel = (n: number) => `Reserved, open to parties of ≤ ${n}`;

export const LEGEND_TRAY = 'Carrying a tray';
export const LEGEND_RING = 'Seats kept for someone not here yet';
export const LEGEND_OBJECT = 'Reservation object (bottle, umbrella or lanyard)';
export const OBJECT_NAMES = ['bottle', 'umbrella', 'lanyard'];

export const CANTEEN_A = 'A · Reservation';
export const CANTEEN_B = 'B · Free flow (no reservations)';
export const sliderLabel = (p: number) => `Groups that reserve in A: ${p}%`;

export const COUNTERS: { id: string; label: string; help: string }[] = [
  { id: 'queuing', label: 'Queuing', help: 'People at a stall from reaching its walkway until they are served, including the person being served.' },
  { id: 'searching', label: 'Searching with food', help: 'Free-flow searchers carrying food and looking for a table.' },
  { id: 'claiming', label: 'Claiming a table', help: 'People looking for a table to reserve, or placing the object.' },
  { id: 'standing', label: 'Standing with food', help: 'People holding food who are standing still.' },
  { id: 'walkAways', label: 'Walk-aways so far', help: 'People whose group gave up on finding a table.' },
  { id: 'sits60', label: 'Sat down in the last hour', help: 'Sit starts in the last 60 minutes of sim time.' },
  { id: 'e2s', label: 'Entrance to seat so far', help: 'Mean minutes from the entrance to sitting down or giving up; people still searching count up to now.' },
];

export const STRIP_TITLE = 'Free-flow advantage';
export const STRIP_CAPTION = 'This lunch only. One lunch can be luck; see Batch for 30.';
export const ADVANTAGE_HELP = 'Positive means free flow did better.';

export const HOWTO_STEPS = [
  'Left, canteen A: some groups reserve a whole table with a bottle, umbrella or lanyard before buying food. Right, canteen B: everyone buys food first, then sits anywhere.',
  'Both canteens get exactly the same people, arriving at the same times and choosing the same food.',
  'A glowing ring marks a table with seats kept for someone who isn’t there yet.',
  'One lunch can be luck. The Evidence panel shows 30.',
  'Change anything in ⚙; the Assumptions panel lists what’s fixed.',
];
export const HOWTO_TITLE = 'How this works';

export const MSG = {
  dirty: 'Settings changed — Restart to apply',
  noWebgl: 'The 3D view needs WebGL, which this browser has blocked. Live numbers and batch runs still work.',
  contextLost: '3D view paused',
  restore: 'Restore',
  badCode: 'This settings code isn’t valid or is from a newer version',
  badJson: 'This file isn’t a valid Canteen Sim settings file or is from a newer version.',
  modelNotice: (x: number, y: number) => `Shared with model ${x}; results may differ in model ${y}.`,
  storageOff: 'Saving isn’t available in this browser',
  finished: (clock: string) => `Finished at ${clock}`,
  truncated: (clock: string) => `Run truncated at ${clock}`,
  runningAt: (x: number) => `running at ${x}×`,
  batchFailed: (m: string) => `Batch failed: ${m}`,
  batchSource: (seed: number) => `Using the settings of the current live lunch (seed ${seed})`,
  oneLunch: 'This is one lunch.',
  precomputed: (model: number) => `Precomputed for the default settings, model ${model}. Re-run on this device to check.`,
  allMatch: (n: number) => `All ${n} runs match`,
  copied: 'Copied',
  copyFailed: 'Copy isn’t allowed here. Select the text and copy it yourself.',
  engineError: 'The simulation stopped with an error.',
};

export const CHART_CAPTION =
  'Shaded band: 95% confidence interval of the average paired difference. If it crosses zero, these lunches can’t tell the two canteens apart. Intervals show seed-to-seed variation under these exact settings, not uncertainty about the settings — see the sensitivity sweep.';

export const ARIA = { settings: 'Settings', batch: 'Batch runs', play: 'Play', pause: 'Pause', howto: 'How this works', theme: 'Theme', assumptions: 'Assumptions' };
