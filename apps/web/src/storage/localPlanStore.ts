import {
  AdoptionMetadata,
  PlanStore,
  PlanVersionRecord,
  adoptPlanRecord,
  assertDraftMutable,
  assertStoredPlanReplaceable,
  createReforecastDraftRecord,
} from '@wings/plan-domain';

const STORAGE_KEY = 'wings.planVersions.v1';

function readAll(): PlanVersionRecord[] {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(plans: PlanVersionRecord[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
}

export class LocalPlanStore implements PlanStore {
  async saveDraft(plan: PlanVersionRecord): Promise<void> {
    assertDraftMutable(plan);
    const plans = readAll();
    const index = plans.findIndex((item) => item.planVersionId === plan.planVersionId);
    assertStoredPlanReplaceable(index >= 0 ? plans[index] : undefined);
    if (index >= 0) plans[index] = plan;
    else plans.push(plan);
    writeAll(plans);
  }

  async getPlanVersion(planVersionId: string): Promise<PlanVersionRecord | null> {
    return readAll().find((plan) => plan.planVersionId === planVersionId) ?? null;
  }

  async listPlanVersions(campaignId: string): Promise<PlanVersionRecord[]> {
    return readAll().filter((plan) => plan.campaignId === campaignId);
  }

  async adoptPlan(planVersionId: string, metadata: AdoptionMetadata): Promise<PlanVersionRecord> {
    const plans = readAll();
    const index = plans.findIndex((plan) => plan.planVersionId === planVersionId);
    if (index < 0) throw new Error('PLAN_VERSION_NOT_FOUND');
    const adopted = await adoptPlanRecord(plans[index], metadata);
    plans[index] = adopted;
    writeAll(plans);
    return adopted;
  }

  async createReforecast(parentPlanVersionId: string, draft: PlanVersionRecord): Promise<PlanVersionRecord> {
    const plans = readAll();
    const parent = plans.find((plan) => plan.planVersionId === parentPlanVersionId);
    if (!parent) throw new Error('PARENT_PLAN_VERSION_NOT_FOUND');
    const child = await createReforecastDraftRecord(parent, draft);
    plans.push(child);
    writeAll(plans);
    return child;
  }
}
