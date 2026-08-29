import { attemptsRequiredForContactGoal } from './outreach';
import { Calculation, ValidationIssue } from './types';
import { isFiniteNonNegative, safeDivide, validateProbability } from './validation';

export const REQUIRED_PROGRAM_FORMULA = {
  IDS: 'outreach.ids_required.v0.2',
  CONTACTS: 'outreach.contacts_required.v0.2',
  ATTEMPTS: 'outreach.attempts_required.v0.2',
  SHIFTS: 'capacity.shifts_required_for_vote_goal.v0.2',
  BREAK_EVEN_CONTACT_RATE: 'program.breakeven.contact_rate.v0.2',
  BREAK_EVEN_ATTEMPTS_PER_SHIFT: 'program.breakeven.attempts_per_shift.v0.2',
  BREAK_EVEN_ID_CONVERSION: 'program.breakeven.id_conversion_rate.v0.2',
} as const;

export const REQUIRED_PROGRAM_METRIC = {
  IDS: 'outreach.ids_required',
  CONTACTS: 'outreach.contacts_required',
  ATTEMPTS: 'outreach.attempts_required',
  SHIFTS: 'capacity.shifts_required_for_vote_goal',
  BREAK_EVEN_CONTACT_RATE: 'program.breakeven.contact_rate',
  BREAK_EVEN_ATTEMPTS_PER_SHIFT: 'program.breakeven.attempts_per_shift',
  BREAK_EVEN_ID_CONVERSION: 'program.breakeven.id_conversion_rate',
} as const;

export interface RequiredProgramInput {
  requiredVotes: number;
  supporterTurnoutRate: number;
  idConversionRate: number;
  perAttemptContactRate: number;
  attemptsPerCompletedShift?: number;
}

export interface RequiredProgram {
  requiredIds: number | null;
  requiredContacts: number | null;
  requiredAttempts: number | null;
  requiredShifts: number | null;
}

export interface BreakEvenInput {
  votesNeeded: number;
  attempts: number;
  contacts: number;
  shifts?: number;
  supporterTurnoutRate: number;
  idConversionRate: number;
  perAttemptContactRate: number;
}

export interface BreakEvenRates {
  contactRate: number | null;
  attemptsPerShift: number | null;
  idConversionRate: number | null;
}

function error(code: string, message: string): ValidationIssue {
  return { level: 'ERROR', code, message };
}

function hasError(issues: ValidationIssue[]): boolean {
  return issues.some((issue) => issue.level === 'ERROR');
}

function uniqueIssues(issues: ValidationIssue[]): ValidationIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.level}:${issue.code}:${issue.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function requireNonNegative(value: number, code: string, message: string): ValidationIssue[] {
  if (!isFiniteNonNegative(value)) return [error(code, message)];
  return [];
}

/**
 * required IDs = ceil(required votes ÷ supporter turnout rate)
 */
export function idsRequiredForVoteGoal(
  requiredVotes: number,
  supporterTurnoutRate: number,
): Calculation<number> {
  const issues: ValidationIssue[] = [
    ...requireNonNegative(requiredVotes, 'INVALID_VOTE_GOAL', 'Required votes must be non-negative.'),
    ...validateProbability(supporterTurnoutRate, 'Supporter turnout rate'),
  ];
  if (supporterTurnoutRate === 0) {
    issues.push(error('ZERO_SUPPORTER_TURNOUT', 'Supporter turnout rate must be greater than zero.'));
  }
  if (hasError(issues)) return { value: null, issues };
  const quotient = safeDivide(requiredVotes, supporterTurnoutRate);
  if (quotient === null) {
    return {
      value: null,
      issues: [...issues, error('ZERO_SUPPORTER_TURNOUT', 'Supporter turnout rate must be greater than zero.')],
    };
  }
  return { value: Math.ceil(quotient), issues };
}

/**
 * required contacts = ceil(required IDs ÷ ID conversion rate)
 */
export function contactsRequiredForIdGoal(
  requiredIds: number,
  idConversionRate: number,
): Calculation<number> {
  const issues: ValidationIssue[] = [
    ...requireNonNegative(requiredIds, 'INVALID_ID_GOAL', 'Required IDs must be non-negative.'),
    ...validateProbability(idConversionRate, 'ID conversion rate'),
  ];
  if (idConversionRate === 0) {
    issues.push(error('ZERO_ID_CONVERSION_RATE', 'ID conversion rate must be greater than zero to calculate required contacts.'));
  }
  if (hasError(issues)) return { value: null, issues };
  const quotient = safeDivide(requiredIds, idConversionRate);
  if (quotient === null) {
    return {
      value: null,
      issues: [...issues, error('ZERO_ID_CONVERSION_RATE', 'ID conversion rate must be greater than zero to calculate required contacts.')],
    };
  }
  return { value: Math.ceil(quotient), issues };
}

/**
 * required shifts = ceil(required attempts ÷ attempts per shift)
 */
export function shiftsRequiredForAttempts(
  requiredAttempts: number,
  attemptsPerCompletedShift: number,
): Calculation<number> {
  const issues: ValidationIssue[] = [
    ...requireNonNegative(requiredAttempts, 'INVALID_CAPACITY_INPUT', 'Required attempts must be non-negative.'),
  ];
  if (!Number.isFinite(attemptsPerCompletedShift) || attemptsPerCompletedShift < 0) {
    issues.push(error('INVALID_CAPACITY_INPUT', 'Attempts per completed shift must be non-negative.'));
  }
  if (attemptsPerCompletedShift === 0 && requiredAttempts > 0) {
    issues.push(error('ZERO_PRODUCTIVITY', 'Attempts per completed shift must be greater than zero when attempts are required.'));
  }
  if (hasError(issues)) return { value: null, issues };
  if (requiredAttempts === 0) return { value: 0, issues };
  const quotient = safeDivide(requiredAttempts, attemptsPerCompletedShift);
  if (quotient === null) {
    return {
      value: null,
      issues: [...issues, error('ZERO_PRODUCTIVITY', 'Attempts per completed shift must be greater than zero when attempts are required.')],
    };
  }
  return { value: Math.ceil(quotient), issues };
}

/**
 * Inverse of the forward outreach chain. Reuses attemptsRequiredForContactGoal
 * for required attempts = ceil(required contacts ÷ contact rate).
 */
export function calculateRequiredProgram(input: RequiredProgramInput): Calculation<RequiredProgram> {
  const issues: ValidationIssue[] = [];
  const ids = idsRequiredForVoteGoal(input.requiredVotes, input.supporterTurnoutRate);
  issues.push(...ids.issues);

  const contacts = ids.value == null
    ? { value: null as number | null, issues: [] as ValidationIssue[] }
    : contactsRequiredForIdGoal(ids.value, input.idConversionRate);
  issues.push(...contacts.issues);

  const attempts = contacts.value == null
    ? { value: null as number | null, issues: [] as ValidationIssue[] }
    : attemptsRequiredForContactGoal(contacts.value, input.perAttemptContactRate);
  issues.push(...attempts.issues);

  let requiredShifts: number | null = null;
  if (input.attemptsPerCompletedShift !== undefined && attempts.value != null) {
    const shifts = shiftsRequiredForAttempts(attempts.value, input.attemptsPerCompletedShift);
    issues.push(...shifts.issues);
    requiredShifts = shifts.value;
  }

  return {
    value: {
      requiredIds: ids.value,
      requiredContacts: contacts.value,
      requiredAttempts: attempts.value,
      requiredShifts,
    },
    issues,
  };
}

function inputRateIssues(rate: number, field: string, zeroCode: string, zeroMessage: string): ValidationIssue[] {
  const issues = validateProbability(rate, field);
  if (rate === 0) issues.push(error(zeroCode, zeroMessage));
  return issues;
}

function breakEvenDivide(
  numerator: number,
  denominator: number,
  priorIssues: ValidationIssue[],
): Calculation<number> {
  if (hasError(priorIssues)) return { value: null, issues: priorIssues };
  const quotient = safeDivide(numerator, denominator);
  if (quotient === null) {
    return {
      value: null,
      issues: [...priorIssues, error('ZERO_DENOMINATOR', 'Cannot divide by zero.')],
    };
  }
  return { value: quotient, issues: priorIssues };
}

/**
 * Given a fixed produced program, the contact rate, ID conversion rate, or
 * attempts per shift that would produce exactly votesNeeded. One division each
 * over values the manager already entered. Outputs are not clamped; a result
 * above 1 is arithmetic, not a recommended action.
 */
export function calculateBreakEvenRates(input: BreakEvenInput): Calculation<BreakEvenRates> {
  const voteIssues = requireNonNegative(input.votesNeeded, 'INVALID_VOTE_GOAL', 'Votes needed must be non-negative.');
  const turnoutIssues = inputRateIssues(
    input.supporterTurnoutRate,
    'Supporter turnout rate',
    'ZERO_SUPPORTER_TURNOUT',
    'Supporter turnout rate must be greater than zero.',
  );
  const conversionIssues = inputRateIssues(
    input.idConversionRate,
    'ID conversion rate',
    'ZERO_ID_CONVERSION_RATE',
    'ID conversion rate must be greater than zero.',
  );
  const contactRateIssues = inputRateIssues(
    input.perAttemptContactRate,
    'Per-attempt contact rate',
    'ZERO_CONTACT_RATE',
    'A positive contact rate is required.',
  );
  const attemptsIssues = requireNonNegative(input.attempts, 'INVALID_CAPACITY_INPUT', 'Attempts must be non-negative.');
  if (input.attempts === 0) {
    attemptsIssues.push(error('ZERO_DENOMINATOR', 'Attempts must be greater than zero to calculate a break-even contact rate.'));
  }
  const contactsIssues = requireNonNegative(input.contacts, 'INVALID_CONTACT_GOAL', 'Contacts must be non-negative.');
  if (input.contacts === 0) {
    contactsIssues.push(error('ZERO_DENOMINATOR', 'Contacts must be greater than zero to calculate a break-even ID conversion rate.'));
  }
  const shiftsIssues: ValidationIssue[] = [];
  if (input.shifts !== undefined) {
    shiftsIssues.push(...requireNonNegative(input.shifts, 'INVALID_CAPACITY_INPUT', 'Shifts must be non-negative.'));
    if (input.shifts === 0) {
      shiftsIssues.push(error('ZERO_DENOMINATOR', 'Shifts must be greater than zero to calculate break-even attempts per shift.'));
    }
  }

  const contactRate = breakEvenDivide(
    input.votesNeeded,
    input.attempts * input.idConversionRate * input.supporterTurnoutRate,
    [...voteIssues, ...attemptsIssues, ...conversionIssues, ...turnoutIssues],
  );
  const idConversionRate = breakEvenDivide(
    input.votesNeeded,
    input.contacts * input.supporterTurnoutRate,
    [...voteIssues, ...contactsIssues, ...turnoutIssues],
  );
  const attemptsPerShift = input.shifts === undefined
    ? { value: null as number | null, issues: [] as ValidationIssue[] }
    : breakEvenDivide(
      input.votesNeeded,
      input.shifts * input.perAttemptContactRate * input.idConversionRate * input.supporterTurnoutRate,
      [...voteIssues, ...shiftsIssues, ...contactRateIssues, ...conversionIssues, ...turnoutIssues],
    );

  const issues = uniqueIssues([
    ...contactRate.issues,
    ...idConversionRate.issues,
    ...attemptsPerShift.issues,
  ]);

  return {
    value: {
      contactRate: contactRate.value,
      attemptsPerShift: attemptsPerShift.value,
      idConversionRate: idConversionRate.value,
    },
    issues,
  };
}
