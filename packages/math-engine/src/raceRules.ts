import { Calculation, RaceRule, ValidationIssue } from './types';
import { validateProbability } from './validation';

export function calculateRaceThreshold(expectedElectorate: number, rule: RaceRule): Calculation<number> {
  const issues: ValidationIssue[] = [];
  if (!Number.isFinite(expectedElectorate) || expectedElectorate < 0) {
    return { value: null, issues: [{ level: 'ERROR', code: 'INVALID_EXPECTED_ELECTORATE', message: 'Expected electorate must be non-negative.' }] };
  }

  switch (rule.type) {
    case 'MAJORITY': {
      issues.push(...validateProbability(rule.requiredShare, 'Required majority share'));
      if (issues.length) return { value: null, issues };
      const base = expectedElectorate * rule.requiredShare;
      return { value: rule.strictlyGreater === false ? Math.ceil(base) : Math.floor(base) + 1, issues };
    }
    case 'PLURALITY':
      issues.push(...validateProbability(rule.expectedWinningShare, 'Expected winning share'));
      return issues.length ? { value: null, issues } : { value: Math.ceil(expectedElectorate * rule.expectedWinningShare), issues };
    case 'RUNOFF':
      issues.push(...validateProbability(rule.advancementTargetShare, 'Advancement target share'));
      return issues.length ? { value: null, issues } : { value: Math.ceil(expectedElectorate * rule.advancementTargetShare), issues };
    case 'OTHER':
      issues.push(...validateProbability(rule.targetShare, rule.label));
      return issues.length ? { value: null, issues } : { value: Math.ceil(expectedElectorate * rule.targetShare), issues };
  }
}
