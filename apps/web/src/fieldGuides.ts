/**
 * Manager-facing field help. Examples use obviously synthetic shapes, not calibrated campaign values.
 * See docs/DATA_CLASSIFICATION.md.
 */

export interface FieldGuide {
  /** One-line format / range guidance */
  format: string;
  /** What the math engine or plan record does with this value */
  flowsTo: string;
  /** Optional longer explanation (Level 2) */
  detail?: string;
}

export const SECTION_PIPELINES = {
  campaignSetup:
    'Labels the plan for adoption and audit. These fields do not drive math yet, but empty required labels block adoption.',
  pathToVictory:
    'Your counts and rates feed the math engine immediately. Summary cards above update on every edit. The strategic universe becomes the sizing input for Program & Budget.',
  programBudget:
    'Capacity and channel inputs are checked against the strategic universe. Material gaps require a written acknowledgment before adoption.',
  adoptPlan:
    'Save stores a draft and its input fingerprint locally. Adopt locks this plan version — inputs, calculations, and acknowledgments — as immutable.',
} as const;

export const FIELD_GUIDES = {
  campaignName: {
    format: 'Short text label',
    flowsTo: 'Plan record metadata and adoption checklist',
    detail: 'Use the name managers will recognize in exports and review packets.',
  },
  office: {
    format: 'Short text (e.g. office title)',
    flowsTo: 'Plan record metadata',
  },
  electionType: {
    format: 'One of the listed election types',
    flowsTo: 'Plan metadata; future rule packs may key off this',
  },
  electionDate: {
    format: 'Calendar date',
    flowsTo: 'Plan metadata and pacing windows when pacing is enabled',
  },
  geography: {
    format: 'Short text (district, city, or region label)',
    flowsTo: 'Plan metadata',
  },
  eligibleVoters: {
    format: 'Whole number ≥ 0 (registered or eligible population)',
    flowsTo: 'Sanity context for segment counts; not added into the weighted formula directly',
    detail: 'Segment voter counts should not exceed eligible voters unless you intentionally model overlap elsewhere.',
  },
  segmentCount: {
    format: 'Whole number ≥ 0',
    flowsTo: 'Weighted electorate: count × turnout for this band',
    detail: 'Example shape: three bands with counts 2,000 + 3,000 + 5,000 = 10,000 voters modeled.',
  },
  segmentTurnout: {
    format: 'Probability between 0 and 1 (shown as %)',
    flowsTo: 'Expected votes from this band before summing into expected electorate',
    detail: '0.5 means half of voters in the band are expected to turn out. Not a turnout forecast from historical data unless you supply that separately.',
  },
  targetShare: {
    format: 'Share between 0 and 1 (shown as %)',
    flowsTo: 'Campaign vote goal above the mathematical majority threshold',
    detail: 'Default mathematical baseline is 50% of expected electorate plus one for a strict majority rule. Higher targets are an explicit manager choice, never a hidden cushion.',
  },
  universeMultiplier: {
    format: 'Positive number (often 1.0–2.0 in fixtures)',
    flowsTo: 'Strategic universe = vote goal × multiplier',
    detail: 'Constructs outreach universe size from the vote goal. It is a planning method, not a hard capacity cap.',
  },
  resourcePoolWorkers: {
    format: 'Whole number > 0 when Program & Budget is complete',
    flowsTo: 'Shared pool capacity across enabled channels',
  },
  completedShiftsPerWorker: {
    format: 'Positive number (can be fractional)',
    flowsTo: 'Total completed shifts available in the shared pool',
  },
  remainingActiveDays: {
    format: 'Whole number > 0 (optional pacing input)',
    flowsTo: 'Pace and per-day shift remedies when gaps are shown',
  },
  availableBudget: {
    format: 'Currency amount ≥ 0 (optional)',
    flowsTo: 'COST gap when modeled program spend exceeds budget',
  },
  supportIdEnabled: {
    format: 'On/off',
    flowsTo: 'Adds SUPPORT_ID objective to canonical plan inputs and section requirements',
  },
  supportIdCoverageTarget: {
    format: 'Share between 0 and 1 when objective enabled',
    flowsTo: 'Support-ID objective calculations when enabled',
  },
  supporterTurnoutRate: {
    format: 'Probability between 0 and 1 when objective enabled',
    flowsTo: 'Support-ID turnout portion when objective enabled',
  },
  channelEnabled: {
    format: 'On/off per channel',
    flowsTo: 'Whether this channel participates in feasibility and capacity math',
  },
  uniqueReachTarget: {
    format: 'Whole number > 0 — people you intend to reach uniquely',
    flowsTo: 'Reachability check vs reachable universe for this channel',
    detail: 'Manager-explicit target. Wings does not sum unique reach across channels without a dedupe method.',
  },
  reachableUniverse: {
    format: 'Whole number ≥ 0',
    flowsTo: 'Operational ceiling for unique reach on this channel',
  },
  contactDepthTarget: {
    format: 'Positive number (attempts per reached person)',
    flowsTo: 'Outreach attempts = unique reach × contact depth',
  },
  attemptsPerCompletedShift: {
    format: 'Positive whole number',
    flowsTo: 'Capacity: how many attempts one completed shift covers',
  },
  allocatedCompletedShifts: {
    format: 'Whole number ≥ 0',
    flowsTo: 'Pool allocation; summed across channels for ALLOCATION conflicts',
  },
  volunteerFlakeRate: {
    format: 'Optional probability 0–1',
    flowsTo: 'Scheduled shifts needed to hit completed shift targets',
  },
  costPerCompletedShift: {
    format: 'Optional currency ≥ 0',
    flowsTo: 'Modeled program cost and incremental cost remedies',
  },
} as const satisfies Record<string, FieldGuide>;
