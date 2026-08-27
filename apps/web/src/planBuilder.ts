import {
  MATH_ENGINE_VERSION,
  calculateCampaignVoteGoal,
  calculateExpectedElectorate,
  calculateProgramBudgetFeasibility,
  calculateRaceThreshold,
  constructStrategicUniverse,
} from '@wings/math-engine';
import {
  buildPlanVersionRecord,
  computeFeasibilityGapFingerprint,
  type FeasibilityAcknowledgment,
  type FeasibilityGapRecord,
  type JsonValue,
  type PlanSectionDefinition,
  type PlanVersionRecord,
  type ScenarioName,
} from '@wings/plan-domain';

export type ElectionType = 'PRIMARY' | 'GENERAL' | 'MUNICIPAL' | 'SPECIAL' | 'OTHER';
export type ChannelId = 'doors' | 'phones';

export interface CampaignPathDraft {
  campaignName: string;
  office: string;
  electionDate: string;
  electionType: ElectionType;
  geography: string;
  eligibleVoters: number;
  highCount: number;
  highTurnout: number;
  midCount: number;
  midTurnout: number;
  lowCount: number;
  lowTurnout: number;
  targetShare: number;
  universeMultiplier: number;
}

export interface ChannelDraft {
  enabled: boolean;
  reachableUniverse: number | null;
  contactDepthTarget: number | null;
  attemptsPerCompletedShift: number | null;
  allocatedCompletedShifts: number | null;
  volunteerFlakeRate: number | null;
  costPerCompletedShift: number | null;
}

export interface ProgramBudgetDraft {
  resourcePoolWorkers: number | null;
  completedShiftsPerWorker: number | null;
  remainingActiveDays: number | null;
  availableBudget: number | null;
  supportIdEnabled: boolean;
  supportIdCoverageTarget: number | null;
  supporterTurnoutRate: number | null;
  channels: Record<ChannelId, ChannelDraft>;
}

export interface ScenarioDraft {
  scenario: ScenarioName;
  campaign: CampaignPathDraft;
  programBudget: ProgramBudgetDraft;
  feasibilityAcknowledgments: FeasibilityAcknowledgment[];
}

export interface BuildIdentity {
  campaignId: string;
  planVersionId: string;
  createdAt: string;
  createdBy: string;
}

export const starterCampaign: CampaignPathDraft = {
  campaignName: 'Untitled Campaign',
  office: '',
  electionDate: '',
  electionType: 'PRIMARY',
  geography: '',
  eligibleVoters: 60000,
  highCount: 12000,
  highTurnout: 0.82,
  midCount: 22000,
  midTurnout: 0.58,
  lowCount: 26000,
  lowTurnout: 0.28,
  targetShare: 0.5,
  universeMultiplier: 1.6,
};

function blankChannel(enabled: boolean): ChannelDraft {
  return {
    enabled,
    reachableUniverse: null,
    contactDepthTarget: null,
    attemptsPerCompletedShift: null,
    allocatedCompletedShifts: null,
    volunteerFlakeRate: null,
    costPerCompletedShift: null,
  };
}

export function createStarterScenario(scenario: ScenarioName = 'BASE'): ScenarioDraft {
  return {
    scenario,
    campaign: { ...starterCampaign },
    programBudget: {
      resourcePoolWorkers: null,
      completedShiftsPerWorker: null,
      remainingActiveDays: null,
      availableBudget: null,
      supportIdEnabled: false,
      supportIdCoverageTarget: null,
      supporterTurnoutRate: null,
      channels: {
        doors: blankChannel(true),
        phones: blankChannel(false),
      },
    },
    feasibilityAcknowledgments: [],
  };
}

function positive(value: number | null): boolean {
  return value !== null && Number.isFinite(value) && value > 0;
}

function nonNegative(value: number | null): boolean {
  return value !== null && Number.isFinite(value) && value >= 0;
}

export function buildScenarioPlan(draft: ScenarioDraft, identity: BuildIdentity) {
  const campaign = draft.campaign;
  const electorate = calculateExpectedElectorate({
    eligibleVoters: campaign.eligibleVoters,
    segmentsAreMutuallyExclusive: true,
    segments: [
      { id: 'high', label: 'High-frequency', count: campaign.highCount, turnoutProbability: campaign.highTurnout },
      { id: 'mid', label: 'Medium-frequency', count: campaign.midCount, turnoutProbability: campaign.midTurnout },
      { id: 'low', label: 'Low-frequency', count: campaign.lowCount, turnoutProbability: campaign.lowTurnout },
    ],
  });

  const threshold = electorate.value === null
    ? null
    : calculateRaceThreshold(electorate.value, { type: 'MAJORITY', requiredShare: 0.5, strictlyGreater: true });
  const voteGoal = electorate.value === null || threshold?.value == null
    ? null
    : calculateCampaignVoteGoal({
        adoptedExpectedElectorate: electorate.value,
        adoptedTargetShare: campaign.targetShare,
        mathematicalThreshold: threshold.value,
      });
  const universe = voteGoal?.value == null
    ? null
    : constructStrategicUniverse(voteGoal.value, {
        type: 'VOTE_GOAL_MULTIPLIER',
        multiplier: campaign.universeMultiplier,
      });

  const strategicUniverse = universe?.value ?? null;
  const enabledChannels = (Object.entries(draft.programBudget.channels) as Array<[ChannelId, ChannelDraft]>)
    .filter(([, channel]) => channel.enabled);
  const programInputsComplete = strategicUniverse !== null
    && positive(draft.programBudget.resourcePoolWorkers)
    && positive(draft.programBudget.completedShiftsPerWorker)
    && enabledChannels.length > 0
    && enabledChannels.every(([, channel]) =>
      nonNegative(channel.reachableUniverse)
      && positive(channel.contactDepthTarget)
      && positive(channel.attemptsPerCompletedShift)
      && nonNegative(channel.allocatedCompletedShifts));

  const remainingActiveDays = positive(draft.programBudget.remainingActiveDays)
    ? draft.programBudget.remainingActiveDays!
    : undefined;

  const programFeasibility = programInputsComplete
    ? calculateProgramBudgetFeasibility({
        remainingActiveDays,
        resourcePools: [{
          resourcePoolId: 'shared-campaign-pool',
          workers: draft.programBudget.resourcePoolWorkers!,
          completedShiftsPerWorker: draft.programBudget.completedShiftsPerWorker!,
        }],
        channels: enabledChannels.map(([channelId, channel]) => ({
          channelId,
          resourcePoolId: 'shared-campaign-pool',
          uniqueReachTarget: strategicUniverse!,
          reachableUniverse: channel.reachableUniverse!,
          contactDepthTarget: channel.contactDepthTarget!,
          attemptsPerCompletedShift: channel.attemptsPerCompletedShift!,
          allocatedCompletedShifts: channel.allocatedCompletedShifts!,
          volunteerFlakeRate: nonNegative(channel.volunteerFlakeRate) ? channel.volunteerFlakeRate! : undefined,
          costPerCompletedShift: nonNegative(channel.costPerCompletedShift) ? channel.costPerCompletedShift! : undefined,
        })),
      })
    : null;

  const feasibilityGaps: FeasibilityGapRecord[] = [];
  if (programFeasibility?.value) {
    for (const channel of programFeasibility.value.channels) {
      if (channel.reachabilityGap > 0) {
        feasibilityGaps.push({
          gapId: `reachability:${channel.channelId}`,
          constraintType: 'REACHABILITY',
          strategicMetricKey: `universe.strategic_desired.${channel.channelId}`,
          strategicValue: strategicUniverse!,
          operationalMetricKey: `universe.reachable.${channel.channelId}`,
          operationalValue: channel.reachableTarget,
          gap: channel.reachabilityGap,
          requiresAcknowledgment: true,
        });
      }
      if (channel.capacityGap > 0) {
        feasibilityGaps.push({
          gapId: `capacity:${channel.channelId}`,
          constraintType: 'CAPACITY',
          strategicMetricKey: `universe.reachable.${channel.channelId}`,
          strategicValue: channel.reachableTarget,
          operationalMetricKey: `universe.capacity_supported.${channel.channelId}`,
          operationalValue: channel.capacitySupportedUniverse,
          gap: channel.capacityGap,
          requiresAcknowledgment: true,
        });
      }
    }

    for (const conflict of programFeasibility.value.allocationConflicts) {
      const pool = programFeasibility.value.resourcePools.find((item) => item.resourcePoolId === conflict.resourcePoolId)!;
      feasibilityGaps.push({
        gapId: `allocation:${conflict.resourcePoolId}`,
        constraintType: 'ALLOCATION',
        strategicMetricKey: 'capacity.pool.available_completed_shifts',
        strategicValue: pool.availableCompletedShifts,
        operationalMetricKey: 'capacity.pool.allocated_completed_shifts',
        operationalValue: pool.allocatedCompletedShifts,
        gap: conflict.shiftsToReallocate,
        requiresAcknowledgment: true,
      });
    }

    const availableBudget = draft.programBudget.availableBudget;
    if (nonNegative(availableBudget)) {
      const modeledCost = enabledChannels.reduce((total, [, channel]) => {
        const cost = channel.costPerCompletedShift;
        const shifts = channel.allocatedCompletedShifts;
        if (cost === null || shifts === null || !Number.isFinite(cost) || !Number.isFinite(shifts) || cost < 0 || shifts < 0) return total;
        return total + cost * shifts;
      }, 0);
      if (modeledCost > availableBudget!) {
        feasibilityGaps.push({
          gapId: 'cost:program',
          constraintType: 'COST',
          strategicMetricKey: 'budget.available',
          strategicValue: availableBudget!,
          operationalMetricKey: 'budget.modeled_program_cost',
          operationalValue: modeledCost,
          gap: modeledCost - availableBudget!,
          requiresAcknowledgment: true,
        });
      }
    }
  }

  const enabledObjectiveIds = draft.programBudget.supportIdEnabled ? ['SUPPORT_ID'] : [];
  const sectionDefinitions: PlanSectionDefinition[] = [
    {
      sectionKey: 'campaign_setup',
      requiredWhen: { type: 'ALWAYS' },
      fields: [
        { key: 'campaignName', present: campaign.campaignName.trim().length > 0, requiredWhen: { type: 'ALWAYS' } },
        { key: 'office', present: campaign.office.trim().length > 0, requiredWhen: { type: 'ALWAYS' } },
        { key: 'electionDate', present: campaign.electionDate.trim().length > 0, requiredWhen: { type: 'ALWAYS' } },
        { key: 'geography', present: campaign.geography.trim().length > 0, requiredWhen: { type: 'ALWAYS' } },
      ],
    },
    {
      sectionKey: 'path_to_victory',
      requiredWhen: { type: 'ALWAYS' },
      fields: [
        { key: 'electorate', present: electorate.value !== null, requiredWhen: { type: 'ALWAYS' } },
        { key: 'voteGoal', present: voteGoal?.value != null, requiredWhen: { type: 'ALWAYS' } },
        { key: 'strategicUniverse', present: strategicUniverse !== null, requiredWhen: { type: 'ALWAYS' } },
      ],
    },
    {
      sectionKey: 'program_budget',
      requiredWhen: { type: 'ALWAYS' },
      fields: [
        { key: 'enabledChannel', present: enabledChannels.length > 0, requiredWhen: { type: 'ALWAYS' } },
        { key: 'resourcePoolWorkers', present: positive(draft.programBudget.resourcePoolWorkers), requiredWhen: { type: 'ALWAYS' } },
        { key: 'completedShiftsPerWorker', present: positive(draft.programBudget.completedShiftsPerWorker), requiredWhen: { type: 'ALWAYS' } },
        { key: 'channelCapacityInputs', present: programInputsComplete, requiredWhen: { type: 'ALWAYS' } },
        { key: 'supportIdCoverageTarget', present: nonNegative(draft.programBudget.supportIdCoverageTarget), requiredWhen: { type: 'OBJECTIVE_ENABLED', objectiveIds: ['SUPPORT_ID'] } },
        { key: 'supporterTurnoutRate', present: nonNegative(draft.programBudget.supporterTurnoutRate), requiredWhen: { type: 'OBJECTIVE_ENABLED', objectiveIds: ['SUPPORT_ID'] } },
      ],
    },
  ];

  const channelInputs: Record<string, JsonValue> = {};
  for (const [channelId, channel] of Object.entries(draft.programBudget.channels) as Array<[ChannelId, ChannelDraft]>) {
    channelInputs[channelId] = {
      enabled: channel.enabled,
      reachableUniverse: channel.reachableUniverse,
      contactDepthTarget: channel.contactDepthTarget,
      attemptsPerCompletedShift: channel.attemptsPerCompletedShift,
      allocatedCompletedShifts: channel.allocatedCompletedShifts,
      volunteerFlakeRate: channel.volunteerFlakeRate,
      costPerCompletedShift: channel.costPerCompletedShift,
    };
  }

  const inputs: Record<string, JsonValue> = {
    campaign: {
      campaignName: campaign.campaignName,
      office: campaign.office,
      electionDate: campaign.electionDate,
      electionType: campaign.electionType,
      geography: campaign.geography,
      eligibleVoters: campaign.eligibleVoters,
      highCount: campaign.highCount,
      highTurnout: campaign.highTurnout,
      midCount: campaign.midCount,
      midTurnout: campaign.midTurnout,
      lowCount: campaign.lowCount,
      lowTurnout: campaign.lowTurnout,
      targetShare: campaign.targetShare,
      universeMultiplier: campaign.universeMultiplier,
    },
    programBudget: {
      resourcePoolWorkers: draft.programBudget.resourcePoolWorkers,
      completedShiftsPerWorker: draft.programBudget.completedShiftsPerWorker,
      remainingActiveDays: draft.programBudget.remainingActiveDays,
      availableBudget: draft.programBudget.availableBudget,
      supportIdEnabled: draft.programBudget.supportIdEnabled,
      supportIdCoverageTarget: draft.programBudget.supportIdCoverageTarget,
      supporterTurnoutRate: draft.programBudget.supporterTurnoutRate,
      channels: channelInputs,
    },
  };

  const calculations: Array<Omit<PlanVersionRecord['calculations'][number], 'inputHash'>> = [];
  if (electorate.value !== null) calculations.push({
    metricKey: 'electorate.expected.modeled', modeledValue: electorate.value, adoptedValue: electorate.value,
    formulaId: 'electorate.expected.v0.2', inputs: { eligibleVoters: campaign.eligibleVoters }, evidenceRefs: [],
  });
  if (threshold?.value != null) calculations.push({
    metricKey: 'victory.threshold', modeledValue: threshold.value, adoptedValue: threshold.value,
    formulaId: 'victory.threshold.majority.v0.2', inputs: { expectedElectorate: electorate.value, requiredShare: 0.5 }, evidenceRefs: [],
  });
  if (voteGoal?.value != null) calculations.push({
    metricKey: 'victory.vote_goal', modeledValue: voteGoal.value, adoptedValue: voteGoal.value,
    formulaId: 'victory.vote_goal.v0.2', inputs: { expectedElectorate: electorate.value, targetShare: campaign.targetShare }, evidenceRefs: [],
  });
  if (strategicUniverse !== null) calculations.push({
    metricKey: 'universe.strategic_desired', modeledValue: strategicUniverse, adoptedValue: strategicUniverse,
    formulaId: 'universe.vote_goal_multiplier.v0.2', inputs: { voteGoal: voteGoal?.value ?? null, multiplier: campaign.universeMultiplier }, evidenceRefs: [],
  });

  const build = buildPlanVersionRecord({
    planVersionId: identity.planVersionId,
    campaignId: identity.campaignId,
    parentPlanVersionId: null,
    status: 'DRAFT',
    scenario: draft.scenario,
    mathEngineVersion: MATH_ENGINE_VERSION,
    calibrationProfileVersion: null,
    inputs,
    assumptions: [
      { key: 'turnout.segment.high_frequency', value: campaign.highTurnout, evidenceRefs: [], source: 'MANAGER' },
      { key: 'turnout.segment.medium_frequency', value: campaign.midTurnout, evidenceRefs: [], source: 'MANAGER' },
      { key: 'turnout.segment.low_frequency', value: campaign.lowTurnout, evidenceRefs: [], source: 'MANAGER' },
      { key: 'victory.target_share', value: campaign.targetShare, evidenceRefs: [], source: 'MANAGER' },
      { key: 'universe.vote_goal_multiplier', value: campaign.universeMultiplier, evidenceRefs: [], source: 'MANAGER' },
    ],
    overrides: [],
    calculations,
    evidenceRefs: [],
    feasibilityGaps,
    feasibilityAcknowledgments: draft.feasibilityAcknowledgments,
    createdAt: identity.createdAt,
    createdBy: identity.createdBy,
    adoptedAt: null,
    adoptedBy: null,
  }, sectionDefinitions, enabledObjectiveIds);

  const issues = [
    ...electorate.issues,
    ...(threshold?.issues ?? []),
    ...(voteGoal?.issues ?? []),
    ...(universe?.issues ?? []),
    ...(programFeasibility?.issues ?? []),
  ];

  return { build, electorate, threshold, voteGoal, universe, programFeasibility, feasibilityGaps, issues };
}

export function createAcknowledgment(
  gap: FeasibilityGapRecord,
  reason: string,
  actorId: string,
): FeasibilityAcknowledgment {
  return {
    acknowledgmentId: `ack-${gap.gapId}-${Date.now()}`,
    gapId: gap.gapId,
    gapFingerprint: computeFeasibilityGapFingerprint(gap),
    constraintType: gap.constraintType,
    strategicMetricKey: gap.strategicMetricKey,
    strategicValue: gap.strategicValue,
    operationalMetricKey: gap.operationalMetricKey,
    operationalValue: gap.operationalValue,
    gap: gap.gap,
    reason,
    actorId,
    acknowledgedAt: new Date().toISOString(),
  };
}
