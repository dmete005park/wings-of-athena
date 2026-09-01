const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildScenarioPlan,
  createStarterScenario,
  majorityLineValue,
} = require('../dist/planBuilder.cjs');
const { incompleteItems } = require('../dist/adoptLabels.cjs');

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

/**
 * Invented channel program on the 500-voter / 200-vote-goal plurality fixture.
 * unique reach 1000 × depth 2 → 2000 attempts; × 0.5 contact rate → 1000 contacts.
 * 2000 attempts at 40 per shift → 50 shifts.
 * Support-ID funnel at 0.5 conversion and 0.5 turnout → 500 IDs, 250 votes; need 200.
 * Inverse: required IDs 400, contacts 800, attempts 1600, shifts 40.
 * Break-even at this program size: contact rate 0.4, conversion 0.4, 32 attempts/shift.
 */
function knownOutreachDraft() {
  const draft = knownDraft({ type: 'PLURALITY', expectedWinningShare: 0.4 }, 0.4);
  draft.programBudget.supportIdEnabled = true;
  draft.programBudget.supportIdCoverageTarget = 1;
  draft.programBudget.supporterTurnoutRate = 0.5;
  draft.programBudget.idConversionRate = 0.5;
  draft.programBudget.resourcePoolWorkers = 10;
  draft.programBudget.completedShiftsPerWorker = 5;
  draft.programBudget.channels.doors = {
    enabled: true,
    uniqueReachTarget: 1000,
    reachableUniverse: 1200,
    contactDepthTarget: 2,
    attemptsPerCompletedShift: 40,
    allocatedCompletedShifts: 50,
    perAttemptContactRate: 0.5,
    volunteerFlakeRate: null,
    costPerCompletedShift: null,
  };
  return draft;
}

test('outreach chain uses engine functions and records snapshots for a known input set', async () => {
  const { build, voteGoal, outreachChains } = await buildScenarioPlan(knownOutreachDraft(), identity);

  assert.equal(voteGoal.value, 200);
  assert.equal(outreachChains.length, 1);
  const chain = outreachChains[0];
  assert.equal(chain.channelId, 'doors');
  assert.equal(chain.attempts, 2000);
  assert.equal(chain.contacts, 1000);
  assert.equal(chain.shifts, 50);
  assert.equal(chain.ids, 500);
  assert.equal(chain.votes, 250);
  assert.equal(chain.votesNeeded, 200);
  assert.equal(chain.requiredIds, 400);
  assert.equal(chain.requiredContacts, 800);
  assert.equal(chain.requiredAttempts, 1600);
  assert.equal(chain.requiredShifts, 40);
  assert.equal(chain.breakEvenContactRate, 0.4);
  assert.equal(chain.breakEvenIdConversionRate, 0.4);
  assert.equal(chain.breakEvenAttemptsPerShift, 32);

  const attemptsSnap = snapshot(build.record, 'outreach.attempts_goal.doors');
  assert.equal(attemptsSnap.formulaId, 'outreach.attempts.v0.2');
  assert.equal(attemptsSnap.modeledValue, 2000);
  assert.equal(attemptsSnap.inputs.uniqueReachTarget, 1000);
  assert.equal(attemptsSnap.inputs.contactDepthTarget, 2);
  assert.equal(attemptsSnap.inputs.perAttemptContactRate, 0.5);
  assert.equal(attemptsSnap.inputs.reachableUniverse, 1200);

  const contactsSnap = snapshot(build.record, 'outreach.successful_contacts_expected.doors');
  assert.equal(contactsSnap.formulaId, 'outreach.contacts.v0.2');
  assert.equal(contactsSnap.modeledValue, 1000);
  assert.equal(contactsSnap.inputs.uniqueReachTarget, 1000);
  assert.equal(contactsSnap.inputs.contactDepthTarget, 2);
  assert.equal(contactsSnap.inputs.perAttemptContactRate, 0.5);
  assert.equal(contactsSnap.inputs.reachableUniverse, 1200);

  const inverseSnap = snapshot(build.record, 'outreach.attempts_required.doors');
  assert.equal(inverseSnap.formulaId, 'outreach.attempts_required.v0.2');
  assert.equal(inverseSnap.modeledValue, 1600);
  assert.equal(inverseSnap.inputs.desiredSuccessfulContacts, 800);
  assert.equal(inverseSnap.inputs.perAttemptContactRate, 0.5);
  assert.equal(snapshot(build.record, 'outreach.attempts_for_contact_goal.doors'), undefined);

  const requiredIdsSnap = snapshot(build.record, 'outreach.ids_required.doors');
  assert.equal(requiredIdsSnap.formulaId, 'outreach.ids_required.v0.2');
  assert.equal(requiredIdsSnap.modeledValue, 400);
  assert.equal(requiredIdsSnap.inputs.requiredVotes, 200);
  assert.equal(requiredIdsSnap.inputs.supporterTurnoutRate, 0.5);

  const requiredContactsSnap = snapshot(build.record, 'outreach.contacts_required.doors');
  assert.equal(requiredContactsSnap.formulaId, 'outreach.contacts_required.v0.2');
  assert.equal(requiredContactsSnap.modeledValue, 800);
  assert.equal(requiredContactsSnap.inputs.requiredIds, 400);
  assert.equal(requiredContactsSnap.inputs.idConversionRate, 0.5);

  const requiredShiftsSnap = snapshot(build.record, 'capacity.shifts_required_for_vote_goal.doors');
  assert.equal(requiredShiftsSnap.formulaId, 'capacity.shifts_required_for_vote_goal.v0.2');
  assert.equal(requiredShiftsSnap.modeledValue, 40);
  assert.equal(requiredShiftsSnap.inputs.requiredAttempts, 1600);
  assert.equal(requiredShiftsSnap.inputs.attemptsPerCompletedShift, 40);

  const breakEvenContactSnap = snapshot(build.record, 'program.breakeven.contact_rate.doors');
  assert.equal(breakEvenContactSnap.formulaId, 'program.breakeven.contact_rate.v0.2');
  assert.equal(breakEvenContactSnap.modeledValue, 0.4);
  assert.equal(breakEvenContactSnap.inputs.votesNeeded, 200);
  assert.equal(breakEvenContactSnap.inputs.attempts, 2000);
  assert.equal(breakEvenContactSnap.inputs.idConversionRate, 0.5);
  assert.equal(breakEvenContactSnap.inputs.supporterTurnoutRate, 0.5);

  const breakEvenConversionSnap = snapshot(build.record, 'program.breakeven.id_conversion_rate.doors');
  assert.equal(breakEvenConversionSnap.formulaId, 'program.breakeven.id_conversion_rate.v0.2');
  assert.equal(breakEvenConversionSnap.modeledValue, 0.4);
  assert.equal(breakEvenConversionSnap.inputs.votesNeeded, 200);
  assert.equal(breakEvenConversionSnap.inputs.contacts, 1000);
  assert.equal(breakEvenConversionSnap.inputs.supporterTurnoutRate, 0.5);

  const breakEvenProductivitySnap = snapshot(build.record, 'program.breakeven.attempts_per_shift.doors');
  assert.equal(breakEvenProductivitySnap.formulaId, 'program.breakeven.attempts_per_shift.v0.2');
  assert.equal(breakEvenProductivitySnap.modeledValue, 32);
  assert.equal(breakEvenProductivitySnap.inputs.votesNeeded, 200);
  assert.equal(breakEvenProductivitySnap.inputs.shifts, 50);
  assert.equal(breakEvenProductivitySnap.inputs.perAttemptContactRate, 0.5);
  assert.equal(breakEvenProductivitySnap.inputs.idConversionRate, 0.5);
  assert.equal(breakEvenProductivitySnap.inputs.supporterTurnoutRate, 0.5);

  const shiftsSnap = snapshot(build.record, 'capacity.completed_shifts_required.doors');
  assert.equal(shiftsSnap.formulaId, 'capacity.shifts.v0.2');
  assert.equal(shiftsSnap.modeledValue, 50);
  assert.equal(shiftsSnap.inputs.attemptsGoal, 2000);
  assert.equal(shiftsSnap.inputs.attemptsPerCompletedShift, 40);
  assert.equal(shiftsSnap.inputs.workers, 10);
  assert.equal(shiftsSnap.inputs.completedShiftsPerWorker, 5);

  const requiredSnap = snapshot(build.record, 'support_ids.required');
  assert.equal(requiredSnap.modeledValue, 400);
  assert.equal(requiredSnap.inputs.campaignVoteGoal, 200);
  assert.equal(requiredSnap.inputs.idCoverageTarget, 1);
  assert.equal(requiredSnap.inputs.supporterTurnoutRate, 0.5);

  const expectedIdsSnap = snapshot(build.record, 'support_ids.expected.doors');
  assert.equal(expectedIdsSnap.modeledValue, 500);
  assert.equal(expectedIdsSnap.inputs.attempts, 2000);
  assert.equal(expectedIdsSnap.inputs.perAttemptContactRate, 0.5);
  assert.equal(expectedIdsSnap.inputs.idCompletionRate, 0.5);
  assert.equal(expectedIdsSnap.inputs.supportRate, 1);
  assert.equal(expectedIdsSnap.inputs.campaignVoteGoal, 200);
  assert.equal(expectedIdsSnap.inputs.idCoverageTarget, 1);
  assert.equal(expectedIdsSnap.inputs.supporterTurnoutRate, 0.5);

  const expectedVotesSnap = snapshot(build.record, 'support_ids.expected_votes.doors');
  assert.equal(expectedVotesSnap.modeledValue, 250);
  assert.equal(expectedVotesSnap.inputs.attempts, 2000);
});

test('starter missing keys map to plain incomplete labels, not section keys', async () => {
  const draft = createStarterScenario('BASE');
  const { build } = await buildScenarioPlan(draft, identity);
  assert.ok(build.missingRequiredKeys.includes('program_budget.channelCapacityInputs'));
  assert.ok(build.missingRequiredKeys.includes('campaign_setup.office'));

  const items = incompleteItems(build.missingRequiredKeys, draft);
  const labels = items.map((item) => item.label);
  assert.ok(labels.includes('Campaign: office'));
  assert.ok(labels.includes('Campaign: election date'));
  assert.ok(labels.includes('Campaign: geography'));
  assert.ok(labels.includes('Program & Budget: workers'));
  assert.ok(labels.includes('Program & Budget: shifts per worker'));
  assert.ok(labels.some((label) => label.startsWith('Doors:')));
  assert.equal(labels.some((label) => /program_budget|channelCapacityInputs|PLAN_/.test(label)), false);
});

/**
 * Invented composition on the 500-voter / 200-vote-goal plurality fixture.
 * Adopted base 150 → persuasion need 50; shares 0.75 / 0.25.
 * Segments 200×0.5×0.5 and 100×1×0.5 → modeled base 100.
 * Persuasion universe 200 at turnout 0.5 → 100 required supporters, yield 0.5.
 */
function knownCompositionDraft() {
  const draft = knownDraft({ type: 'PLURALITY', expectedWinningShare: 0.4 }, 0.4);
  draft.campaign.adoptedBaseVotes = 150;
  draft.campaign.persuasionUniverseSize = 200;
  draft.campaign.persuasionSupporterTurnoutRate = 0.5;
  draft.campaign.baseSegments = [
    { baseVoters: 200, supportProbability: 0.5, turnoutProbability: 0.5 },
    { baseVoters: 100, supportProbability: 1, turnoutProbability: 0.5 },
  ];
  return draft;
}

test('vote composition snapshots store counts and consumed assumptions from a known input set', async () => {
  const { build, voteGoal, voteComposition } = await buildScenarioPlan(knownCompositionDraft(), identity);

  assert.equal(voteGoal.value, 200);
  assert.equal(voteComposition.value.modeledBaseVotes, 100);
  assert.equal(voteComposition.value.adoptedBaseVotes, 150);
  assert.equal(voteComposition.value.persuasionVotesRequired, 50);
  assert.equal(voteComposition.value.baseVoteShare, 0.75);
  assert.equal(voteComposition.value.persuasionVoteShare, 0.25);
  assert.equal(voteComposition.value.requiredPersuasionSupporters, 100);
  assert.equal(voteComposition.value.requiredSupporterYield, 0.5);

  const modeledSnap = snapshot(build.record, 'victory.modeled_base_votes');
  assert.equal(modeledSnap.formulaId, 'victory.modeled_base_votes.v0.3');
  assert.equal(modeledSnap.modeledValue, 100);
  assert.equal(modeledSnap.adoptedValue, 100);
  assert.deepEqual(modeledSnap.inputs.segments, [
    { baseVoters: 200, supportProbability: 0.5, turnoutProbability: 0.5 },
    { baseVoters: 100, supportProbability: 1, turnoutProbability: 0.5 },
  ]);

  const adoptedSnap = snapshot(build.record, 'victory.adopted_base_votes');
  assert.equal(adoptedSnap.formulaId, 'victory.vote_composition.v0.3');
  assert.equal(adoptedSnap.modeledValue, 100);
  assert.equal(adoptedSnap.adoptedValue, 150);
  assert.equal(adoptedSnap.inputs.voteGoal, 200);
  assert.equal(adoptedSnap.inputs.adoptedBaseVotes, 150);

  const residualSnap = snapshot(build.record, 'victory.persuasion_votes_required');
  assert.equal(residualSnap.formulaId, 'victory.vote_composition.v0.3');
  assert.equal(residualSnap.modeledValue, 50);
  assert.equal(residualSnap.adoptedValue, 50);
  assert.equal(residualSnap.inputs.voteGoal, 200);
  assert.equal(residualSnap.inputs.adoptedBaseVotes, 150);

  const supportersSnap = snapshot(build.record, 'victory.required_persuasion_supporters');
  assert.equal(supportersSnap.formulaId, 'victory.persuasion_requirement.v0.3');
  assert.equal(supportersSnap.modeledValue, 100);
  assert.equal(supportersSnap.inputs.persuasionVotesRequired, 50);
  assert.equal(supportersSnap.inputs.persuasionSupporterTurnoutRate, 0.5);

  const yieldSnap = snapshot(build.record, 'victory.required_supporter_yield');
  assert.equal(yieldSnap.formulaId, 'victory.persuasion_requirement.v0.3');
  assert.equal(yieldSnap.modeledValue, 0.5);
  assert.equal(yieldSnap.inputs.requiredPersuasionSupporters, 100);
  assert.equal(yieldSnap.inputs.persuasionUniverseSize, 200);

  assert.equal(snapshot(build.record, 'victory.base_vote_share'), undefined);
  assert.equal(snapshot(build.record, 'victory.persuasion_vote_share'), undefined);

  const supportAssumption = build.record.assumptions.find((item) => item.key === 'victory.base_support_probability');
  const turnoutAssumption = build.record.assumptions.find((item) => item.key === 'victory.base_turnout_probability');
  const persuasionTurnout = build.record.assumptions.find((item) => item.key === 'victory.persuasion_supporter_turnout_rate');
  assert.deepEqual(supportAssumption.value, [0.5, 1]);
  assert.deepEqual(turnoutAssumption.value, [0.5, 0.5]);
  assert.equal(persuasionTurnout.value, 0.5);
  assert.equal(build.record.inputs.campaign.adoptedBaseVotes, 150);
  assert.equal(build.record.mathEngineVersion, '0.2.0-alpha.3');
});

test('missing adopted base leaves persuasion residual uncomputed and does not invent a default', async () => {
  const { build, voteComposition, outreachChains } = await buildScenarioPlan(knownOutreachDraft(), identity);

  assert.equal(voteComposition.value.adoptedBaseVotes, null);
  assert.equal(voteComposition.value.persuasionVotesRequired, null);
  assert.equal(voteComposition.value.modeledBaseVotes, null);
  assert.equal(snapshot(build.record, 'victory.adopted_base_votes'), undefined);
  assert.equal(snapshot(build.record, 'victory.persuasion_votes_required'), undefined);
  assert.equal(outreachChains[0].votesNeeded, 200);
});

test('an adopted base override keeps modeled base and uses the residual as the program vote need', async () => {
  const draft = knownOutreachDraft();
  draft.campaign.adoptedBaseVotes = 150;
  draft.campaign.baseSegments = [
    { baseVoters: 200, supportProbability: 0.5, turnoutProbability: 0.5 },
    { baseVoters: 100, supportProbability: 1, turnoutProbability: 0.5 },
  ];
  const { build, voteComposition, outreachChains } = await buildScenarioPlan(draft, identity);

  assert.equal(voteComposition.value.modeledBaseVotes, 100);
  assert.equal(voteComposition.value.adoptedBaseVotes, 150);
  assert.equal(voteComposition.value.persuasionVotesRequired, 50);
  assert.equal(outreachChains[0].votesNeeded, 50);
  assert.equal(outreachChains[0].requiredIds, 100);
  assert.equal(outreachChains[0].requiredContacts, 200);
  assert.equal(outreachChains[0].requiredAttempts, 400);
  assert.equal(outreachChains[0].requiredShifts, 10);
  assert.equal(outreachChains[0].breakEvenContactRate, 0.1);
  assert.equal(outreachChains[0].breakEvenIdConversionRate, 0.1);
  assert.equal(outreachChains[0].breakEvenAttemptsPerShift, 8);

  const adoptedSnap = snapshot(build.record, 'victory.adopted_base_votes');
  assert.equal(adoptedSnap.modeledValue, 100);
  assert.equal(adoptedSnap.adoptedValue, 150);

  const requiredIdsSnap = snapshot(build.record, 'outreach.ids_required.doors');
  assert.equal(requiredIdsSnap.inputs.requiredVotes, 50);

  const requiredSupportIds = snapshot(build.record, 'support_ids.required');
  assert.equal(requiredSupportIds.inputs.campaignVoteGoal, 50);
  assert.equal(requiredSupportIds.modeledValue, 100);
});

test('outreach chain is absent when unique reach, depth, or contact rate is missing', async () => {
  const draft = knownOutreachDraft();
  draft.programBudget.channels.doors.uniqueReachTarget = null;
  const { outreachChains, build } = await buildScenarioPlan(draft, identity);
  assert.equal(outreachChains.length, 0);
  assert.equal(snapshot(build.record, 'outreach.attempts_goal.doors'), undefined);
});

