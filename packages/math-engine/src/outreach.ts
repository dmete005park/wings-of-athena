import { Calculation, OutreachPlanInput, ValidationIssue } from './types';
import { isFiniteNonNegative, validateProbability } from './validation';

export interface OutreachPlanResult {
  attemptsGoal: number;
  expectedSuccessfulContacts: number;
}

export function calculateOutreachPlan(input: OutreachPlanInput): Calculation<OutreachPlanResult> {
  const issues: ValidationIssue[] = [];
  if (!isFiniteNonNegative(input.uniqueReachTarget)) {
    issues.push({ level: 'ERROR', code: 'INVALID_UNIQUE_REACH', message: 'Unique reach target must be non-negative.' });
  }
  if (!Number.isFinite(input.contactDepthTarget) || input.contactDepthTarget < 0) {
    issues.push({ level: 'ERROR', code: 'INVALID_CONTACT_DEPTH', message: 'Contact depth target must be non-negative.' });
  } else if (input.uniqueReachTarget > 0 && input.contactDepthTarget < 1) {
    issues.push({ level: 'ERROR', code: 'CONTACT_DEPTH_BELOW_ONE', message: 'Positive unique reach requires a contact depth of at least 1 attempt per targeted voter on average.' });
  }
  issues.push(...validateProbability(input.perAttemptContactRate, 'Per-attempt contact rate'));
  if (input.reachableUniverse !== undefined && input.uniqueReachTarget > input.reachableUniverse) {
    issues.push({ level: 'WARNING', code: 'REACHABILITY_CONSTRAINED', message: 'Unique reach target exceeds known reachable universe.' });
  }
  if (issues.some((issue) => issue.level === 'ERROR')) return { value: null, issues };

  const attemptsGoal = Math.ceil(input.uniqueReachTarget * input.contactDepthTarget);
  return {
    value: {
      attemptsGoal,
      expectedSuccessfulContacts: attemptsGoal * input.perAttemptContactRate
    },
    issues
  };
}

export function attemptsRequiredForContactGoal(desiredSuccessfulContacts: number, perAttemptContactRate: number): Calculation<number> {
  const issues = validateProbability(perAttemptContactRate, 'Per-attempt contact rate');
  if (perAttemptContactRate === 0) {
    issues.push({ level: 'ERROR', code: 'ZERO_CONTACT_RATE', message: 'A positive contact rate is required to calculate attempts for a contact goal.' });
  }
  if (!isFiniteNonNegative(desiredSuccessfulContacts)) {
    issues.push({ level: 'ERROR', code: 'INVALID_CONTACT_GOAL', message: 'Desired successful contacts must be non-negative.' });
  }
  if (issues.some((issue) => issue.level === 'ERROR')) return { value: null, issues };
  return { value: Math.ceil(desiredSuccessfulContacts / perAttemptContactRate), issues };
}
