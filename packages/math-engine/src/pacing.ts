import { Calculation, ValidationIssue } from './types';

export interface PaceInput {
  adoptedGoal: number;
  completedActual: number;
  remainingActiveDays: number;
  observedRecentDailyPace?: number;
}

export interface PaceResult {
  remainingGoal: number;
  requiredDailyPace: number | null;
  projectedFinal: number | null;
  projectedGap: number | null;
  projectedShortfall: number | null;
}

export function calculatePace(input: PaceInput): Calculation<PaceResult> {
  const issues: ValidationIssue[] = [];
  if (input.remainingActiveDays < 0) issues.push({ level: 'ERROR', code: 'INVALID_REMAINING_DAYS', message: 'Remaining active days cannot be negative.' });
  if (issues.length) return { value: null, issues };

  const remainingGoal = Math.max(0, input.adoptedGoal - input.completedActual);
  const requiredDailyPace = input.remainingActiveDays === 0 ? (remainingGoal === 0 ? 0 : null) : remainingGoal / input.remainingActiveDays;
  const projectedFinal = input.observedRecentDailyPace === undefined ? null : input.completedActual + input.observedRecentDailyPace * input.remainingActiveDays;
  return {
    value: {
      remainingGoal,
      requiredDailyPace,
      projectedFinal,
      projectedGap: projectedFinal === null ? null : projectedFinal - input.adoptedGoal,
      projectedShortfall: projectedFinal === null ? null : Math.max(0, input.adoptedGoal - projectedFinal)
    },
    issues
  };
}
