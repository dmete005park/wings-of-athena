import {
  REQUIRED_PROGRAM_FORMULA,
  REQUIRED_PROGRAM_METRIC,
} from './requiredProgram';

export interface MetricDefinition {
  key: string;
  displayName: string;
  unit: string;
  formulaId?: string;
  rounding: 'NONE' | 'WHOLE_DISPLAY' | 'CEIL_REQUIRED_WORK' | 'FLOOR_CAPACITY';
  overridePolicy: 'NO_OVERRIDE' | 'ALLOW_OVERRIDE' | 'OBJECTIVE_DEPENDENT';
}

export const METRIC_REGISTRY: readonly MetricDefinition[] = [
  { key: 'electorate.expected.modeled', displayName: 'Modeled Expected Electorate', unit: 'voters', formulaId: 'electorate.weighted_segments.v0.2', rounding: 'WHOLE_DISPLAY', overridePolicy: 'NO_OVERRIDE' },
  { key: 'electorate.expected.adopted', displayName: 'Adopted Expected Electorate', unit: 'voters', rounding: 'WHOLE_DISPLAY', overridePolicy: 'ALLOW_OVERRIDE' },
  { key: 'victory.threshold', displayName: 'Mathematical Win Threshold', unit: 'votes', formulaId: 'race.threshold.v0.2', rounding: 'CEIL_REQUIRED_WORK', overridePolicy: 'NO_OVERRIDE' },
  { key: 'victory.vote_goal', displayName: 'Campaign Vote Goal', unit: 'votes', formulaId: 'victory.vote_goal.v0.2', rounding: 'CEIL_REQUIRED_WORK', overridePolicy: 'ALLOW_OVERRIDE' },
  { key: 'universe.strategic_desired', displayName: 'Strategic Desired Universe', unit: 'voters', formulaId: 'universe.construct.v0.2', rounding: 'CEIL_REQUIRED_WORK', overridePolicy: 'ALLOW_OVERRIDE' },
  { key: 'universe.available', displayName: 'Available Targetable Voters', unit: 'voters', rounding: 'WHOLE_DISPLAY', overridePolicy: 'NO_OVERRIDE' },
  { key: 'universe.capacity_supported', displayName: 'Capacity-Supported Universe', unit: 'voters', formulaId: 'universe.capacity_supported.v0.2', rounding: 'FLOOR_CAPACITY', overridePolicy: 'NO_OVERRIDE' },
  { key: 'outreach.unique_reach_target', displayName: 'Unique Reach Target', unit: 'voters', rounding: 'CEIL_REQUIRED_WORK', overridePolicy: 'ALLOW_OVERRIDE' },
  { key: 'outreach.contact_depth_target', displayName: 'Contact Depth Target', unit: 'attempts/person', rounding: 'NONE', overridePolicy: 'ALLOW_OVERRIDE' },
  { key: 'outreach.attempts_goal', displayName: 'Attempts Goal', unit: 'attempts', formulaId: 'outreach.attempts.v0.2', rounding: 'CEIL_REQUIRED_WORK', overridePolicy: 'NO_OVERRIDE' },
  { key: 'outreach.successful_contacts_expected', displayName: 'Expected Successful Contacts', unit: 'contacts', formulaId: 'outreach.contacts.v0.2', rounding: 'WHOLE_DISPLAY', overridePolicy: 'NO_OVERRIDE' },
  { key: 'support_ids.required', displayName: 'Required Support IDs', unit: 'supporters', formulaId: 'objective.support_id.required.v0.2', rounding: 'CEIL_REQUIRED_WORK', overridePolicy: 'OBJECTIVE_DEPENDENT' },
  { key: 'capacity.completed_shifts_required', displayName: 'Completed Shifts Required', unit: 'shifts', formulaId: 'capacity.shifts.v0.2', rounding: 'CEIL_REQUIRED_WORK', overridePolicy: 'NO_OVERRIDE' },
  { key: 'capacity.additional_completed_shifts_required', displayName: 'Additional Completed Shifts Required', unit: 'shifts', formulaId: 'capacity.remediation_shifts.v0.2', rounding: 'CEIL_REQUIRED_WORK', overridePolicy: 'NO_OVERRIDE' },
  { key: 'pace.required_daily', displayName: 'Required Daily Pace', unit: 'units/day', formulaId: 'pace.required_daily.v0.2', rounding: 'NONE', overridePolicy: 'NO_OVERRIDE' },
  { key: REQUIRED_PROGRAM_METRIC.IDS, displayName: 'Required IDs for Vote Goal', unit: 'supporters', formulaId: REQUIRED_PROGRAM_FORMULA.IDS, rounding: 'CEIL_REQUIRED_WORK', overridePolicy: 'NO_OVERRIDE' },
  { key: REQUIRED_PROGRAM_METRIC.CONTACTS, displayName: 'Required Contacts for Vote Goal', unit: 'contacts', formulaId: REQUIRED_PROGRAM_FORMULA.CONTACTS, rounding: 'CEIL_REQUIRED_WORK', overridePolicy: 'NO_OVERRIDE' },
  { key: REQUIRED_PROGRAM_METRIC.ATTEMPTS, displayName: 'Required Attempts for Vote Goal', unit: 'attempts', formulaId: REQUIRED_PROGRAM_FORMULA.ATTEMPTS, rounding: 'CEIL_REQUIRED_WORK', overridePolicy: 'NO_OVERRIDE' },
  { key: REQUIRED_PROGRAM_METRIC.SHIFTS, displayName: 'Required Shifts for Vote Goal', unit: 'shifts', formulaId: REQUIRED_PROGRAM_FORMULA.SHIFTS, rounding: 'CEIL_REQUIRED_WORK', overridePolicy: 'NO_OVERRIDE' },
  { key: REQUIRED_PROGRAM_METRIC.BREAK_EVEN_CONTACT_RATE, displayName: 'Break-even Contact Rate', unit: 'probability', formulaId: REQUIRED_PROGRAM_FORMULA.BREAK_EVEN_CONTACT_RATE, rounding: 'NONE', overridePolicy: 'NO_OVERRIDE' },
  { key: REQUIRED_PROGRAM_METRIC.BREAK_EVEN_ATTEMPTS_PER_SHIFT, displayName: 'Break-even Attempts per Shift', unit: 'attempts/shift', formulaId: REQUIRED_PROGRAM_FORMULA.BREAK_EVEN_ATTEMPTS_PER_SHIFT, rounding: 'NONE', overridePolicy: 'NO_OVERRIDE' },
  { key: REQUIRED_PROGRAM_METRIC.BREAK_EVEN_ID_CONVERSION, displayName: 'Break-even ID Conversion Rate', unit: 'probability', formulaId: REQUIRED_PROGRAM_FORMULA.BREAK_EVEN_ID_CONVERSION, rounding: 'NONE', overridePolicy: 'NO_OVERRIDE' }
] as const;

export function metricDefinition(key: string): MetricDefinition | undefined {
  return METRIC_REGISTRY.find((metric) => metric.key === key);
}
