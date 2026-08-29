const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildScenarioPlan,
  createStarterScenario,
  majorityLineValue,
} = require('../dist/planBuilder.cjs');

const identity = {
  campaignId: 'campaign-test',
  planVersionId: 'plan-test',
  createdAt: '2026-08-29T00:00:00Z',
  createdBy: 'test',
};

/**
 * Invented round numbers. Expected electorate:
 * 300×0.8 + 400×0.5 + 300×0.2 = 240 + 200 + 60 = 500.
 */
function knownDraft(raceRule, targetShare = 0.4) {
  const draft = createStarterScenario('BASE');
  draft.campaign = {
    ...draft.campaign,
    eligibleVoters: 1000,
    highCount: 300,
    highTurnout: 0.8,
    midCount: 400,
    midTurnout: 0.5,
    lowCount: 300,
    lowTurnout: 0.2,
    targetShare,
    universeMultiplier: 2,
    raceRule,
  };
  return draft;
}

function snapshot(record, metricKey) {
  return record.calculations.find((item) => item.metricKey === metricKey);
}

test('a plurality race produces a plurality threshold and no majority line', async () => {
  const raceRule = { type: 'PLURALITY', expectedWinningShare: 0.4 };
  const { build, electorate, threshold, voteGoal, issues } = await buildScenarioPlan(knownDraft(raceRule), identity);

  assert.equal(electorate.value, 500);
  assert.equal(threshold.value, 200);
  assert.equal(voteGoal.value, 200);
  assert.equal(majorityLineValue(raceRule, threshold.value), null);

  const thresholdSnap = snapshot(build.record, 'victory.threshold');
  assert.equal(thresholdSnap.formulaId, 'victory.threshold.plurality.v0.2');
  assert.equal(thresholdSnap.modeledValue, 200);
  assert.equal(thresholdSnap.inputs.expectedElectorate, 500);
  assert.equal(thresholdSnap.inputs.rule.type, 'PLURALITY');
  assert.equal(thresholdSnap.inputs.rule.expectedWinningShare, 0.4);
  assert.equal(thresholdSnap.inputs.requiredShare, undefined);
  assert.equal(thresholdSnap.inputs.rule.requiredShare, undefined);

  assert.equal(
    issues.some((issue) => issue.code === 'GOAL_BELOW_THRESHOLD'),
    false,
    'a vote goal that meets the plurality share must not be flagged against a majority line',
  );
});

test('a majority race still produces the majority threshold', async () => {
  const raceRule = { type: 'MAJORITY', requiredShare: 0.5, strictlyGreater: true };
  const { build, electorate, threshold, voteGoal, issues } = await buildScenarioPlan(
    knownDraft(raceRule, 0.4),
    identity,
  );

  assert.equal(electorate.value, 500);
  assert.equal(threshold.value, 251);
  assert.equal(voteGoal.value, 200);
  assert.equal(majorityLineValue(raceRule, threshold.value), 251);

  const thresholdSnap = snapshot(build.record, 'victory.threshold');
  assert.equal(thresholdSnap.formulaId, 'victory.threshold.majority.v0.2');
  assert.equal(thresholdSnap.modeledValue, 251);
  assert.equal(thresholdSnap.inputs.expectedElectorate, 500);
  assert.equal(thresholdSnap.inputs.rule.type, 'MAJORITY');
  assert.equal(thresholdSnap.inputs.rule.requiredShare, 0.5);
  assert.equal(thresholdSnap.inputs.rule.strictlyGreater, true);

  assert.equal(
    issues.some((issue) => issue.code === 'GOAL_BELOW_THRESHOLD'),
    true,
    'a 0.4 target is below a strict majority of 251 on a 500-voter electorate',
  );
});

test('each snapshot inputs cover the formula parameters actually used', async () => {
  const raceRule = { type: 'PLURALITY', expectedWinningShare: 0.4 };
  const { build, electorate, threshold, voteGoal, universe } = await buildScenarioPlan(knownDraft(raceRule), identity);

  const electorateSnap = snapshot(build.record, 'electorate.expected.modeled');
  assert.equal(electorateSnap.modeledValue, electorate.value);
  assert.equal(electorateSnap.inputs.eligibleVoters, 1000);
  assert.equal(electorateSnap.inputs.segmentsAreMutuallyExclusive, true);
  assert.deepEqual(electorateSnap.inputs.segments, [
    { id: 'high', label: 'High-frequency', count: 300, turnoutProbability: 0.8 },
    { id: 'mid', label: 'Medium-frequency', count: 400, turnoutProbability: 0.5 },
    { id: 'low', label: 'Low-frequency', count: 300, turnoutProbability: 0.2 },
  ]);

  const thresholdSnap = snapshot(build.record, 'victory.threshold');
  assert.equal(thresholdSnap.inputs.expectedElectorate, electorate.value);
  assert.deepEqual(thresholdSnap.inputs.rule, raceRule);

  const voteGoalSnap = snapshot(build.record, 'victory.vote_goal');
  assert.equal(voteGoalSnap.modeledValue, voteGoal.value);
  assert.equal(voteGoalSnap.inputs.adoptedExpectedElectorate, electorate.value);
  assert.equal(voteGoalSnap.inputs.adoptedTargetShare, 0.4);
  assert.equal(voteGoalSnap.inputs.mathematicalThreshold, threshold.value);

  const universeSnap = snapshot(build.record, 'universe.strategic_desired');
  assert.equal(universeSnap.modeledValue, universe.value);
  assert.equal(universeSnap.inputs.voteGoal, voteGoal.value);
  assert.deepEqual(universeSnap.inputs.method, { type: 'VOTE_GOAL_MULTIPLIER', multiplier: 2 });
});
