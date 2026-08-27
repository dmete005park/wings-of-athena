import { Calculation, ValidationIssue } from './types';
import { validateProbability } from './validation';

export interface SupportIdObjectiveInput {
  campaignVoteGoal: number;
  idCoverageTarget: number;
  supporterTurnoutRate: number;
  attempts?: number;
  perAttemptContactRate?: number;
  idCompletionRate?: number;
  supportRate?: number;
}

export interface SupportIdObjectiveResult {
  supportIdVoteTarget: number;
  requiredSupportIds: number;
  expectedSupportIds?: number;
  expectedSupportVotesFromIds?: number;
}

export function calculateSupportIdObjective(input: SupportIdObjectiveInput): Calculation<SupportIdObjectiveResult> {
  const issues: ValidationIssue[] = [
    ...validateProbability(input.idCoverageTarget, 'ID coverage target'),
    ...validateProbability(input.supporterTurnoutRate, 'Supporter turnout rate')
  ];
  if (input.supporterTurnoutRate === 0) {
    issues.push({ level: 'ERROR', code: 'ZERO_SUPPORTER_TURNOUT', message: 'Supporter turnout rate must be greater than zero.' });
  }
  if (issues.some((i) => i.level === 'ERROR')) return { value: null, issues };

  const supportIdVoteTarget = input.campaignVoteGoal * input.idCoverageTarget;
  const requiredSupportIds = Math.ceil(supportIdVoteTarget / input.supporterTurnoutRate);
  const result: SupportIdObjectiveResult = { supportIdVoteTarget, requiredSupportIds };

  const funnelValues = [input.attempts, input.perAttemptContactRate, input.idCompletionRate, input.supportRate];
  if (funnelValues.every((v) => v !== undefined)) {
    issues.push(...validateProbability(input.perAttemptContactRate!, 'Per-attempt contact rate'));
    issues.push(...validateProbability(input.idCompletionRate!, 'ID completion rate'));
    issues.push(...validateProbability(input.supportRate!, 'Support rate'));
    if (!issues.some((i) => i.level === 'ERROR')) {
      const contacts = input.attempts! * input.perAttemptContactRate!;
      const identified = contacts * input.idCompletionRate!;
      result.expectedSupportIds = identified * input.supportRate!;
      result.expectedSupportVotesFromIds = result.expectedSupportIds * input.supporterTurnoutRate;
    }
  }
  return { value: result, issues };
}
