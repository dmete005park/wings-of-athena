const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyKpiPace, deriveWinningPathStatus } = require('../dist');

// Synthetic round numbers only. Goal 10000, original horizon 100 days -> plan pace 100/day.
function base(overrides) {
  return {
    metricKey: 'victory.vote_goal',
    adoptedGoal: 10000,
    completedActual: 4000,
    remainingActiveDays: 40, // remaining goal 6000 -> required 150/day
    originalPlannedDailyPace: 100,
    hasActuals: true,
    ...overrides,
  };
}

test('no imported actuals is UNAVAILABLE (NO DATA), never a performance state', () => {
  const result = classifyKpiPace(base({ hasActuals: false, completedActual: 0 }));
  assert.equal(result.status, 'UNAVAILABLE');
  assert.equal(result.alert, null);
  assert.deepEqual(result.missingInputs, ['completedActual']);
});

test('actuals present but no recent pace cannot project and is UNAVAILABLE', () => {
  const result = classifyKpiPace(base({ observedRecentDailyPace: undefined }));
  assert.equal(result.status, 'UNAVAILABLE');
  assert.deepEqual(result.missingInputs, ['observedRecentDailyPace']);
});

test('goal already met with no recent pace is ON_TRACK', () => {
  const result = classifyKpiPace(base({ completedActual: 10000, observedRecentDailyPace: undefined }));
  assert.equal(result.status, 'ON_TRACK');
});

test('recent pace meeting required pace projects to goal: ON_TRACK', () => {
  const result = classifyKpiPace(base({ observedRecentDailyPace: 160 })); // 4000 + 160*40 = 10400
  assert.equal(result.status, 'ON_TRACK');
  assert.equal(result.alert, null);
});

test('projected shortfall but recent pace at/above plan pace: WATCH', () => {
  const result = classifyKpiPace(base({ observedRecentDailyPace: 120 })); // 8800 < 10000, 120 >= 100
  assert.equal(result.status, 'WATCH');
  assert.equal(result.alert.severity, 'WATCH');
  assert.equal(result.alert.ruleId, 'pace.behind_required.recoverable');
});

test('projected shortfall with recent pace below plan pace: AT_RISK', () => {
  const result = classifyKpiPace(base({ observedRecentDailyPace: 80 })); // 7200 < 10000, 80 < 100
  assert.equal(result.status, 'AT_RISK');
  assert.equal(result.alert.severity, 'AT_RISK');
  assert.equal(result.alert.ruleId, 'pace.below_plan_pace');
});

test('projected shortfall with no plan pace to compare against: AT_RISK', () => {
  const result = classifyKpiPace(base({ observedRecentDailyPace: 120, originalPlannedDailyPace: undefined }));
  assert.equal(result.status, 'AT_RISK');
  assert.equal(result.alert.ruleId, 'pace.projected_shortfall');
});

test('overall campaign status is the worst among active KPIs, never averaged', () => {
  const onTrack = classifyKpiPace(base({ metricKey: 'universe.strategic_desired', observedRecentDailyPace: 160 }));
  const watch = classifyKpiPace(base({ metricKey: 'victory.vote_goal', observedRecentDailyPace: 120 }));
  const activeAlerts = [onTrack.alert, watch.alert].filter(Boolean);
  const overall = deriveWinningPathStatus(activeAlerts);
  assert.equal(overall.status, 'WATCH');
  assert.deepEqual(overall.triggeringRuleIds, ['pace.behind_required.recoverable']);

  const atRisk = classifyKpiPace(base({ metricKey: 'victory.vote_goal', observedRecentDailyPace: 80 }));
  const worst = deriveWinningPathStatus([onTrack.alert, watch.alert, atRisk.alert].filter(Boolean));
  assert.equal(worst.status, 'AT_RISK');
});
