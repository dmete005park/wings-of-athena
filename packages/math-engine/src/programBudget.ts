import { Calculation, ValidationIssue } from './types';
import { calculateCapacity } from './capacity';
import { isFiniteNonNegative } from './validation';

export interface ChannelCapacityPlan {
  channelId: string;
  resourcePoolId: string;
  uniqueReachTarget: number;
  reachableUniverse: number;
  contactDepthTarget: number;
  attemptsPerCompletedShift: number;
  allocatedCompletedShifts: number;
  volunteerFlakeRate?: number;
  costPerCompletedShift?: number;
}

export interface ResourcePoolPlan {
  resourcePoolId: string;
  workers: number;
  completedShiftsPerWorker: number;
}

export interface ChannelFeasibilityResult {
  channelId: string;
  resourcePoolId: string;
  reachabilityGap: number;
  reachableTarget: number;
  attemptsGoal: number;
  allocatedAttemptCapacity: number;
  capacitySupportedUniverse: number;
  capacityGap: number;
  additionalAttemptsRequired: number;
  additionalCompletedShiftsRequired: number;
  additionalScheduledShiftsRequired?: number;
  additionalWorkersRequired: number;
  additionalCompletedShiftsPerActiveDay?: number;
  additionalScheduledShiftsPerActiveDay?: number;
  incrementalCost?: number;
}

export interface ResourcePoolFeasibilityResult {
  resourcePoolId: string;
  availableCompletedShifts: number;
  allocatedCompletedShifts: number;
  remainingCompletedShifts: number;
  overAllocatedCompletedShifts: number;
}

export interface ProgramBudgetFeasibilityResult {
  channels: ChannelFeasibilityResult[];
  resourcePools: ResourcePoolFeasibilityResult[];
}

export interface ProgramBudgetFeasibilityInput {
  channels: ChannelCapacityPlan[];
  resourcePools: ResourcePoolPlan[];
  remainingActiveDays?: number;
}

export function calculateProgramBudgetFeasibility(
  input: ProgramBudgetFeasibilityInput,
): Calculation<ProgramBudgetFeasibilityResult> {
  const issues: ValidationIssue[] = [];
  const poolById = new Map(input.resourcePools.map((pool) => [pool.resourcePoolId, pool]));

  if (input.remainingActiveDays !== undefined && (!Number.isFinite(input.remainingActiveDays) || input.remainingActiveDays <= 0)) {
    issues.push({ level: 'ERROR', code: 'INVALID_REMAINING_ACTIVE_DAYS', message: 'Remaining active days must be greater than zero when supplied.' });
  }

  const poolAllocationTotals = new Map<string, number>();
  for (const channel of input.channels) {
    const numericValues = {
      uniqueReachTarget: channel.uniqueReachTarget,
      reachableUniverse: channel.reachableUniverse,
      contactDepthTarget: channel.contactDepthTarget,
      attemptsPerCompletedShift: channel.attemptsPerCompletedShift,
      allocatedCompletedShifts: channel.allocatedCompletedShifts,
    };
    for (const [name, value] of Object.entries(numericValues)) {
      if (!isFiniteNonNegative(value)) {
        issues.push({ level: 'ERROR', code: 'INVALID_PROGRAM_CAPACITY_INPUT', message: `${channel.channelId}.${name} must be non-negative.` });
      }
    }
    if (channel.uniqueReachTarget > 0 && channel.contactDepthTarget < 1) {
      issues.push({ level: 'ERROR', code: 'CONTACT_DEPTH_BELOW_ONE', message: `${channel.channelId} requires contact depth of at least one.` });
    }
    if (channel.costPerCompletedShift !== undefined && !isFiniteNonNegative(channel.costPerCompletedShift)) {
      issues.push({ level: 'ERROR', code: 'INVALID_SHIFT_COST', message: `${channel.channelId} cost per completed shift must be non-negative.` });
    }
    if (!poolById.has(channel.resourcePoolId)) {
      issues.push({ level: 'ERROR', code: 'UNKNOWN_RESOURCE_POOL', message: `${channel.channelId} references an unknown resource pool.` });
    }
    poolAllocationTotals.set(
      channel.resourcePoolId,
      (poolAllocationTotals.get(channel.resourcePoolId) ?? 0) + channel.allocatedCompletedShifts,
    );
  }

  for (const pool of input.resourcePools) {
    if (!isFiniteNonNegative(pool.workers) || !isFiniteNonNegative(pool.completedShiftsPerWorker)) {
      issues.push({ level: 'ERROR', code: 'INVALID_RESOURCE_POOL', message: `${pool.resourcePoolId} resource-pool inputs must be non-negative.` });
    }
  }

  if (issues.some((issue) => issue.level === 'ERROR')) return { value: null, issues };

  const resourcePools: ResourcePoolFeasibilityResult[] = input.resourcePools.map((pool) => {
    const availableCompletedShifts = pool.workers * pool.completedShiftsPerWorker;
    const allocatedCompletedShifts = poolAllocationTotals.get(pool.resourcePoolId) ?? 0;
    return {
      resourcePoolId: pool.resourcePoolId,
      availableCompletedShifts,
      allocatedCompletedShifts,
      remainingCompletedShifts: Math.max(0, availableCompletedShifts - allocatedCompletedShifts),
      overAllocatedCompletedShifts: Math.max(0, allocatedCompletedShifts - availableCompletedShifts),
    };
  });

  for (const pool of resourcePools) {
    if (pool.overAllocatedCompletedShifts > 0) {
      issues.push({
        level: 'WARNING',
        code: 'RESOURCE_POOL_OVERALLOCATED',
        message: `${pool.resourcePoolId} is over-allocated by ${pool.overAllocatedCompletedShifts} completed shifts.`,
      });
    }
  }

  const channels: ChannelFeasibilityResult[] = input.channels.map((channel) => {
    const pool = poolById.get(channel.resourcePoolId)!;
    const reachableTarget = Math.min(channel.uniqueReachTarget, channel.reachableUniverse);
    const reachabilityGap = Math.max(0, channel.uniqueReachTarget - channel.reachableUniverse);
    const attemptsGoal = Math.ceil(reachableTarget * channel.contactDepthTarget);
    const allocatedAttemptCapacity = channel.allocatedCompletedShifts * channel.attemptsPerCompletedShift;
    const capacitySupportedUniverse = channel.contactDepthTarget === 0
      ? 0
      : Math.floor(allocatedAttemptCapacity / channel.contactDepthTarget);
    const capacityGap = Math.max(0, reachableTarget - capacitySupportedUniverse);
    const additionalAttemptsRequired = Math.ceil(capacityGap * channel.contactDepthTarget);

    const capacity = calculateCapacity({
      attemptsGoal,
      attemptsPerCompletedShift: channel.attemptsPerCompletedShift,
      workers: channel.allocatedCompletedShifts,
      completedShiftsPerWorker: 1,
      volunteerFlakeRate: channel.volunteerFlakeRate,
    }).value!;

    const additionalCompletedShiftsRequired = capacity.additionalCompletedShiftsRequired;
    const additionalWorkersRequired = pool.completedShiftsPerWorker > 0
      ? Math.ceil(additionalCompletedShiftsRequired / pool.completedShiftsPerWorker)
      : (additionalCompletedShiftsRequired > 0 ? additionalCompletedShiftsRequired : 0);

    const result: ChannelFeasibilityResult = {
      channelId: channel.channelId,
      resourcePoolId: channel.resourcePoolId,
      reachabilityGap,
      reachableTarget,
      attemptsGoal,
      allocatedAttemptCapacity,
      capacitySupportedUniverse,
      capacityGap,
      additionalAttemptsRequired,
      additionalCompletedShiftsRequired,
      additionalWorkersRequired,
    };

    if (capacity.additionalScheduledShiftsRequired !== undefined) {
      result.additionalScheduledShiftsRequired = capacity.additionalScheduledShiftsRequired;
    }
    if (input.remainingActiveDays !== undefined) {
      result.additionalCompletedShiftsPerActiveDay = additionalCompletedShiftsRequired / input.remainingActiveDays;
      if (capacity.additionalScheduledShiftsRequired !== undefined) {
        result.additionalScheduledShiftsPerActiveDay = capacity.additionalScheduledShiftsRequired / input.remainingActiveDays;
      }
    }
    if (channel.costPerCompletedShift !== undefined) {
      result.incrementalCost = additionalCompletedShiftsRequired * channel.costPerCompletedShift;
    }
    return result;
  });

  return { value: { channels, resourcePools }, issues };
}
