import { PlanAdoptionError } from './errors';
import {
  AdoptionBlocker,
  AdoptionMetadata,
  AdoptionReadiness,
  FeasibilityAcknowledgment,
  FeasibilityGapRecord,
  PlanVersionRecord,
  RecalculationReason,
} from './types';
import { computeFeasibilityGapFingerprint, computeInputHash } from './hash';

export function isAdoptedStatus(status: PlanVersionRecord['status']): boolean {
  return status === 'ADOPTED' || status === 'ADOPTED_REFORECAST';
}

export function assertDraftMutable(plan: PlanVersionRecord): void {
  if (isAdoptedStatus(plan.status)) throw new Error('ADOPTED_PLAN_IMMUTABLE');
}

export function assertStoredPlanReplaceable(existing: PlanVersionRecord | undefined): void {
  if (existing && isAdoptedStatus(existing.status)) throw new Error('ADOPTED_PLAN_IMMUTABLE');
}

export async function withCanonicalInputHash(plan: PlanVersionRecord): Promise<PlanVersionRecord> {
  return { ...plan, inputHash: await computeInputHash(plan.inputs) };
}

async function acknowledgmentMatchesGap(ack: FeasibilityAcknowledgment, gap: FeasibilityGapRecord): Promise<boolean> {
  return ack.gapFingerprint === await computeFeasibilityGapFingerprint(gap)
    && ack.constraintType === gap.constraintType
    && ack.strategicMetricKey === gap.strategicMetricKey
    && ack.strategicValue === gap.strategicValue
    && ack.operationalMetricKey === gap.operationalMetricKey
    && ack.operationalValue === gap.operationalValue
    && ack.gap === gap.gap;
}

function gapSnapshotFromAcknowledgment(ack: FeasibilityAcknowledgment): FeasibilityGapRecord {
  return {
    gapId: ack.gapId,
    constraintType: ack.constraintType,
    strategicMetricKey: ack.strategicMetricKey,
    strategicValue: ack.strategicValue,
    operationalMetricKey: ack.operationalMetricKey,
    operationalValue: ack.operationalValue,
    gap: ack.gap,
    requiresAcknowledgment: true,
  };
}

export async function evaluatePlanAdoptionReadiness(
  plan: PlanVersionRecord,
  expectedInputHash?: string,
): Promise<AdoptionReadiness> {
  const blockers: AdoptionBlocker[] = [];

  if (!plan.sectionStatuses) {
    blockers.push({
      code: 'PLAN_SECTION_INCOMPLETE',
      context: { sectionKey: 'plan', missingKeys: ['sectionStatuses'] },
    });
  } else {
    for (const section of plan.sectionStatuses.filter(
      (item) => item.requiredForAdoption && item.status !== 'COMPLETE',
    )) {
      blockers.push({
        code: 'PLAN_SECTION_INCOMPLETE',
        context: { sectionKey: section.sectionKey, missingKeys: [...section.missingKeys] },
      });
    }
  }

  const currentInputHash = await computeInputHash(plan.inputs);
  const recalculationReasons: RecalculationReason[] = [];
  if (!plan.inputHash || plan.inputHash !== currentInputHash) recalculationReasons.push('INPUT_HASH_MISMATCH');
  if (expectedInputHash !== undefined && expectedInputHash !== plan.inputHash) recalculationReasons.push('REVIEWED_HASH_MISMATCH');
  if (plan.calculations.some((snapshot) => snapshot.inputHash !== currentInputHash)) {
    recalculationReasons.push('STALE_CALCULATION_SNAPSHOT');
  }
  if (recalculationReasons.length > 0) {
    blockers.push({
      code: 'PLAN_RECALC_REQUIRED',
      context: { recalculationReasons },
    });
  }

  for (const gap of plan.feasibilityGaps.filter((item) => item.requiresAcknowledgment)) {
    const acknowledgment = plan.feasibilityAcknowledgments.find((ack) => ack.gapId === gap.gapId);
    if (!acknowledgment) {
      blockers.push({
        code: 'FEASIBILITY_ACK_REQUIRED',
        context: {
          sectionKey: 'program_budget',
          gapId: gap.gapId,
          currentGap: { ...gap },
        },
      });
      continue;
    }
    if (!(await acknowledgmentMatchesGap(acknowledgment, gap))) {
      blockers.push({
        code: 'FEASIBILITY_ACK_STALE',
        context: {
          sectionKey: 'program_budget',
          gapId: gap.gapId,
          previousGap: gapSnapshotFromAcknowledgment(acknowledgment),
          currentGap: { ...gap },
        },
      });
    }
  }

  return { ready: blockers.length === 0, blockers };
}

export async function assertPlanReadyForAdoption(plan: PlanVersionRecord, expectedInputHash?: string): Promise<void> {
  const readiness = await evaluatePlanAdoptionReadiness(plan, expectedInputHash);
  if (readiness.ready) return;
  const first = readiness.blockers[0];
  throw new PlanAdoptionError(first.code, first.context);
}

export async function adoptPlanRecord(plan: PlanVersionRecord, metadata: AdoptionMetadata): Promise<PlanVersionRecord> {
  if (isAdoptedStatus(plan.status)) return plan;
  await assertPlanReadyForAdoption(plan, metadata.expectedInputHash);
  const nextStatus = plan.status === 'REFORECAST_DRAFT' ? 'ADOPTED_REFORECAST' : 'ADOPTED';
  return {
    ...plan,
    status: nextStatus,
    adoptedAt: metadata.adoptedAt,
    adoptedBy: metadata.actorId,
  };
}

export async function createReforecastDraftRecord(
  parent: PlanVersionRecord,
  draft: PlanVersionRecord,
): Promise<PlanVersionRecord> {
  if (!isAdoptedStatus(parent.status)) throw new Error('REFORECAST_PARENT_MUST_BE_ADOPTED');
  if (draft.planVersionId === parent.planVersionId) throw new Error('REFORECAST_REQUIRES_NEW_PLAN_VERSION_ID');
  return withCanonicalInputHash({
    ...draft,
    campaignId: parent.campaignId,
    parentPlanVersionId: parent.planVersionId,
    status: 'REFORECAST_DRAFT',
    adoptedAt: null,
    adoptedBy: null,
  });
}
