import { AdoptionMetadata, FeasibilityAcknowledgment, FeasibilityGapRecord, PlanVersionRecord } from './types';
import { computeFeasibilityGapFingerprint, computeInputHash } from './hash';

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

function acknowledgmentMatchesGap(ack: FeasibilityAcknowledgment, gap: FeasibilityGapRecord): boolean {
  return ack.gapFingerprint === computeFeasibilityGapFingerprint(gap)
    && ack.constraintType === gap.constraintType
    && ack.strategicMetricKey === gap.strategicMetricKey
    && ack.strategicValue === gap.strategicValue
    && ack.operationalMetricKey === gap.operationalMetricKey
    && ack.operationalValue === gap.operationalValue
    && ack.gap === gap.gap;
}

export function assertPlanReadyForAdoption(plan: PlanVersionRecord, expectedInputHash?: string): void {
  if (!plan.sectionStatuses) {
    throw new Error('PLAN_SECTION_INCOMPLETE:plan:sectionStatuses');
  }

  const incompleteSection = plan.sectionStatuses.find(
    (section) => section.requiredForAdoption && section.status !== 'COMPLETE',
  );
  if (incompleteSection) {
    const missing = incompleteSection.missingKeys.join(',');
    throw new Error(`PLAN_SECTION_INCOMPLETE:${incompleteSection.sectionKey}:${missing}`);
  }

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

  for (const gap of plan.feasibilityGaps.filter((item) => item.requiresAcknowledgment)) {
    const acknowledgment = plan.feasibilityAcknowledgments.find((ack) => ack.gapId === gap.gapId);
    if (!acknowledgment) {
      throw new Error(`FEASIBILITY_ACK_REQUIRED:${gap.gapId}`);
    }
    if (!acknowledgmentMatchesGap(acknowledgment, gap)) {
      throw new Error(`FEASIBILITY_ACK_STALE:${gap.gapId}`);
    }
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
