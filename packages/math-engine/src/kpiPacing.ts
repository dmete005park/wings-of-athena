import { calculatePace, PaceInput, PaceResult } from './pacing';
import { DecisionAlert, WinningPathStatus } from './types';

/**
 * Per-KPI pacing status for Command Center. Deterministic and non-empirical:
 * every state boundary is a comparison between quantities the plan and the
 * imported actuals already carry, never a calibrated tolerance band. Alert
 * severities (WATCH / AT_RISK) come from these comparisons, not from magic
 * thresholds — calibrated alert rules, if any, live in the private calibration
 * package, not here.
 *
 * Boundaries:
 * - Missing actuals (no completed actual, or no recent pace to project with and
 *   the goal is not already met) → UNAVAILABLE. Rendered as NO DATA, never a
 *   performance state.
 * - Projected to meet or exceed the goal → ON_TRACK.
 * - Projected to fall short, but recent pace is at or above the pace the adopted
 *   plan originally assumed → WATCH (behind the pace needed now, but not below
 *   the plan's own pace).
 * - Projected to fall short and recent pace is below the plan's original pace,
 *   or there is no original pace to compare against → AT_RISK.
 */
export interface KpiPaceInput extends PaceInput {
  metricKey: string;
  /**
   * The daily pace the adopted plan originally assumed: adopted goal divided by
   * the plan's horizon at adoption. Optional — when absent, a projected
   * shortfall is AT_RISK because there is no plan pace to have merely slipped
   * from.
   */
  originalPlannedDailyPace?: number;
  /** Whether a completed-actual figure has been imported for this KPI. */
  hasActuals: boolean;
}

export interface KpiPaceResult {
  metricKey: string;
  status: WinningPathStatus;
  pace: PaceResult | null;
  alert: DecisionAlert | null;
  missingInputs: string[];
}

function unavailable(metricKey: string, missingInputs: string[], pace: PaceResult | null): KpiPaceResult {
  return { metricKey, status: 'UNAVAILABLE', pace, alert: null, missingInputs };
}

export function classifyKpiPace(input: KpiPaceInput): KpiPaceResult {
  if (!input.hasActuals) {
    return unavailable(input.metricKey, ['completedActual'], null);
  }

  const paceCalc = calculatePace(input);
  if (paceCalc.value === null) {
    return unavailable(input.metricKey, ['validPaceInputs'], null);
  }

  const pace = paceCalc.value;
  const { projectedFinal, projectedShortfall, remainingGoal } = pace;

  // Cannot project without a recent pace, unless the goal is already met.
  if (projectedFinal === null) {
    if (remainingGoal === 0) {
      return { metricKey: input.metricKey, status: 'ON_TRACK', pace, alert: null, missingInputs: [] };
    }
    return unavailable(input.metricKey, ['observedRecentDailyPace'], pace);
  }

  if ((projectedShortfall ?? 0) <= 0) {
    return { metricKey: input.metricKey, status: 'ON_TRACK', pace, alert: null, missingInputs: [] };
  }

  const recentPace = input.observedRecentDailyPace;
  const belowPlanPace =
    input.originalPlannedDailyPace === undefined ||
    recentPace === undefined ||
    recentPace < input.originalPlannedDailyPace;

  const severity = belowPlanPace ? 'AT_RISK' : 'WATCH';
  const ruleId = belowPlanPace
    ? (input.originalPlannedDailyPace === undefined ? 'pace.projected_shortfall' : 'pace.below_plan_pace')
    : 'pace.behind_required.recoverable';
  const message = belowPlanPace
    ? (input.originalPlannedDailyPace === undefined
        ? 'Projected to miss the goal at the current pace.'
        : "Projected to miss the goal — recent pace is below the adopted plan's pace.")
    : "Behind the pace needed to finish on time, but still at or above the adopted plan's pace.";

  const alert: DecisionAlert = {
    code: 'PACE_PROJECTED_SHORTFALL',
    severity,
    message,
    metricKey: input.metricKey,
    currentValue: projectedFinal,
    threshold: input.adoptedGoal,
    ruleId,
  };

  return { metricKey: input.metricKey, status: severity, pace, alert, missingInputs: [] };
}
