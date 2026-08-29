import {
  MATH_ENGINE_VERSION,
  calculateCampaignVoteGoal,
  calculateExpectedElectorate,
  calculateProgramBudgetFeasibility,
  calculateRaceThreshold,
  calculateSupportIdObjective,
  constructStrategicUniverse,
  type RaceRule,
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
  raceRule: RaceRule | null;
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
  uniqueReachTarget: number | null;
  reachableUniverse: number | null;
  contactDepthTarget: number | null;
  attemptsPerCompletedShift: number | null;
  allocatedCompletedShifts: number | null;
  perAttemptContactRate: number | null;
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
  idConversionRate: number | null;
  channels: Record<ChannelId, ChannelDraft>;
}

/** Vote funnel from a channel's allocated program. Display only — not a new feasibility record. */
export interface PersuasionConversionChain {
  channelId: ChannelId;
  shifts: number;
  attempts: number;
  attemptsPerShift: number;
  contacts: number;
  contactRate: number;
  ids: number;
  conversionRate: number;
  votes: number;
  supporterTurnoutRate: number;
  votesNeeded: number;
  shiftsToClose: number | null;
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
  raceRule: { type: 'MAJORITY', requiredShare: 0.5, strictlyGreater: true },
  geography: '',
  eligibleVoters: 60000,
  highCount: 12000,
  highTurnout: 0.8,
  midCount: 22000,
  midTurnout: 0.6,
  lowCount: 26000,
  lowTurnout: 0.4,
  targetShare: 0.5,
  universeMultiplier: 1.6,
};

export function electorateInputFrom(campaign: CampaignPathDraft) {
  return {
    eligibleVoters: campaign.eligibleVoters,
    segmentsAreMutuallyExclusive: true as const,
    segments: [
      { id: 'high', label: 'High-frequency', count: campaign.highCount, turnoutProbability: campaign.highTurnout },
      { id: 'mid', label: 'Medium-frequency', count: campaign.midCount, turnoutProbability: campaign.midTurnout },
      { id: 'low', label: 'Low-frequency', count: campaign.lowCount, turnoutProbability: campaign.lowTurnout },
    ],
  };
}

export function isCompleteRaceRule(value: unknown): value is RaceRule {
  if (!value || typeof value !== 'object' || !('type' in value)) return false;
  const rule = value as RaceRule;
  switch (rule.type) {
    case 'MAJORITY':
      return Number.isFinite(rule.requiredShare);
    case 'PLURALITY':
      return Number.isFinite(rule.expectedWinningShare);
    case 'RUNOFF':
      return Number.isFinite(rule.advancementTargetShare);
    case 'OTHER':
      return Number.isFinite(rule.targetShare) && typeof rule.label === 'string' && rule.label.trim().length > 0;
    default:
      return false;
  }
}

export function raceRuleShare(rule: RaceRule): number {
  switch (rule.type) {
    case 'MAJORITY': return rule.requiredShare;
    case 'PLURALITY': return rule.expectedWinningShare;
    case 'RUNOFF': return rule.advancementTargetShare;
    case 'OTHER': return rule.targetShare;
  }
}

export function raceRuleWithType(
  type: RaceRule['type'],
  previous: RaceRule | null | undefined,
  otherLabel = '',
): RaceRule | null {
  const share = previous ? raceRuleShare(previous) : null;
  if (share == null) return null;
  const strictlyGreater = previous?.type === 'MAJORITY' ? previous.strictlyGreater !== false : true;
  const label = previous?.type === 'OTHER' ? previous.label : otherLabel;
  switch (type) {
    case 'MAJORITY': return { type, requiredShare: share, strictlyGreater };
    case 'PLURALITY': return { type, expectedWinningShare: share };
    case 'RUNOFF': return { type, advancementTargetShare: share };
    case 'OTHER': return { type, targetShare: share, label };
  }
}

export function raceThresholdFormulaId(rule: RaceRule): string {
  switch (rule.type) {
    case 'MAJORITY': return 'victory.threshold.majority.v0.2';
    case 'PLURALITY': return 'victory.threshold.plurality.v0.2';
    case 'RUNOFF': return 'victory.threshold.runoff.v0.2';
    case 'OTHER': return 'victory.threshold.other.v0.2';
  }
}

/** A majority line exists only under a majority rule. Plurality has no majority requirement. */
export function majorityLineValue(
  raceRule: RaceRule | null | undefined,
  thresholdValue: number | null | undefined,
): number | null {
  if (!raceRule || raceRule.type !== 'MAJORITY') return null;
  return thresholdValue ?? null;
}

export function raceRuleWithShare(rule: RaceRule, share: number): RaceRule {
  switch (rule.type) {
    case 'MAJORITY': return { type: 'MAJORITY', requiredShare: share, strictlyGreater: rule.strictlyGreater };
    case 'PLURALITY': return { type: 'PLURALITY', expectedWinningShare: share };
    case 'RUNOFF': return { type: 'RUNOFF', advancementTargetShare: share };
    case 'OTHER': return { type: 'OTHER', targetShare: share, label: rule.label };
  }
}

function raceRuleAsJson(rule: RaceRule): JsonValue {
  switch (rule.type) {
    case 'MAJORITY':
      return {
        type: rule.type,
        requiredShare: rule.requiredShare,
        ...(rule.strictlyGreater === undefined ? {} : { strictlyGreater: rule.strictlyGreater }),
      };
    case 'PLURALITY':
      return { type: rule.type, expectedWinningShare: rule.expectedWinningShare };
    case 'RUNOFF':
      return { type: rule.type, advancementTargetShare: rule.advancementTargetShare };
    case 'OTHER':
      return { type: rule.type, targetShare: rule.targetShare, label: rule.label };
  }
}

function blankChannel(enabled: boolean): ChannelDraft {
  return {
    enabled,
    uniqueReachTarget: null,
    reachableUniverse: null,
    contactDepthTarget: null,
    attemptsPerCompletedShift: null,
    allocatedCompletedShifts: null,
    perAttemptContactRate: null,
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
      idConversionRate: null,
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

function probability(value: number | null): boolean {
  return value !== null && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function buildPersuasionConversionChain(
  channelId: ChannelId,
  channel: ChannelDraft,
  voteGoal: number | null,
  coverageTarget: number | null,
  supporterTurnoutRate: number | null,
  idConversionRate: number | null,
): PersuasionConversionChain | null {
  const shifts = channel.allocatedCompletedShifts;
  const attemptsPerShift = channel.attemptsPerCompletedShift;
  const contactRate = channel.perAttemptContactRate;
  if (
    !positive(shifts)
    || !positive(attemptsPerShift)
    || !probability(contactRate)
    || !probability(idConversionRate)
    || !probability(supporterTurnoutRate)
    || supporterTurnoutRate === 0
    || voteGoal === null
    || !Number.isFinite(voteGoal)
    || voteGoal < 0
    || !probability(coverageTarget)
  ) {
    return null;
  }

  const attempts = shifts! * attemptsPerShift!;
  const objective = calculateSupportIdObjective({
    campaignVoteGoal: voteGoal,
    idCoverageTarget: coverageTarget!,
    supporterTurnoutRate: supporterTurnoutRate!,
    attempts,
    perAttemptContactRate: contactRate!,
    idCompletionRate: idConversionRate!,
    supportRate: 1,
  });
  const votes = objective.value?.expectedSupportVotesFromIds;
  const ids = objective.value?.expectedSupportIds;
  const votesNeeded = objective.value?.supportIdVoteTarget;
  if (votes == null || ids == null || votesNeeded == null) return null;

  const yieldPerShift = attemptsPerShift! * contactRate! * idConversionRate! * supporterTurnoutRate!;
  const shiftsToClose = yieldPerShift > 0 ? Math.ceil(votesNeeded / yieldPerShift) : null;

  return {
    channelId,
    shifts: shifts!,
    attempts,
    attemptsPerShift: attemptsPerShift!,
    contacts: attempts * contactRate!,
    contactRate: contactRate!,
    ids,
    conversionRate: idConversionRate!,
    votes,
    supporterTurnoutRate: supporterTurnoutRate!,
    votesNeeded,
    shiftsToClose,
  };
}

export async function buildScenarioPlan(draft: ScenarioDraft, identity: BuildIdentity) {
  const campaign = draft.campaign;
  const electorateInput = electorateInputFrom(campaign);
  const electorate = calculateExpectedElectorate(electorateInput);
  const raceRule = isCompleteRaceRule(campaign.raceRule) ? campaign.raceRule : null;

  const threshold = electorate.value === null || raceRule === null
    ? null
    : calculateRaceThreshold(electorate.value, raceRule);
  const voteGoalInput = electorate.value === null
    ? null
    : {
        adoptedExpectedElectorate: electorate.value,
        adoptedTargetShare: campaign.targetShare,
        ...(threshold?.value != null ? { mathematicalThreshold: threshold.value } : {}),
      };
  const voteGoal = voteGoalInput === null ? null : calculateCampaignVoteGoal(voteGoalInput);
  const universeMethod = { type: 'VOTE_GOAL_MULTIPLIER' as const, multiplier: campaign.universeMultiplier };
  const universe = voteGoal?.value == null
    ? null
    : constructStrategicUniverse(voteGoal.value, universeMethod);

  const strategicUniverse = universe?.value ?? null;
  const enabledChannels = (Object.entries(draft.programBudget.channels) as Array<[ChannelId, ChannelDraft]>)
    .filter(([, channel]) => channel.enabled);
  const programInputsComplete = strategicUniverse !== null
    && positive(draft.programBudget.resourcePoolWorkers)
    && positive(draft.programBudget.completedShiftsPerWorker)
    && enabledChannels.length > 0
    && enabledChannels.every(([, channel]) =>
      positive(channel.uniqueReachTarget)
      && nonNegative(channel.reachableUniverse)
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
          uniqueReachTarget: channel.uniqueReachTarget!,
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
      const channelDraft = draft.programBudget.channels[channel.channelId as ChannelId];
      if (channel.reachabilityGap > 0) {
        feasibilityGaps.push({
          gapId: `reachability:${channel.channelId}`,
          constraintType: 'REACHABILITY',
          strategicMetricKey: `outreach.unique_reach_target.${channel.channelId}`,
          strategicValue: channelDraft.uniqueReachTarget!,
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
        { key: 'raceRule', present: raceRule !== null, requiredWhen: { type: 'ALWAYS' } },
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
      uniqueReachTarget: channel.uniqueReachTarget,
      reachableUniverse: channel.reachableUniverse,
      contactDepthTarget: channel.contactDepthTarget,
      attemptsPerCompletedShift: channel.attemptsPerCompletedShift,
      allocatedCompletedShifts: channel.allocatedCompletedShifts,
      perAttemptContactRate: channel.perAttemptContactRate,
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
      raceRule: raceRule ? raceRuleAsJson(raceRule) : null,
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
      idConversionRate: draft.programBudget.idConversionRate,
      channels: channelInputs,
    },
  };

  const calculations: Array<Omit<PlanVersionRecord['calculations'][number], 'inputHash'>> = [];
  if (electorate.value !== null) calculations.push({
    metricKey: 'electorate.expected.modeled', modeledValue: electorate.value, adoptedValue: electorate.value,
    formulaId: 'electorate.expected.v0.2',
    inputs: {
      eligibleVoters: electorateInput.eligibleVoters,
      segmentsAreMutuallyExclusive: electorateInput.segmentsAreMutuallyExclusive,
      segments: electorateInput.segments.map((segment) => ({
        id: segment.id,
        label: segment.label,
        count: segment.count,
        turnoutProbability: segment.turnoutProbability,
      })),
    },
    evidenceRefs: [],
  });
  if (threshold?.value != null && raceRule !== null) calculations.push({
    metricKey: 'victory.threshold', modeledValue: threshold.value, adoptedValue: threshold.value,
    formulaId: raceThresholdFormulaId(raceRule),
    inputs: { expectedElectorate: electorate.value, rule: raceRuleAsJson(raceRule) },
    evidenceRefs: [],
  });
  if (voteGoal?.value != null && voteGoalInput !== null) calculations.push({
    metricKey: 'victory.vote_goal', modeledValue: voteGoal.value, adoptedValue: voteGoal.value,
    formulaId: 'victory.vote_goal.v0.2',
    inputs: {
      adoptedExpectedElectorate: voteGoalInput.adoptedExpectedElectorate,
      adoptedTargetShare: voteGoalInput.adoptedTargetShare,
      ...(voteGoalInput.mathematicalThreshold != null
        ? { mathematicalThreshold: voteGoalInput.mathematicalThreshold }
        : {}),
    },
    evidenceRefs: [],
  });
  if (strategicUniverse !== null && voteGoal?.value != null) calculations.push({
    metricKey: 'universe.strategic_desired', modeledValue: strategicUniverse, adoptedValue: strategicUniverse,
    formulaId: 'universe.vote_goal_multiplier.v0.2',
    inputs: { voteGoal: voteGoal.value, method: universeMethod },
    evidenceRefs: [],
  });

  const build = await buildPlanVersionRecord({
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

  const persuasionChains: PersuasionConversionChain[] = [];
  if (draft.programBudget.supportIdEnabled) {
    for (const [channelId, channel] of enabledChannels) {
      const chain = buildPersuasionConversionChain(
        channelId,
        channel,
        voteGoal?.value ?? null,
        draft.programBudget.supportIdCoverageTarget,
        draft.programBudget.supporterTurnoutRate,
        draft.programBudget.idConversionRate,
      );
      if (chain) persuasionChains.push(chain);
    }
  }

  return { build, electorate, threshold, voteGoal, universe, programFeasibility, feasibilityGaps, persuasionChains, issues };
}

export async function createAcknowledgment(
  gap: FeasibilityGapRecord,
  reason: string,
  actorId: string,
): Promise<FeasibilityAcknowledgment> {
  return {
    acknowledgmentId: `ack-${gap.gapId}-${Date.now()}`,
    gapId: gap.gapId,
    gapFingerprint: await computeFeasibilityGapFingerprint(gap),
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
