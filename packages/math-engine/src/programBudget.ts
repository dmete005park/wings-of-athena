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

export interface AllocationConflictResult {
  resourcePoolId: string;
  competingChannelIds: string[];
  channelAllocations: Array<{ channelId: string; allocatedCompletedShifts: number }>;
  shiftsToReallocate: number;
}

export interface ProgramBudgetFeasibilityResult {
  channels: ChannelFeasibilityResult[];
  resourcePools: ResourcePoolFeasibilityResult[];
  allocationConflicts: AllocationConflictResult[];
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

  const allocationConflicts: AllocationConflictResult[] = resourcePools
    .filter((pool) => pool.overAllocatedCompletedShifts > 0)
    .map((pool) => {
      const competing = input.channels.filter(
        (channel) => channel.resourcePoolId === pool.resourcePoolId && channel.allocatedCompletedShifts > 0,
      );
      return {
        resourcePoolId: pool.resourcePoolId,
        competingChannelIds: competing.map((channel) => channel.channelId),
        channelAllocations: competing.map((channel) => ({
          channelId: channel.channelId,
          allocatedCompletedShifts: channel.allocatedCompletedShifts,
        })),
        shiftsToReallocate: pool.overAllocatedCompletedShifts,
      };
    });

  for (const conflict of allocationConflicts) {
    issues.push({
      level: 'WARNING',
      code: 'RESOURCE_POOL_OVERALLOCATED',
      message: `${conflict.resourcePoolId} is over-allocated by ${conflict.shiftsToReallocate} completed shifts across ${conflict.competingChannelIds.join(', ')}.`,
    });
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

  return { value: { channels, resourcePools, allocationConflicts }, issues };
}


export const BUDGET_PROPOSAL_FORMULA = {
  CHANNEL_ALLOCATED_COST: 'budget.channel_allocated_cost.v0.1',
  MODELED_PROGRAM_COST: 'budget.modeled_program_cost.v0.1',
  CAPACITY_CLOSE_COST: 'budget.capacity_close_cost.v0.1',
  REQUIRED_PROGRAM_COST: 'budget.required_program_cost.v0.1',
} as const;

export const BUDGET_PROPOSAL_METRIC = {
  MODELED_PROGRAM_COST: 'budget.modeled_program_cost',
  AVAILABLE: 'budget.available',
  REMAINING: 'budget.remaining',
  GAP: 'budget.gap',
  CAPACITY_CLOSE_COST: 'budget.capacity_close_cost',
  REQUIRED_PROGRAM_COST: 'budget.required_program_cost',
} as const;

export interface ChannelBudgetLineInput {
  channelId: string;
  allocatedCompletedShifts: number;
  costPerCompletedShift?: number;
  additionalCompletedShiftsRequired?: number;
  requiredCompletedShifts?: number;
}

export interface CampaignBudgetProposalInput {
  channels: ChannelBudgetLineInput[];
  availableBudget?: number;
}

export interface ChannelBudgetLine {
  channelId: string;
  allocatedCompletedShifts: number;
  costPerCompletedShift: number | null;
  allocatedCost: number | null;
  additionalCompletedShiftsRequired: number;
  capacityCloseCost: number | null;
  requiredCompletedShifts: number | null;
  requiredProgramCost: number | null;
}

export interface CampaignBudgetProposal {
  channelLines: ChannelBudgetLine[];
  modeledProgramCost: number | null;
  incompleteCostChannelIds: string[];
  availableBudget: number | null;
  remainingBudget: number | null;
  budgetGap: number | null;
  capacityCloseCost: number | null;
  incompleteCapacityCostChannelIds: string[];
  requiredProgramCost: number | null;
  incompleteRequiredCostChannelIds: string[];
}

/**
 * Campaign budget proposal from entered shift allocations and unit costs.
 * Missing unit costs stay null and are listed — never invented.
 */
export function calculateCampaignBudgetProposal(
  input: CampaignBudgetProposalInput,
): Calculation<CampaignBudgetProposal> {
  const issues: ValidationIssue[] = [];

  if (input.availableBudget !== undefined && !isFiniteNonNegative(input.availableBudget)) {
    issues.push({
      level: 'ERROR',
      code: 'INVALID_AVAILABLE_BUDGET',
      message: 'Available budget must be non-negative when supplied.',
    });
  }

  for (const channel of input.channels) {
    if (!isFiniteNonNegative(channel.allocatedCompletedShifts)) {
      issues.push({
        level: 'ERROR',
        code: 'INVALID_BUDGET_SHIFTS',
        message: `${channel.channelId}.allocatedCompletedShifts must be non-negative.`,
      });
    }
    if (channel.costPerCompletedShift !== undefined && !isFiniteNonNegative(channel.costPerCompletedShift)) {
      issues.push({
        level: 'ERROR',
        code: 'INVALID_BUDGET_SHIFT_COST',
        message: `${channel.channelId}.costPerCompletedShift must be non-negative.`,
      });
    }
    if (
      channel.additionalCompletedShiftsRequired !== undefined
      && !isFiniteNonNegative(channel.additionalCompletedShiftsRequired)
    ) {
      issues.push({
        level: 'ERROR',
        code: 'INVALID_BUDGET_ADDITIONAL_SHIFTS',
        message: `${channel.channelId}.additionalCompletedShiftsRequired must be non-negative.`,
      });
    }
    if (channel.requiredCompletedShifts !== undefined && !isFiniteNonNegative(channel.requiredCompletedShifts)) {
      issues.push({
        level: 'ERROR',
        code: 'INVALID_BUDGET_REQUIRED_SHIFTS',
        message: `${channel.channelId}.requiredCompletedShifts must be non-negative.`,
      });
    }
  }

  if (issues.some((issue) => issue.level === 'ERROR')) return { value: null, issues };

  const incompleteCostChannelIds: string[] = [];
  const incompleteCapacityCostChannelIds: string[] = [];
  const incompleteRequiredCostChannelIds: string[] = [];

  const channelLines: ChannelBudgetLine[] = input.channels.map((channel) => {
    const costPerCompletedShift = channel.costPerCompletedShift ?? null;
    const additionalCompletedShiftsRequired = channel.additionalCompletedShiftsRequired ?? 0;
    const requiredCompletedShifts = channel.requiredCompletedShifts ?? null;

    if (costPerCompletedShift === null) incompleteCostChannelIds.push(channel.channelId);

    const allocatedCost = costPerCompletedShift === null
      ? null
      : channel.allocatedCompletedShifts * costPerCompletedShift;

    const capacityCloseCost = costPerCompletedShift === null
      ? null
      : additionalCompletedShiftsRequired * costPerCompletedShift;
    if (additionalCompletedShiftsRequired > 0 && costPerCompletedShift === null) {
      incompleteCapacityCostChannelIds.push(channel.channelId);
    }

    const requiredProgramCost = costPerCompletedShift === null || requiredCompletedShifts === null
      ? null
      : requiredCompletedShifts * costPerCompletedShift;
    if (requiredCompletedShifts !== null && costPerCompletedShift === null) {
      incompleteRequiredCostChannelIds.push(channel.channelId);
    }

    return {
      channelId: channel.channelId,
      allocatedCompletedShifts: channel.allocatedCompletedShifts,
      costPerCompletedShift,
      allocatedCost,
      additionalCompletedShiftsRequired,
      capacityCloseCost,
      requiredCompletedShifts,
      requiredProgramCost,
    };
  });

  const modeledProgramCost = incompleteCostChannelIds.length > 0
    ? null
    : channelLines.reduce((total, line) => total + (line.allocatedCost ?? 0), 0);

  const capacityCloseCost = incompleteCapacityCostChannelIds.length > 0
    ? null
    : channelLines.reduce((total, line) => total + (line.capacityCloseCost ?? 0), 0);

  const requiredProgramCost = channelLines.every((line) => line.requiredCompletedShifts === null)
    ? null
    : (incompleteRequiredCostChannelIds.length > 0
      ? null
      : channelLines.reduce((total, line) => total + (line.requiredProgramCost ?? 0), 0));

  const availableBudget = input.availableBudget ?? null;
  const remainingBudget = availableBudget === null || modeledProgramCost === null
    ? null
    : availableBudget - modeledProgramCost;
  const budgetGap = remainingBudget === null ? null : Math.max(0, -remainingBudget);

  return {
    value: {
      channelLines,
      modeledProgramCost,
      incompleteCostChannelIds,
      availableBudget,
      remainingBudget,
      budgetGap,
      capacityCloseCost,
      incompleteCapacityCostChannelIds,
      requiredProgramCost,
      incompleteRequiredCostChannelIds,
    },
    issues,
  };
}
