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
  inputHash: string;
}

export type FeasibilityConstraintType = 'CAPACITY' | 'COST' | 'REACHABILITY' | 'ALLOCATION' | 'OTHER';

export interface FeasibilityGapRecord {
  gapId: string;
  constraintType: FeasibilityConstraintType;
  strategicMetricKey: string;
  strategicValue: number;
  operationalMetricKey: string;
  operationalValue: number;
  gap: number;
  requiresAcknowledgment: boolean;
}

export interface FeasibilityAcknowledgment {
  acknowledgmentId: string;
  gapId: string;
  gapFingerprint: string;
  constraintType: FeasibilityConstraintType;
  strategicMetricKey: string;
  strategicValue: number;
  operationalMetricKey: string;
  operationalValue: number;
  gap: number;
  reason: string;
  actorId: string;
  acknowledgedAt: string;
}

export type PlanSectionCompletion = 'COMPLETE' | 'INCOMPLETE';

export interface PlanSectionStatus {
  sectionKey: string;
  requiredForAdoption: boolean;
  status: PlanSectionCompletion;
  missingKeys: string[];
}

export type RequirementRule =
  | { type: 'ALWAYS' }
  | { type: 'NEVER' }
  | { type: 'ANY_OBJECTIVE_ENABLED' }
  | { type: 'OBJECTIVE_ENABLED'; objectiveIds: string[] };

export interface PlanFieldRequirement {
  key: string;
  present: boolean;
  requiredWhen: RequirementRule;
}

export interface PlanSectionDefinition {
  sectionKey: string;
  requiredWhen: RequirementRule;
  fields: PlanFieldRequirement[];
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
  feasibilityGaps: FeasibilityGapRecord[];
  feasibilityAcknowledgments: FeasibilityAcknowledgment[];
  sectionStatuses?: PlanSectionStatus[];
  createdAt: string;
  createdBy: string;
  adoptedAt: string | null;
  adoptedBy: string | null;
}

export interface AdoptionMetadata {
  actorId: string;
  adoptedAt: string;
  expectedInputHash: string;
}

export type AdoptionErrorCode =
  | 'PLAN_SECTION_INCOMPLETE'
  | 'PLAN_RECALC_REQUIRED'
  | 'FEASIBILITY_ACK_REQUIRED'
  | 'FEASIBILITY_ACK_STALE';

export interface AdoptionErrorContext {
  sectionKey?: string;
  missingKeys?: string[];
  gapId?: string;
  previousGap?: FeasibilityGapRecord;
  currentGap?: FeasibilityGapRecord;
}

export interface PlanStore {
  saveDraft(plan: PlanVersionRecord): Promise<void>;
  getPlanVersion(planVersionId: string): Promise<PlanVersionRecord | null>;
  listPlanVersions(campaignId: string): Promise<PlanVersionRecord[]>;
  adoptPlan(planVersionId: string, metadata: AdoptionMetadata): Promise<PlanVersionRecord>;
  createReforecast(parentPlanVersionId: string, draft: PlanVersionRecord): Promise<PlanVersionRecord>;
}
