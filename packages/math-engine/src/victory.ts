import { Calculation, ValidationIssue } from './types';
import { validateProbability } from './validation';

export interface CampaignVoteGoalInput {
  adoptedExpectedElectorate: number;
  adoptedTargetShare?: number;
  explicitVoteGoalOverride?: number;
  mathematicalThreshold?: number | null;
}

export function calculateCampaignVoteGoal(input: CampaignVoteGoalInput): Calculation<number> {
  const issues: ValidationIssue[] = [];
  let goal: number;

  if (input.explicitVoteGoalOverride !== undefined) {
    if (!Number.isFinite(input.explicitVoteGoalOverride) || input.explicitVoteGoalOverride < 0) {
      return { value: null, issues: [{ level: 'ERROR', code: 'INVALID_VOTE_GOAL_OVERRIDE', message: 'Vote-goal override must be non-negative.' }] };
    }
    goal = Math.ceil(input.explicitVoteGoalOverride);
  } else {
    if (input.adoptedTargetShare === undefined) {
      return { value: null, issues: [{ level: 'ERROR', code: 'MISSING_TARGET_SHARE', message: 'Target share or explicit vote-goal override is required.' }] };
    }
    issues.push(...validateProbability(input.adoptedTargetShare, 'Adopted target share'));
    if (issues.some((i) => i.level === 'ERROR')) return { value: null, issues };
    goal = Math.ceil(input.adoptedExpectedElectorate * input.adoptedTargetShare);
  }

  if (input.mathematicalThreshold != null && goal < input.mathematicalThreshold) {
    issues.push({ level: 'WARNING', code: 'GOAL_BELOW_THRESHOLD', message: 'Campaign vote goal is below the mathematical threshold and requires explicit manager acknowledgement before adoption.' });
  }
  return { value: goal, issues };
}
