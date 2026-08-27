const test = require('node:test');
const assert = require('node:assert/strict');
const {
  aggregateCrossChannelUniqueReach,
  calculateCampaignVoteGoal,
  calculateCapacity,
  calculateExpectedElectorate,
  calculateOutreachPlan,
  calculateRaceThreshold,
  calculateSupportIdObjective,
  capacitySupportedUniverse,
  constructStrategicUniverse,
  deriveWinningPathStatus
} = require('../dist');

test('generic weighted electorate segments calculate expected electorate', () => {
  const result = calculateExpectedElectorate({
    eligibleVoters: 1000,
    segmentsAreMutuallyExclusive: true,
    segments: [
      { id: 'high', label: 'High frequency', count: 300, turnoutProbability: 0.8 },
      { id: 'medium', label: 'Medium frequency', count: 400, turnoutProbability: 0.5 },
      { id: 'remainder', label: 'Other', count: 300, turnoutProbability: 0.2, isRemainder: true }
    ]
  });
  assert.equal(result.value, 500);
  assert.equal(result.issues.length, 0);
});

test('weighted electorate rejects overlapping segment method', () => {
  const result = calculateExpectedElectorate({ eligibleVoters: 100, segmentsAreMutuallyExclusive: false, segments: [] });
  assert.equal(result.value, null);
  assert.ok(result.issues.some((i) => i.code === 'OVERLAPPING_SEGMENTS'));
});

test('incomplete electorate coverage warns but does not fabricate remainder', () => {
  const result = calculateExpectedElectorate({
    eligibleVoters: 1000,
    segmentsAreMutuallyExclusive: true,
    segments: [{ id: 'known', label: 'Known', count: 800, turnoutProbability: 0.5 }]
  });
  assert.equal(result.value, 400);
  assert.ok(result.issues.some((i) => i.code === 'INCOMPLETE_SEGMENT_COVERAGE'));
});

test('majority threshold is floor(E/2)+1 for strict 50 percent rule', () => {
  const result = calculateRaceThreshold(1000, { type: 'MAJORITY', requiredShare: 0.5 });
  assert.equal(result.value, 501);
});

test('campaign vote goal has no hard-coded 52 percent assumption', () => {
  const result = calculateCampaignVoteGoal({ adoptedExpectedElectorate: 1000, adoptedTargetShare: 0.51, mathematicalThreshold: 501 });
  assert.equal(result.value, 510);
});

test('universe multiplier is optional construction method, not capacity', () => {
  const strategic = constructStrategicUniverse(1000, { type: 'VOTE_GOAL_MULTIPLIER', multiplier: 1.5 });
  assert.equal(strategic.value, 1500);
  const capacity = capacitySupportedUniverse(1200, 2);
  assert.equal(capacity.value, 600);
  assert.notEqual(strategic.value, capacity.value);
});

test('outreach attempts are unique reach times contact depth', () => {
  const result = calculateOutreachPlan({ uniqueReachTarget: 1000, contactDepthTarget: 2.5, perAttemptContactRate: 0.2, reachableUniverse: 1200 });
  assert.equal(result.value?.attemptsGoal, 2500);
  assert.equal(result.value?.expectedSuccessfulContacts, 500);
});

test('positive unique reach requires at least one average attempt per targeted voter', () => {
  const result = calculateOutreachPlan({ uniqueReachTarget: 1000, contactDepthTarget: 0.5, perAttemptContactRate: 0.2 });
  assert.equal(result.value, null);
  assert.ok(result.issues.some((i) => i.code === 'CONTACT_DEPTH_BELOW_ONE'));
});

test('outreach flags reachability constraint rather than silently reducing reach', () => {
  const result = calculateOutreachPlan({ uniqueReachTarget: 1000, contactDepthTarget: 2, perAttemptContactRate: 0.2, reachableUniverse: 800 });
  assert.equal(result.value?.attemptsGoal, 2000);
  assert.ok(result.issues.some((i) => i.code === 'REACHABILITY_CONSTRAINED'));
});

test('cross-channel unique reach is unavailable without deduplication or overlap method', () => {
  const result = aggregateCrossChannelUniqueReach({});
  assert.equal(result.value, null);
  assert.ok(result.issues.some((i) => i.code === 'CROSS_CHANNEL_REACH_UNAVAILABLE'));
});

test('support IDs are an optional objective calculation', () => {
  const result = calculateSupportIdObjective({ campaignVoteGoal: 1000, idCoverageTarget: 0.5, supporterTurnoutRate: 0.8 });
  assert.equal(result.value?.supportIdVoteTarget, 500);
  assert.equal(result.value?.requiredSupportIds, 625);
});

test('capacity rounds required completed shifts up', () => {
  const result = calculateCapacity({ attemptsGoal: 1001, attemptsPerCompletedShift: 40, workers: 10, completedShiftsPerWorker: 3, volunteerFlakeRate: 0.2 });
  assert.equal(result.value?.completedShiftsRequired, 26);
  assert.equal(result.value?.attemptCapacity, 1200);
  assert.equal(result.value?.scheduledShiftsRequired, 33);
});

test('capacity calculates the minimum additional shifts required to close a shortfall', () => {
  const result = calculateCapacity({ attemptsGoal: 2000, attemptsPerCompletedShift: 40, workers: 10, completedShiftsPerWorker: 3, volunteerFlakeRate: 0.2 });
  assert.equal(result.value?.attemptCapacity, 1200);
  assert.equal(result.value?.attemptShortfall, 800);
  assert.equal(result.value?.additionalCompletedShiftsRequired, 20);
  assert.equal(result.value?.additionalScheduledShiftsRequired, 25);
});

test('winning path status is deterministic and exposes rule IDs', () => {
  assert.equal(deriveWinningPathStatus([]).status, 'ON_TRACK');
  const watch = deriveWinningPathStatus([{ code: 'PACE', ruleId: 'pace.field.watch', severity: 'WATCH', message: 'Pace below plan' }]);
  assert.equal(watch.status, 'WATCH');
  assert.deepEqual(watch.triggeringRuleIds, ['pace.field.watch']);

  const atRisk = deriveWinningPathStatus([
    { code: 'PACE', ruleId: 'pace.field.watch', severity: 'WATCH', message: 'Pace below plan' },
    { code: 'CAPACITY', ruleId: 'capacity.field.at-risk', severity: 'AT_RISK', message: 'Capacity cannot complete adopted work' }
  ]);
  assert.equal(atRisk.status, 'AT_RISK');
  assert.equal(atRisk.triggeringAlerts.length, 2);
  assert.deepEqual(atRisk.triggeringRuleIds, ['pace.field.watch', 'capacity.field.at-risk']);
});

test('winning path is unavailable when required inputs are missing', () => {
  const result = deriveWinningPathStatus({
    activeAlerts: [],
    missingRequiredInputs: ['pacing.remaining_active_days', 'actuals.completed_attempts']
  });
  assert.equal(result.status, 'UNAVAILABLE');
  assert.deepEqual(result.missingRequiredInputs, ['pacing.remaining_active_days', 'actuals.completed_attempts']);
});
