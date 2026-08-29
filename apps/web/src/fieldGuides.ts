/**
 * Field help for placeholders and future Level-3 audit UI.
 * Examples use synthetic shapes only. See docs/DATA_CLASSIFICATION.md.
 */

export interface FieldGuide {
  format: string;
  flowsTo: string;
  detail?: string;
}

/** Reserved for docs / future help panel — not shown as section blurbs in UI */
export const SECTION_PIPELINES = {
  campaignSetup: 'Labels the plan. Required for adoption.',
  pathToVictory: 'Counts and rates update the summary cards and universe size.',
  programBudget: 'Checked against universe. Gaps need acknowledgment.',
  adoptPlan: 'Save locally, then adopt to lock the plan.',
} as const;

export const FIELD_GUIDES = {
  campaignName: { format: 'Campaign name', flowsTo: 'Plan metadata' },
  office: { format: 'Office title', flowsTo: 'Plan metadata' },
  electionType: { format: 'Primary, general, municipal, special, or other', flowsTo: 'Plan metadata' },
  raceRule: { format: 'Majority, plurality, runoff, or other', flowsTo: 'Win threshold' },
  raceRuleShare: { format: '0–100%', flowsTo: 'Win threshold' },
  raceRuleLabel: { format: 'Name for this rule', flowsTo: 'Win threshold' },
  electionDate: { format: 'Date', flowsTo: 'Plan metadata' },
  geography: { format: 'District or region', flowsTo: 'Plan metadata' },
  eligibleVoters: { format: 'Whole number', flowsTo: 'Segment context' },
  segmentCount: { format: 'Whole number', flowsTo: 'Band vote estimate' },
  segmentTurnout: { format: '0–100%', flowsTo: 'Band vote estimate' },
  targetShare: { format: '0–100%', flowsTo: 'Vote goal' },
  universeMultiplier: { format: 'Number (e.g. 1.5)', flowsTo: 'Universe size' },
  resourcePoolWorkers: { format: 'Whole number', flowsTo: 'Shared pool' },
  completedShiftsPerWorker: { format: 'Number', flowsTo: 'Pool capacity' },
  remainingActiveDays: { format: 'Days', flowsTo: 'Pace' },
  availableBudget: { format: 'Dollars', flowsTo: 'Budget gap' },
  supportIdEnabled: { format: 'On/off', flowsTo: 'Optional objective' },
  supportIdCoverageTarget: { format: '0–100%', flowsTo: 'Support IDs' },
  supporterTurnoutRate: { format: '0–100%', flowsTo: 'Support IDs' },
  idConversionRate: { format: '0–100%', flowsTo: 'IDs from contacts' },
  channelEnabled: { format: 'On/off', flowsTo: 'Channel math' },
  uniqueReachTarget: { format: 'Whole number', flowsTo: 'Reach target' },
  reachableUniverse: { format: 'Whole number', flowsTo: 'Reach ceiling' },
  contactDepthTarget: { format: 'Attempts per person', flowsTo: 'Outreach volume' },
  attemptsPerCompletedShift: { format: 'Whole number', flowsTo: 'Shift capacity' },
  allocatedCompletedShifts: { format: 'Whole number', flowsTo: 'Pool allocation' },
  perAttemptContactRate: { format: '0–100%', flowsTo: 'Contacts from attempts' },
  volunteerFlakeRate: { format: '0–100%', flowsTo: 'Scheduled shifts' },
  costPerCompletedShift: { format: 'Dollars', flowsTo: 'Program cost' },
} as const satisfies Record<string, FieldGuide>;
