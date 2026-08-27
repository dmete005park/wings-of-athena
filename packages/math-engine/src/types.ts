export type EvidenceClass =
  | 'MATHEMATICAL'
  | 'DOCUMENTED_PRACTICE'
  | 'OBSERVATIONAL_BENCHMARK'
  | 'EXPERIMENTAL_ESTIMATE'
  | 'META_ANALYTIC_ESTIMATE'
  | 'MANAGER_ASSUMPTION'
  | 'PRODUCT_PLACEHOLDER';

export type ValueType =
  | 'RAW_INPUT'
  | 'PLANNING_ASSUMPTION'
  | 'DERIVED'
  | 'OVERRIDE'
  | 'OBSERVED'
  | 'ADOPTED';

export interface EvidenceReference {
  evidenceClass: EvidenceClass;
  sourceId?: string;
  sourceVersion?: string;
  sampleSize?: number;
  estimate?: number;
  rangeLow?: number;
  rangeHigh?: number;
  studyDesign?: string;
  electionContext?: string;
  populationApplicability?: string;
  reuseRestriction?: string;
  notes?: string;
}

export interface ValidationIssue {
  level: 'ERROR' | 'WARNING';
  code: string;
  message: string;
}

export interface Calculation<T> {
  value: T | null;
  issues: ValidationIssue[];
}

export interface ElectorateSegment {
  id: string;
  label: string;
  count: number;
  turnoutProbability: number;
  isRemainder?: boolean;
  evidence?: EvidenceReference;
}

export type RaceRule =
  | { type: 'MAJORITY'; requiredShare: number; strictlyGreater?: boolean }
  | { type: 'PLURALITY'; expectedWinningShare: number }
  | { type: 'RUNOFF'; advancementTargetShare: number }
  | { type: 'OTHER'; targetShare: number; label: string };

export type UniverseMethod =
  | { type: 'MANAGER_SET'; count: number }
  | { type: 'IMPORTED'; count: number; sourceId?: string }
  | { type: 'VOTE_GOAL_MULTIPLIER'; multiplier: number }
  | { type: 'MODEL_FILTER'; count: number; modelVersion?: string };

export type ProgramObjectiveType =
  | 'SUPPORT_ID'
  | 'PERSUASION'
  | 'GOTV'
  | 'REGISTRATION'
  | 'BALLOT_REQUEST'
  | 'VOLUNTEER_RECRUITMENT'
  | 'CUSTOM';

export interface ProgramObjective {
  id: string;
  type: ProgramObjectiveType;
  label: string;
  targetMetricKey: string;
  targetValue?: number;
  unit: string;
  enabled: boolean;
}

export interface OutreachPlanInput {
  uniqueReachTarget: number;
  contactDepthTarget: number;
  perAttemptContactRate: number;
  reachableUniverse?: number;
}

export type AlertSeverity = 'WATCH' | 'AT_RISK';
export type WinningPathStatus = 'ON_TRACK' | 'WATCH' | 'AT_RISK' | 'UNAVAILABLE';

export interface DecisionAlert {
  code: string;
  severity: AlertSeverity;
  message: string;
  metricKey?: string;
  currentValue?: number | null;
  threshold?: number | null;
  ruleId?: string;
}

export interface WinningPathStatusResult {
  status: WinningPathStatus;
  triggeringAlerts: DecisionAlert[];
  triggeringRuleIds: string[];
  missingRequiredInputs: string[];
}
