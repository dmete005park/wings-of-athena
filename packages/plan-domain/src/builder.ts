import {
  CalculationSnapshot,
  JsonValue,
  PlanSectionDefinition,
  PlanSectionStatus,
  PlanVersionRecord,
  RequirementRule,
} from './types';
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

function requirementApplies(rule: RequirementRule, enabledObjectives: Set<string>): boolean {
  switch (rule.type) {
    case 'ALWAYS': return true;
    case 'NEVER': return false;
    case 'ANY_OBJECTIVE_ENABLED': return enabledObjectives.size > 0;
    case 'OBJECTIVE_ENABLED': return rule.objectiveIds.some((objectiveId) => enabledObjectives.has(objectiveId));
  }
}

export function evaluatePlanSectionStatuses(
  definitions: PlanSectionDefinition[],
  enabledObjectiveIds: string[],
): PlanSectionStatus[] {
  const enabledObjectives = new Set(enabledObjectiveIds);
  return definitions.map((section) => {
    const requiredFields = section.fields.filter((field) => requirementApplies(field.requiredWhen, enabledObjectives));
    const requiredForAdoption = requirementApplies(section.requiredWhen, enabledObjectives) || requiredFields.length > 0;
    const missingKeys = requiredForAdoption
      ? requiredFields.filter((field) => !field.present).map((field) => field.key)
      : [];
    return {
      sectionKey: section.sectionKey,
      requiredForAdoption,
      status: missingKeys.length === 0 ? 'COMPLETE' : 'INCOMPLETE',
      missingKeys,
    };
  });
}

function isDefinition(value: PlanSectionDefinition | PlanSectionStatus): value is PlanSectionDefinition {
  return Array.isArray((value as PlanSectionDefinition).fields);
}

export function buildPlanVersionRecord(
  draft: PlanRecordDraft,
  sections: Array<PlanSectionDefinition | PlanSectionStatus>,
  enabledObjectiveIds: string[] = [],
): PlanBuildResult {
  const normalizedObjectives = [...new Set(enabledObjectiveIds)].sort();
  const inputs: Record<string, JsonValue> = {
    ...draft.inputs,
    enabledObjectiveIds: normalizedObjectives,
  };
  const inputHash = computeInputHash(inputs);
  const calculations: CalculationSnapshot[] = draft.calculations.map((snapshot) => ({ ...snapshot, inputHash }));

  const statuses = sections.every(isDefinition)
    ? evaluatePlanSectionStatuses(sections, normalizedObjectives)
    : (sections as PlanSectionStatus[]).map((section) => ({ ...section, missingKeys: [...section.missingKeys] }));

  const incompleteRequired = statuses.filter(
    (section) => section.requiredForAdoption && section.status !== 'COMPLETE',
  );

  const record: PlanVersionRecord = {
    ...draft,
    inputs,
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
