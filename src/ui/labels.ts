import { msg as trText } from '../i18n';
export const APP_TITLE = 'Canteen Sim';

/** Person colour classes in precedence order (CLS ids 0–6). */
export const CLASS_LABELS = [
  'Claiming a table',
  'Queuing',
  'Searching with food',
  'Holding seats',
  'Eating',
  'Left without eating',
  'Walking',
];
export const CLASS_HELP = [
  'A group member looking for an empty table to reserve, or placing the object on it.',
  'At a stall: walking to a queue place, queuing, being served, or waiting because every queue is full.',
  'Carrying food and looking for seats. After circling, the group may split across tables.',
  'Seated while groupmates are still on their way.',
  'Seated: eating, waiting for groupmates to finish, or lingering.',
  'Left before getting food: at the door, or after queuing too long. Plates can’t be taken away, so nobody leaves holding food.',
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
export const seatOpenLabel = (n: number) => trText("Reserved, open to parties of ≤ {v0}", { v0: (n) });

export const LEGEND_TRAY = 'Carrying a tray';
export const LEGEND_RING = 'Seats kept for someone not here yet';
export const LEGEND_OBJECT = 'Reservation object (bottle, umbrella or lanyard)';
/** Hover-card detail for people who left, and for split-mode searchers (design §6.4). */
export const LEFT_LABELS = ['', 'Left: queues too long', 'Left: no room in sight', 'Left: queues too long and no room in sight', 'Left: waited too long in the queue'];
export const COLLECTING_LABEL = 'Collecting the object';
export const SPLITTING_LABEL = 'Searching with food, willing to split';

export const OBJECT_NAMES = ['bottle', 'umbrella', 'lanyard'];

export const CANTEEN_A = 'A · Reservation';
export const CANTEEN_B = 'B · Free flow (no reservations)';
export const sliderLabel = (p: number) => trText("Groups that reserve in A: {v0}%", { v0: (p) });

export const COUNTERS: { id: string; label: string; help: string }[] = [
  { id: 'queuing', label: 'Queuing', help: 'People at a stall from reaching its walkway until they are served, including the person being served.' },
  { id: 'searching', label: 'Searching with food', help: 'Free-flow searchers carrying food and looking for a table.' },
  { id: 'claiming', label: 'Claiming a table', help: 'People looking for a table to reserve, or placing the object.' },
  { id: 'standing', label: 'Standing with food', help: 'People holding food who are standing still.' },
  { id: 'left', label: 'Left without eating so far', help: 'People who left before getting food: at the door (queues or seating looked too bad) or from a queue (waited past their limit).' },
  { id: 'sits60', label: 'Sat down in the last hour', help: 'Sit starts in the last 60 minutes of sim time.' },
  { id: 'e2s', label: 'Entrance to seat so far', help: 'Mean minutes from the entrance to sitting down, over the people who have sat so far.' },
];

export const STRIP_TITLE = 'Free-flow advantage';
export const STRIP_CAPTION = 'This lunch only. One lunch can be luck; see Batch for 30.';
export const ADVANTAGE_HELP = 'Positive means free flow did better.';

export const HOWTO_STEPS = [
  'Left, canteen A: some groups reserve a whole table with a bottle, umbrella or lanyard before buying food. Right, canteen B: everyone buys food first, then sits anywhere.',
  'Both canteens get exactly the same people, arriving at the same times in the same groups, with the same tastes. A longer queue can still send someone to a different stall.',
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
  modelNotice: (x: number, y: number) => trText("Shared with model {v0}; results may differ in model {v1}.", { v0: (x), v1: (y) }),
  storageOff: 'Saving isn’t available in this browser',
  finished: (clock: string) => trText("Finished at {v0}", { v0: (clock) }),
  truncated: (clock: string) => trText("Run truncated at {v0}", { v0: (clock) }),
  runningAt: (x: number) => trText("running at {v0}×", { v0: (x) }),
  batchFailed: (m: string) => trText("Batch failed: {v0}", { v0: (m) }),
  batchSource: (seed: number) => trText("Using the settings of the current live lunch (seed {v0})", { v0: (seed) }),
  oneLunch: 'This is one lunch.',
  precomputed: (model: number) => trText("Precomputed for the default settings, model {v0}. Re-run on this device to check.", { v0: (model) }),
  allMatch: (n: number) => trText("All {v0} runs match", { v0: (n) }),
  copied: 'Copied',
  copyFailed: 'Copy isn’t allowed here. Select the text and copy it yourself.',
  engineError: 'The simulation stopped with an error.',
};

export const CHART_CAPTION =
  'Shaded band: 95% confidence interval of the average paired difference. If it crosses zero, these lunches can’t tell the two canteens apart. Intervals show seed-to-seed variation under these exact settings, not uncertainty about the settings — see the sensitivity sweep.';

export const ARIA = { settings: 'Settings', batch: 'Batch runs', play: 'Play', pause: 'Pause', howto: 'How this works', theme: 'Theme', assumptions: 'Assumptions' };
