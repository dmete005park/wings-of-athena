import { AdoptionMetadata, PlanVersionRecord } from './types';
import { computeInputHash } from './hash';

export function isAdoptedStatus(status: PlanVersionRecord['status']): boolean {
  return status === 'ADOPTED' || status === 'ADOPTED_REFORECAST';
}

export function assertDraftMutable(plan: PlanVersionRecord): void {
  if (isAdoptedStatus(plan.status)) {
    throw new Error('ADOPTED_PLAN_IMMUTABLE');
  }
}

export function assertStoredPlanReplaceable(existing: PlanVersionRecord | undefined): void {
  if (existing && isAdoptedStatus(existing.status)) {
    throw new Error('ADOPTED_PLAN_IMMUTABLE');
  }
}

export function withCanonicalInputHash(plan: PlanVersionRecord): PlanVersionRecord {
  return { ...plan, inputHash: computeInputHash(plan.inputs) };
}

export function assertPlanReadyForAdoption(plan: PlanVersionRecord, expectedInputHash?: string): void {
  const currentInputHash = computeInputHash(plan.inputs);
  if (!plan.inputHash || plan.inputHash !== currentInputHash) {
    throw new Error('PLAN_RECALC_REQUIRED');
  }

  if (expectedInputHash !== undefined && expectedInputHash !== plan.inputHash) {
    throw new Error('PLAN_RECALC_REQUIRED');
  }

  const staleSnapshot = plan.calculations.some((snapshot) => snapshot.inputHash !== currentInputHash);
  if (staleSnapshot) {
    throw new Error('PLAN_RECALC_REQUIRED');
  }

  const acknowledgedGapIds = new Set(plan.feasibilityAcknowledgments.map((ack) => ack.gapId));
  const missingAcknowledgment = plan.feasibilityGaps.find(
    (gap) => gap.requiresAcknowledgment && !acknowledgedGapIds.has(gap.gapId),
  );
  if (missingAcknowledgment) {
    throw new Error(`FEASIBILITY_ACK_REQUIRED:${missingAcknowledgment.gapId}`);
  }
}

export function adoptPlanRecord(plan: PlanVersionRecord, metadata: AdoptionMetadata): PlanVersionRecord {
  if (isAdoptedStatus(plan.status)) return plan;
  assertPlanReadyForAdoption(plan, metadata.expectedInputHash);
  const nextStatus = plan.status === 'REFORECAST_DRAFT' ? 'ADOPTED_REFORECAST' : 'ADOPTED';
  return {
    ...plan,
    status: nextStatus,
    adoptedAt: metadata.adoptedAt,
    adoptedBy: metadata.actorId,
  };
}

export function createReforecastDraftRecord(
  parent: PlanVersionRecord,
  draft: PlanVersionRecord,
): PlanVersionRecord {
  if (!isAdoptedStatus(parent.status)) {
    throw new Error('REFORECAST_PARENT_MUST_BE_ADOPTED');
  }
  if (draft.planVersionId === parent.planVersionId) {
    throw new Error('REFORECAST_REQUIRES_NEW_PLAN_VERSION_ID');
  }
  return withCanonicalInputHash({
    ...draft,
    campaignId: parent.campaignId,
    parentPlanVersionId: parent.planVersionId,
    status: 'REFORECAST_DRAFT',
    adoptedAt: null,
    adoptedBy: null,
  });
}
