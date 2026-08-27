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

export function withCanonicalInputHash(plan: PlanVersionRecord): PlanVersionRecord {
  return { ...plan, inputHash: computeInputHash(plan.inputs) };
}

export function adoptPlanRecord(plan: PlanVersionRecord, metadata: AdoptionMetadata): PlanVersionRecord {
  if (isAdoptedStatus(plan.status)) return plan;
  const nextStatus = plan.status === 'REFORECAST_DRAFT' ? 'ADOPTED_REFORECAST' : 'ADOPTED';
  return {
    ...withCanonicalInputHash(plan),
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
    throw new Error('REFECAST_PARENT_MUST_BE_ADOPTED');
  }
  if (draft.planVersionId === parent.planVersionId) {
    throw new Error('REFECAST_REQUIRES_NEW_PLAN_VERSION_ID');
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
