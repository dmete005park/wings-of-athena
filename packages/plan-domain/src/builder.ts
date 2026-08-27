import { CalculationSnapshot, JsonValue, PlanSectionStatus, PlanVersionRecord } from './types';
import { computeInputHash } from './hash';

export type CalculationSnapshotDraft = Omit<CalculationSnapshot, 'inputHash'>;

export interface PlanRecordDraft extends Omit<PlanVersionRecord, 'inputHash' | 'calculations' | 'sectionStatuses'> {
  inputs: Record<string, JsonValue>;
  calculations: CalculationSnapshotDraft[];
}

export interface PlanBuildResult {
  record: PlanVersionRecord;
  sectionStatuses: PlanSectionStatus[];
  readyForAdoption: boolean;
  missingRequiredKeys: string[];
}

export function buildPlanVersionRecord(
  draft: PlanRecordDraft,
  sectionStatuses: PlanSectionStatus[],
): PlanBuildResult {
  const inputHash = computeInputHash(draft.inputs);
  const calculations: CalculationSnapshot[] = draft.calculations.map((snapshot) => ({
    ...snapshot,
    inputHash,
  }));
  const statuses = sectionStatuses.map((section) => ({
    ...section,
    missingKeys: [...section.missingKeys],
  }));
  const incompleteRequired = statuses.filter(
    (section) => section.requiredForAdoption && section.status !== 'COMPLETE',
  );

  const record: PlanVersionRecord = {
    ...draft,
    inputHash,
    calculations,
    sectionStatuses: statuses,
  };

  return {
    record,
    sectionStatuses: statuses,
    readyForAdoption: incompleteRequired.length === 0,
    missingRequiredKeys: incompleteRequired.flatMap((section) =>
      section.missingKeys.map((key) => `${section.sectionKey}.${key}`),
    ),
  };
}
