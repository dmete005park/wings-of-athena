import { EvidenceReference } from './types';

/**
 * Calibration boundary.
 *
 * This file defines the SHAPE of a calibration profile. It must never contain
 * calibration VALUES.
 *
 * Formulas are arithmetic and belong in this public package. Empirical
 * defaults — turnout rates by history group, contact rates, flake rates,
 * production benchmarks, unit costs, alert thresholds — are proprietary
 * product inputs and belong in the private `@wings/calibration-profiles`
 * package, loaded at runtime by version reference.
 *
 * See docs/DATA_CLASSIFICATION.md.
 */

export type CalibrationProfileVersion = string;

export interface CalibrationValue {
  /** Assumption key from ASSUMPTION_REGISTRY. */
  assumptionKey: string;
  /** Cohort this estimate applies to, e.g. 'municipal.low_turnout'. */
  cohortKey?: string;
  estimate: number;
  rangeLow?: number;
  rangeHigh?: number;
  sampleSize?: number;
  evidence: EvidenceReference;
}

export interface AlertThreshold {
  ruleId: string;
  metricKey: string;
  severity: 'WATCH' | 'AT_RISK';
  comparator: 'LT' | 'LTE' | 'GT' | 'GTE';
  value: number;
  evidence: EvidenceReference;
}

export interface CalibrationProfile {
  version: CalibrationProfileVersion;
  status: 'DRAFT' | 'PUBLISHED' | 'SUPERSEDED';
  effectiveDate: string;
  cohortDescription?: string;
  values: readonly CalibrationValue[];
  alertThresholds: readonly AlertThreshold[];
}

/**
 * Loaded by the host application, never by the engine itself. The engine is
 * pure: it receives a profile, it does not fetch one.
 */
export interface CalibrationProvider {
  get(version: CalibrationProfileVersion): CalibrationProfile | undefined;
  listPublished(): readonly CalibrationProfileVersion[];
}

/**
 * Ships with the public engine so it runs standalone. Every empirical
 * assumption remains manager-supplied or PRODUCT_PLACEHOLDER. This is
 * deliberately empty: the public build has no empirical defaults.
 */
export const NULL_CALIBRATION_PROFILE: CalibrationProfile = {
  version: 'null-profile',
  status: 'PUBLISHED',
  effectiveDate: '1970-01-01',
  cohortDescription:
    'No empirical calibration. All assumptions are manager-supplied or placeholder.',
  values: [],
  alertThresholds: [],
};

export function resolveCalibrationValue(
  profile: CalibrationProfile,
  assumptionKey: string,
  cohortKey?: string
): CalibrationValue | undefined {
  const exact = profile.values.find(
    (value) => value.assumptionKey === assumptionKey && value.cohortKey === cohortKey
  );
  if (exact) return exact;
  return profile.values.find(
    (value) => value.assumptionKey === assumptionKey && value.cohortKey === undefined
  );
}

/**
 * Enforces Blueprint 7.2 at the render boundary. Restricted or proprietary
 * research may inform internal methodology but must never surface as a
 * customer-facing default or published benchmark.
 */
export function isCustomerFacingPermitted(evidence: EvidenceReference): boolean {
  const restriction = evidence.reuseRestriction?.trim().toUpperCase();
  if (!restriction) return true;
  return restriction === 'NONE' || restriction === 'PUBLIC';
}
