import { DecisionAlert, WinningPathStatusResult } from './types';

/**
 * Deterministic manager-facing status. This is intentionally not a score.
 * Any active AT_RISK alert dominates WATCH; any WATCH dominates ON_TRACK.
 */
export function deriveWinningPathStatus(activeAlerts: readonly DecisionAlert[]): WinningPathStatusResult {
  const atRisk = activeAlerts.filter((alert) => alert.severity === 'AT_RISK');
  if (atRisk.length > 0) return { status: 'AT_RISK', triggeringAlerts: [...atRisk, ...activeAlerts.filter((alert) => alert.severity === 'WATCH')] };

  const watch = activeAlerts.filter((alert) => alert.severity === 'WATCH');
  if (watch.length > 0) return { status: 'WATCH', triggeringAlerts: watch };

  return { status: 'ON_TRACK', triggeringAlerts: [] };
}
