import { Calculation, ValidationIssue } from './types';
import { isFiniteNonNegative, safeDivide, validateProbability } from './validation';

export const VOTE_COMPOSITION_FORMULA = {
  COMPOSITION: 'victory.vote_composition.v0.3',
  MODELED_BASE: 'victory.modeled_base_votes.v0.3',
  PERSUASION_REQUIREMENT: 'victory.persuasion_requirement.v0.3',
} as const;

export const VOTE_COMPOSITION_METRIC = {
  MODELED_BASE_VOTES: 'victory.modeled_base_votes',
  ADOPTED_BASE_VOTES: 'victory.adopted_base_votes',
  PERSUASION_VOTES_REQUIRED: 'victory.persuasion_votes_required',
  BASE_VOTE_SHARE: 'victory.base_vote_share',
  PERSUASION_VOTE_SHARE: 'victory.persuasion_vote_share',
  REQUIRED_PERSUASION_SUPPORTERS: 'victory.required_persuasion_supporters',
  REQUIRED_SUPPORTER_YIELD: 'victory.required_supporter_yield',
} as const;

export const VOTE_COMPOSITION_ASSUMPTION = {
  BASE_SUPPORT: 'victory.base_support_probability',
  BASE_TURNOUT: 'victory.base_turnout_probability',
  PERSUASION_SUPPORTER_TURNOUT: 'victory.persuasion_supporter_turnout_rate',
} as const;

export interface BaseSegment {
  baseVoters: number | null;
  supportProbability: number | null;
  turnoutProbability: number | null;
}

export interface VoteCompositionInput {
  voteGoal: number | null;
  adoptedBaseVotes: number | null;
  persuasionUniverseSize: number | null;
  persuasionSupporterTurnoutRate: number | null;
  baseSegments: BaseSegment[];
}

export interface VoteCompositionResult {
  modeledBaseVotes: number | null;
  expectedBaseVotes: Array<number | null>;
  adoptedBaseVotes: number | null;
  persuasionVotesRequired: number | null;
  baseVoteShare: number | null;
  persuasionVoteShare: number | null;
  requiredPersuasionSupporters: number | null;
  requiredSupporterYield: number | null;
}

function error(code: string, message: string): ValidationIssue {
  return { level: 'ERROR', code, message };
}

function warning(code: string, message: string): ValidationIssue {
  return { level: 'WARNING', code, message };
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

function isPresentNumber(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

/**
 * persuasionVotesRequired = max(0, voteGoal − adoptedBaseVotes)
 */
export function persuasionVotesRequired(
  voteGoal: number | null,
  adoptedBaseVotes: number | null,
): Calculation<number> {
  if (!isPresentNumber(voteGoal) || !isPresentNumber(adoptedBaseVotes)) {
    return { value: null, issues: [] };
  }
  const issues: ValidationIssue[] = [];
  if (voteGoal < 0) {
    return { value: null, issues: [error('INVALID_VOTE_GOAL', 'Vote goal must be non-negative.')] };
  }
  if (adoptedBaseVotes < 0) {
    return { value: null, issues: [error('INVALID_BASE_VOTES', 'Adopted base votes must be non-negative.')] };
  }
  if (adoptedBaseVotes > voteGoal) {
    issues.push(warning(
      'ADOPTED_BASE_EXCEEDS_GOAL',
      'Adopted base votes exceed the campaign vote goal. Persuasion votes required is zero.',
    ));
  }
  return { value: Math.max(0, voteGoal - adoptedBaseVotes), issues };
}

/**
 * baseVoteShare = adoptedBaseVotes / voteGoal
 */
export function baseVoteShare(
  adoptedBaseVotes: number | null,
  voteGoal: number | null,
): Calculation<number> {
  if (!isPresentNumber(adoptedBaseVotes) || !isPresentNumber(voteGoal)) {
    return { value: null, issues: [] };
  }
  if (adoptedBaseVotes < 0) {
    return { value: null, issues: [error('INVALID_BASE_VOTES', 'Adopted base votes must be non-negative.')] };
  }
  if (voteGoal < 0) {
    return { value: null, issues: [error('INVALID_VOTE_GOAL', 'Vote goal must be non-negative.')] };
  }
  const share = safeDivide(adoptedBaseVotes, voteGoal);
  if (share === null) {
    return {
      value: null,
      issues: [error('DIVISION_BY_ZERO', 'Vote goal must be greater than zero to compute base vote share.')],
    };
  }
  return { value: share, issues: [] };
}

/**
 * persuasionVoteShare = persuasionVotesRequired / voteGoal
 */
export function persuasionVoteShare(
  persuasionNeed: number | null,
  voteGoal: number | null,
): Calculation<number> {
  if (!isPresentNumber(persuasionNeed) || !isPresentNumber(voteGoal)) {
    return { value: null, issues: [] };
  }
  if (persuasionNeed < 0) {
    return { value: null, issues: [error('INVALID_PERSUASION_VOTES', 'Persuasion votes required must be non-negative.')] };
  }
  if (voteGoal < 0) {
    return { value: null, issues: [error('INVALID_VOTE_GOAL', 'Vote goal must be non-negative.')] };
  }
  const share = safeDivide(persuasionNeed, voteGoal);
  if (share === null) {
    return {
      value: null,
      issues: [error('DIVISION_BY_ZERO', 'Vote goal must be greater than zero to compute persuasion vote share.')],
    };
  }
  return { value: share, issues: [] };
}

/**
 * expectedBaseVotes[i] = baseVoters[i] × supportProbability[i] × turnoutProbability[i]
 */
export function expectedBaseVotesForSegment(segment: BaseSegment): Calculation<number> {
  const baseVoters = segment.baseVoters;
  const supportProbability = segment.supportProbability;
  const turnoutProbability = segment.turnoutProbability;
  if (!isPresentNumber(baseVoters) || !isPresentNumber(supportProbability) || !isPresentNumber(turnoutProbability)) {
    return { value: null, issues: [] };
  }
  const issues: ValidationIssue[] = [];
  if (!isFiniteNonNegative(baseVoters)) {
    issues.push(error('INVALID_BASE_VOTERS', 'Base voters must be non-negative.'));
  }
  issues.push(...validateProbability(supportProbability, 'Support probability'));
  issues.push(...validateProbability(turnoutProbability, 'Turnout probability'));
  if (issues.some((issue) => issue.level === 'ERROR')) return { value: null, issues };
  return { value: baseVoters * supportProbability * turnoutProbability, issues };
}

/**
 * modeledBaseVotes = Σ expectedBaseVotes[i]
 */
export function computeModeledBaseVotes(segments: BaseSegment[]): Calculation<{
  modeledBaseVotes: number | null;
  expectedBaseVotes: Array<number | null>;
}> {
  const issues: ValidationIssue[] = [];
  const expectedBaseVotes: Array<number | null> = [];
  let sum = 0;
  let complete = 0;
  let incomplete = 0;

  for (const segment of segments) {
    const expected = expectedBaseVotesForSegment(segment);
    issues.push(...expected.issues);
    expectedBaseVotes.push(expected.value);
    if (expected.value != null) {
      sum += expected.value;
      complete += 1;
    } else if (
      isPresentNumber(segment.baseVoters)
      || isPresentNumber(segment.supportProbability)
      || isPresentNumber(segment.turnoutProbability)
    ) {
      incomplete += 1;
    } else {
      incomplete += 1;
    }
  }

  if (segments.length > 0 && complete === 0) {
    issues.push(warning(
      'INCOMPLETE_INPUT',
      'No complete base segments; modeled base votes are unavailable.',
    ));
  } else if (incomplete > 0 && complete > 0) {
    issues.push(warning(
      'INCOMPLETE_INPUT',
      'Some base segments are incomplete and were omitted from modeled base votes.',
    ));
  }

  return {
    value: {
      modeledBaseVotes: complete > 0 ? sum : null,
      expectedBaseVotes,
    },
    issues: uniqueIssues(issues),
  };
}

/**
 * requiredPersuasionSupporters = ceil(persuasionVotesRequired ÷ persuasionSupporterTurnoutRate)
 */
export function requiredPersuasionSupporters(
  persuasionNeed: number | null,
  persuasionSupporterTurnoutRate: number | null,
): Calculation<number> {
  if (!isPresentNumber(persuasionNeed) || !isPresentNumber(persuasionSupporterTurnoutRate)) {
    return { value: null, issues: [] };
  }
  const issues: ValidationIssue[] = [];
  if (persuasionNeed < 0) {
    issues.push(error('INVALID_PERSUASION_VOTES', 'Persuasion votes required must be non-negative.'));
  }
  issues.push(...validateProbability(persuasionSupporterTurnoutRate, 'Persuasion supporter turnout rate'));
  if (persuasionSupporterTurnoutRate === 0) {
    issues.push(error(
      'ZERO_PERSUASION_TURNOUT',
      'Persuasion supporter turnout rate must be greater than zero.',
    ));
  }
  if (issues.some((issue) => issue.level === 'ERROR')) return { value: null, issues };
  const quotient = safeDivide(persuasionNeed, persuasionSupporterTurnoutRate);
  if (quotient === null) {
    return {
      value: null,
      issues: [...issues, error('ZERO_PERSUASION_TURNOUT', 'Persuasion supporter turnout rate must be greater than zero.')],
    };
  }
  return { value: Math.ceil(quotient), issues };
}

/**
 * requiredSupporterYield = requiredPersuasionSupporters ÷ persuasionUniverseSize
 *
 * Arithmetic the plan requires, never a prediction of contact yield.
 */
export function requiredSupporterYield(
  supportersRequired: number | null,
  persuasionUniverseSize: number | null,
): Calculation<number> {
  if (!isPresentNumber(supportersRequired) || !isPresentNumber(persuasionUniverseSize)) {
    return { value: null, issues: [] };
  }
  if (supportersRequired < 0) {
    return { value: null, issues: [error('INVALID_PERSUASION_SUPPORTERS', 'Required persuasion supporters must be non-negative.')] };
  }
  if (persuasionUniverseSize < 0) {
    return { value: null, issues: [error('INVALID_PERSUASION_UNIVERSE', 'Persuasion universe size must be non-negative.')] };
  }
  const yieldRequired = safeDivide(supportersRequired, persuasionUniverseSize);
  if (yieldRequired === null) {
    return {
      value: null,
      issues: [error('DIVISION_BY_ZERO', 'Persuasion universe size must be greater than zero to compute required supporter yield.')],
    };
  }
  return { value: yieldRequired, issues: [] };
}

export function computeVoteComposition(input: VoteCompositionInput): Calculation<VoteCompositionResult> {
  const issues: ValidationIssue[] = [];
  const modeled = computeModeledBaseVotes(input.baseSegments ?? []);
  issues.push(...modeled.issues);

  const residual = persuasionVotesRequired(input.voteGoal, input.adoptedBaseVotes);
  issues.push(...residual.issues);

  const baseShare = baseVoteShare(input.adoptedBaseVotes, input.voteGoal);
  issues.push(...baseShare.issues);

  const persuasionShare = persuasionVoteShare(residual.value, input.voteGoal);
  issues.push(...persuasionShare.issues);

  const supporters = requiredPersuasionSupporters(residual.value, input.persuasionSupporterTurnoutRate);
  issues.push(...supporters.issues);

  const yieldRequired = requiredSupporterYield(supporters.value, input.persuasionUniverseSize);
  issues.push(...yieldRequired.issues);

  return {
    value: {
      modeledBaseVotes: modeled.value?.modeledBaseVotes ?? null,
      expectedBaseVotes: modeled.value?.expectedBaseVotes ?? [],
      adoptedBaseVotes: isPresentNumber(input.adoptedBaseVotes) && input.adoptedBaseVotes >= 0
        ? input.adoptedBaseVotes
        : null,
      persuasionVotesRequired: residual.value,
      baseVoteShare: baseShare.value,
      persuasionVoteShare: persuasionShare.value,
      requiredPersuasionSupporters: supporters.value,
      requiredSupporterYield: yieldRequired.value,
    },
    issues: uniqueIssues(issues),
  };
}
