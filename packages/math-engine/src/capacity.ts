import { Calculation, ValidationIssue } from './types';
import { isFiniteNonNegative } from './validation';

export interface CapacityInput {
  attemptsGoal: number;
  attemptsPerCompletedShift: number;
  workers: number;
  completedShiftsPerWorker: number;
  volunteerFlakeRate?: number;
}

export interface CapacityResult {
  completedShiftsRequired: number;
  attemptCapacity: number;
  capacityGap: number;
  attemptShortfall: number;
  additionalCompletedShiftsRequired: number;
  scheduledShiftsRequired?: number;
  additionalScheduledShiftsRequired?: number;
}

export function calculateCapacity(input: CapacityInput): Calculation<CapacityResult> {
  const issues: ValidationIssue[] = [];
  for (const [name, value] of Object.entries({ attemptsGoal: input.attemptsGoal, attemptsPerCompletedShift: input.attemptsPerCompletedShift, workers: input.workers, completedShiftsPerWorker: input.completedShiftsPerWorker })) {
    if (!isFiniteNonNegative(value)) issues.push({ level: 'ERROR', code: 'INVALID_CAPACITY_INPUT', message: `${name} must be non-negative.` });
  }
  if (input.attemptsPerCompletedShift === 0 && input.attemptsGoal > 0) {
    issues.push({ level: 'ERROR', code: 'ZERO_PRODUCTIVITY', message: 'Attempts per completed shift must be greater than zero when attempts are required.' });
  }
  if (input.volunteerFlakeRate !== undefined && (input.volunteerFlakeRate < 0 || input.volunteerFlakeRate >= 1)) {
    issues.push({ level: 'ERROR', code: 'INVALID_FLAKE_RATE', message: 'Volunteer flake rate must be at least 0 and less than 1.' });
  }
  if (issues.some((i) => i.level === 'ERROR')) return { value: null, issues };

  const completedShiftsRequired = input.attemptsGoal === 0 ? 0 : Math.ceil(input.attemptsGoal / input.attemptsPerCompletedShift);
  const attemptCapacity = input.workers * input.completedShiftsPerWorker * input.attemptsPerCompletedShift;
  const capacityGap = attemptCapacity - input.attemptsGoal;
  const attemptShortfall = Math.max(0, input.attemptsGoal - attemptCapacity);
  const additionalCompletedShiftsRequired = attemptShortfall === 0 ? 0 : Math.ceil(attemptShortfall / input.attemptsPerCompletedShift);
  const result: CapacityResult = { completedShiftsRequired, attemptCapacity, capacityGap, attemptShortfall, additionalCompletedShiftsRequired };
  if (input.volunteerFlakeRate !== undefined) {
    result.scheduledShiftsRequired = Math.ceil(completedShiftsRequired / (1 - input.volunteerFlakeRate));
    result.additionalScheduledShiftsRequired = Math.ceil(additionalCompletedShiftsRequired / (1 - input.volunteerFlakeRate));
  }
  return { value: result, issues };
}
