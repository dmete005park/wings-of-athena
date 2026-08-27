import { DecisionAlert, WinningPathStatusResult } from './types';

export interface WinningPathStatusInput {
  activeAlerts: readonly DecisionAlert[];
  missingRequiredInputs?: readonly string[];
}

/**
 * Deterministic manager-facing status. This is intentionally not a score.
 * Missing required inputs make status unavailable rather than optimistically ON_TRACK.
 * Any active AT_RISK alert dominates WATCH; any WATCH dominates ON_TRACK.
 */
export function deriveWinningPathStatus(input: WinningPathStatusInput | readonly DecisionAlert[]): WinningPathStatusResult {
  const activeAlerts = Array.isArray(input) ? input : input.activeAlerts;
  const missingRequiredInputs = Array.isArray(input) ? [] : [...(input.missingRequiredInputs ?? [])];
  const triggeringRuleIds = activeAlerts
    .map((alert) => alert.ruleId ?? alert.code)
    .filter((value, index, values) => values.indexOf(value) === index);

  if (missingRequiredInputs.length > 0) {
    return {
      status: 'UNAVAILABLE',
      triggeringAlerts: [...activeAlerts],
      triggeringRuleIds,
      missingRequiredInputs,
    };
  }

  const atRisk = activeAlerts.filter((alert) => alert.severity === 'AT_RISK');
  if (atRisk.length > 0) {
    const watch = activeAlerts.filter((alert) => alert.severity === 'WATCH');
    return {
      status: 'AT_RISK',
      triggeringAlerts: [...atRisk, ...watch],
      triggeringRuleIds,
      missingRequiredInputs: [],
    };
  }

  const watch = activeAlerts.filter((alert) => alert.severity === 'WATCH');
  if (watch.length > 0) {
    return {
      status: 'WATCH',
      triggeringAlerts: watch,
      triggeringRuleIds,
      missingRequiredInputs: [],
    };
  }

  return {
    status: 'ON_TRACK',
    triggeringAlerts: [],
    triggeringRuleIds: [],
    missingRequiredInputs: [],
  };
}
