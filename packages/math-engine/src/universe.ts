import { Calculation, UniverseMethod } from './types';
import { isFiniteNonNegative } from './validation';

export function constructStrategicUniverse(voteGoal: number, method: UniverseMethod): Calculation<number> {
  if (!isFiniteNonNegative(voteGoal)) return { value: null, issues: [{ level: 'ERROR', code: 'INVALID_VOTE_GOAL', message: 'Vote goal must be non-negative.' }] };

  let value: number;
  switch (method.type) {
    case 'MANAGER_SET':
    case 'IMPORTED':
    case 'MODEL_FILTER':
      value = method.count;
      break;
    case 'VOTE_GOAL_MULTIPLIER':
      if (!Number.isFinite(method.multiplier) || method.multiplier < 0) {
        return { value: null, issues: [{ level: 'ERROR', code: 'INVALID_UNIVERSE_MULTIPLIER', message: 'Universe multiplier must be non-negative.' }] };
      }
      value = voteGoal * method.multiplier;
      break;
  }
  if (!isFiniteNonNegative(value)) return { value: null, issues: [{ level: 'ERROR', code: 'INVALID_STRATEGIC_UNIVERSE', message: 'Strategic universe must be non-negative.' }] };
  return { value: Math.ceil(value), issues: [] };
}

export function universeAvailabilityGap(availableTargetableVoters: number, strategicDesiredUniverse: number): number {
  return availableTargetableVoters - strategicDesiredUniverse;
}

export function channelReachabilityGap(reachableUniverse: number, uniqueReachTarget: number): number {
  return reachableUniverse - uniqueReachTarget;
}

export function capacitySupportedUniverse(attemptCapacity: number, contactDepthTarget: number): Calculation<number> {
  if (!Number.isFinite(contactDepthTarget) || contactDepthTarget <= 0) return { value: null, issues: [{ level: 'ERROR', code: 'INVALID_CONTACT_DEPTH', message: 'Contact depth must be greater than zero for capacity-supported universe.' }] };
  if (!isFiniteNonNegative(attemptCapacity)) return { value: null, issues: [{ level: 'ERROR', code: 'INVALID_ATTEMPT_CAPACITY', message: 'Attempt capacity must be non-negative.' }] };
  return { value: Math.floor(attemptCapacity / contactDepthTarget), issues: [] };
}

export function aggregateCrossChannelUniqueReach(input: { deduplicatedTotal?: number }): Calculation<number> {
  if (input.deduplicatedTotal === undefined) return { value: null, issues: [{ level: 'WARNING', code: 'CROSS_CHANNEL_REACH_UNAVAILABLE', message: 'Cross-channel unique reach requires deduplicated identities or an explicit overlap method.' }] };
  return { value: input.deduplicatedTotal, issues: [] };
}
