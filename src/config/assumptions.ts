/** The spec §15 assumptions and fairness ledger, shown in the Assumptions panel (§11.12). */
export interface Assumption {
  text: string;
  /** Setting ids this item maps to; items without one are "Fixed in this model". */
  settings?: string[];
}
export interface AssumptionGroup { heading: string; items: Assumption[] }

export const ASSUMPTIONS: AssumptionGroup[] = [
  {
    heading: 'Left out — would make reservation look worse (conservative toward the owner’s hypothesis)',
    items: [
      { text: 'Reserving long before arriving.' },
      { text: 'One group claiming several tables.' },
      { text: 'Claims abandoned when a group leaves early.' },
    ],
  },
  {
    heading: 'Built in — helps reservation',
    items: [
      { text: 'Reservers return with food straight to their table, with no search.' },
      { text: 'One claimer by default: groupmates queue at once and learn the table instantly.', settings: ['reserve.claimMode'] },
      { text: 'The claim target is chosen near the members’ stalls.' },
      { text: 'Solos and pairs may share a seated reserved table (owner’s rule).', settings: ['reserve.shareMinEmpty', 'reserve.shareMaxParty'] },
      { text: 'Reservers fall back to free flow when no empty table is found.', settings: ['reserve.claimSearchLimit'] },
      { text: 'Free-flow groups never split: if n seats at one table can’t be found within patience, the whole group walks away (decisions #3, #12). The split-feasible walk-aways diagnostic counts groups that gave up while enough free seats existed in total; it does not tell scattered seats apart from a table the searcher never found.', settings: ['search.patience'] },
      { text: 'With search.parallel off (the default), free-flow groupmates with food wait at their stall instead of searching in parallel.', settings: ['search.parallel'] },
      { text: 'The Reservation-friendly preset.' },
    ],
  },
  {
    heading: 'Built in — helps free flow',
    items: [
      { text: 'Routes never get lost.' },
      { text: 'Held seats are always respected once asked about.' },
      { text: 'Visibility has no occlusion.', settings: ['search.visibility'] },
      { text: 'People waiting at nodes block no one. R6 waiters standing with food are almost all free-flow. The standing with food counter and person-minutes make this visible.' },
    ],
  },
  {
    heading: 'Direction unclear',
    items: [
      { text: 'Strangers moving objects is not modelled: it would mean fewer blocked seats, but reservers lose their tables.' },
      { text: 'No preference for empty tables at search.emptyTableDetour = 0. This packs free-flow parties tighter, which helps big free-flow groups but leaves more empty tables for claimers.', settings: ['search.emptyTableDetour'] },
      { text: 'No hovering beside diners about to leave. Modelling it would shorten free-flow searches but block 1-lane aisles.' },
    ],
  },
  {
    heading: 'Neutral — identical in A and B',
    items: [
      { text: 'Mesoscopic lanes instead of collisions.' },
      { text: 'Static routing.' },
      { text: 'Everyone can see queue lengths.', settings: ['stalls.queueAversion'] },
      { text: 'Fixed patience.', settings: ['search.patience'] },
      { text: 'The same eating-time distribution.', settings: ['eat.mean', 'eat.cv'] },
      { text: 'Held seats look empty from afar, and sitting at any table where someone is seated requires asking.' },
    ],
  },
  {
    heading: 'Identical in A and B, but not neutral in effect',
    items: [
      { text: 'Stall capacity (one server per stall, stalls.serviceMean). Longer queues lengthen every claim’s claimedEmpty time and every free-flow hold. See the service-time sweep and the Load readout.', settings: ['stalls.serviceMean', 'layout.stallCount'] },
    ],
  },
  {
    heading: 'Metric choices disclosed',
    items: [
      { text: 'In the diagnostic seat-efficiency ratio, openToSmall seats are shown both as available and as waste. The headline seat metric (P3) counts only occupied seats.' },
    ],
  },
];
