import { ValidationIssue } from './types';

export function isFiniteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

export function validateProbability(value: number, field: string): ValidationIssue[] {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    return [{ level: 'ERROR', code: 'INVALID_PROBABILITY', message: `${field} must be between 0 and 1.` }];
  }
  return [];
}

export function safeDivide(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  return numerator / denominator;
}
