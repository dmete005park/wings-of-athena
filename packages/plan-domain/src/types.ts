export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type PlanStatus =
  | 'DRAFT'
  | 'CANDIDATE_SCENARIO'
  | 'ADOPTED'
  | 'REFORECAST_DRAFT'
  | 'ADOPTED_REFORECAST';

export type ScenarioName = 'CONSERVATIVE' | 'BASE' | 'EXPANDED' | string;

export interface EvidenceLink {
  evidenceId: string;
  evidenceClass: string;
  sourceVersion?: string;
  reuseRestriction?: string;
}

export interface AssumptionSnapshot {
  key: string;
  value: JsonValue;
  evidenceRefs: EvidenceLink[];
  source: 'MANAGER' | 'CALIBRATION' | 'IMPORTED' | 'PRODUCT_DEFAULT';
}

export interface OverrideRecord {
  metricKey: string;
  modeledValue: JsonValue;
  adoptedValue: JsonValue;
  reason: string;
  actorId: string;
  createdAt: string;
}

export interface CalculationSnapshot {
  metricKey: string;
  modeledValue: JsonValue;
  adoptedValue: JsonValue;
  formulaId: string;
  inputs: Record<string, JsonValue>;
  evidenceRefs: EvidenceLink[];
}

export interface PlanVersionRecord {
  planVersionId: string;
  campaignId: string;
  parentPlanVersionId: string | null;
  status: PlanStatus;
  scenario: ScenarioName;
  mathEngineVersion: string;
  calibrationProfileVersion: string | null;
  inputHash: string;
  inputs: Record<string, JsonValue>;
  assumptions: AssumptionSnapshot[];
  overrides: OverrideRecord[];
  calculations: CalculationSnapshot[];
  evidenceRefs: EvidenceLink[];
  createdAt: string;
  createdBy: string;
  adoptedAt: string | null;
  adoptedBy: string | null;
}

export interface AdoptionMetadata {
  actorId: string;
  adoptedAt: string;
}

export interface PlanStore {
  saveDraft(plan: PlanVersionRecord): Promise<void>;
  getPlanVersion(planVersionId: string): Promise<PlanVersionRecord | null>;
  listPlanVersions(campaignId: string): Promise<PlanVersionRecord[]>;
  adoptPlan(planVersionId: string, metadata: AdoptionMetadata): Promise<PlanVersionRecord>;
  createReforecast(parentPlanVersionId: string, draft: PlanVersionRecord): Promise<PlanVersionRecord>;
}
