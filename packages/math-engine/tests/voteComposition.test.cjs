const test = require('node:test');
const assert = require('node:assert/strict');
const {
  baseVoteShare,
  computeModeledBaseVotes,
  computeVoteComposition,
  expectedBaseVotesForSegment,
  persuasionVoteShare,
  persuasionVotesRequired,
  requiredPersuasionSupporters,
  requiredSupporterYield,
} = require('../dist');

/**
 * Invented round numbers. Vote goal 200, adopted base 150:
 *   persuasionVotesRequired = max(0, 200 − 150) = 50
 *   baseVoteShare           = 150 / 200 = 0.75
 *   persuasionVoteShare     = 50 / 200 = 0.25
 *
 * Segments:
 *   200 × 0.5 × 0.5 = 50
 *   100 × 1 × 0.5   = 50
 *   modeledBaseVotes = 100
 *
 * Persuasion universe 200 at turnout 0.5:
 *   requiredPersuasionSupporters = ceil(50 / 0.5) = 100
 *   requiredSupporterYield       = 100 / 200 = 0.5
 */

test('persuasionVotesRequired is the residual after adopted base votes', () => {
  const result = persuasionVotesRequired(200, 150);
  assert.equal(result.value, 50);
  assert.equal(result.issues.length, 0);
});

test('persuasionVotesRequired is zero when adopted base meets or exceeds the goal', () => {
  assert.equal(persuasionVotesRequired(200, 200).value, 0);
  const over = persuasionVotesRequired(200, 250);
  assert.equal(over.value, 0);
  assert.ok(over.issues.some((issue) => issue.code === 'ADOPTED_BASE_EXCEEDS_GOAL'));
});

test('persuasionVotesRequired stays null when adopted base is missing', () => {
  const result = persuasionVotesRequired(200, null);
  assert.equal(result.value, null);
  assert.equal(result.issues.length, 0);
});

test('persuasionVotesRequired rejects a negative vote goal', () => {
  const result = persuasionVotesRequired(-1, 10);
  assert.equal(result.value, null);
  assert.ok(result.issues.some((issue) => issue.code === 'INVALID_VOTE_GOAL'));
});

test('persuasionVotesRequired rejects negative adopted base votes', () => {
  const result = persuasionVotesRequired(200, -10);
  assert.equal(result.value, null);
  assert.ok(result.issues.some((issue) => issue.code === 'INVALID_BASE_VOTES'));
});

test('baseVoteShare divides adopted base by vote goal', () => {
  const result = baseVoteShare(150, 200);
  assert.equal(result.value, 0.75);
  assert.equal(result.issues.length, 0);
});

test('baseVoteShare is null with DIVISION_BY_ZERO when vote goal is zero', () => {
  const result = baseVoteShare(150, 0);
  assert.equal(result.value, null);
  assert.equal(Number.isFinite(result.value), false);
  assert.ok(result.issues.some((issue) => issue.code === 'DIVISION_BY_ZERO'));
});

test('persuasionVoteShare divides residual by vote goal', () => {
  const result = persuasionVoteShare(50, 200);
  assert.equal(result.value, 0.25);
  assert.equal(result.issues.length, 0);
});

test('persuasionVoteShare is null with DIVISION_BY_ZERO when vote goal is zero', () => {
  const result = persuasionVoteShare(0, 0);
  assert.equal(result.value, null);
  assert.ok(result.issues.some((issue) => issue.code === 'DIVISION_BY_ZERO'));
});

test('expectedBaseVotesForSegment multiplies voters by support and turnout', () => {
  const result = expectedBaseVotesForSegment({
    baseVoters: 200,
    supportProbability: 0.5,
    turnoutProbability: 0.5,
  });
  assert.equal(result.value, 50);
  assert.equal(result.issues.length, 0);
});

test('expectedBaseVotesForSegment rejects rates outside 0–1', () => {
  const high = expectedBaseVotesForSegment({
    baseVoters: 200,
    supportProbability: 1.2,
    turnoutProbability: 0.5,
  });
  assert.equal(high.value, null);
  assert.ok(high.issues.some((issue) => issue.code === 'INVALID_PROBABILITY'));

  const negative = expectedBaseVotesForSegment({
    baseVoters: 200,
    supportProbability: 0.5,
    turnoutProbability: -0.1,
  });
  assert.equal(negative.value, null);
  assert.ok(negative.issues.some((issue) => issue.code === 'INVALID_PROBABILITY'));
});

test('expectedBaseVotesForSegment is null when a segment field is missing', () => {
  const result = expectedBaseVotesForSegment({
    baseVoters: 200,
    supportProbability: null,
    turnoutProbability: 0.5,
  });
  assert.equal(result.value, null);
  assert.equal(result.issues.length, 0);
});

test('computeModeledBaseVotes sums complete segments', () => {
  const result = computeModeledBaseVotes([
    { baseVoters: 200, supportProbability: 0.5, turnoutProbability: 0.5 },
    { baseVoters: 100, supportProbability: 1, turnoutProbability: 0.5 },
  ]);
  assert.equal(result.value.modeledBaseVotes, 100);
  assert.deepEqual(result.value.expectedBaseVotes, [50, 50]);
  assert.equal(result.issues.length, 0);
});

test('computeModeledBaseVotes is null when no segments exist', () => {
  const result = computeModeledBaseVotes([]);
  assert.equal(result.value.modeledBaseVotes, null);
  assert.deepEqual(result.value.expectedBaseVotes, []);
  assert.equal(result.issues.length, 0);
});

test('computeModeledBaseVotes omits incomplete segments and warns', () => {
  const result = computeModeledBaseVotes([
    { baseVoters: 200, supportProbability: 0.5, turnoutProbability: 0.5 },
    { baseVoters: 100, supportProbability: null, turnoutProbability: 0.5 },
  ]);
  assert.equal(result.value.modeledBaseVotes, 50);
  assert.deepEqual(result.value.expectedBaseVotes, [50, null]);
  assert.ok(result.issues.some((issue) => issue.code === 'INCOMPLETE_INPUT'));
});

test('requiredPersuasionSupporters divides residual by turnout and ceils', () => {
  const result = requiredPersuasionSupporters(50, 0.5);
  assert.equal(result.value, 100);
  assert.equal(result.issues.length, 0);
});

test('requiredPersuasionSupporters ceils a non-integer quotient', () => {
  const result = requiredPersuasionSupporters(50, 0.3);
  assert.equal(result.value, 167);
});

test('requiredPersuasionSupporters rejects zero turnout rather than returning Infinity', () => {
  const result = requiredPersuasionSupporters(50, 0);
  assert.equal(result.value, null);
  assert.equal(Number.isFinite(result.value), false);
  assert.ok(result.issues.some((issue) => issue.code === 'ZERO_PERSUASION_TURNOUT'));
});

test('requiredPersuasionSupporters rejects turnout outside 0–1', () => {
  const high = requiredPersuasionSupporters(50, 1.2);
  assert.equal(high.value, null);
  assert.ok(high.issues.some((issue) => issue.code === 'INVALID_PROBABILITY'));
});

test('requiredSupporterYield divides required supporters by persuasion universe', () => {
  const result = requiredSupporterYield(100, 200);
  assert.equal(result.value, 0.5);
  assert.equal(result.issues.length, 0);
});

test('requiredSupporterYield is null with DIVISION_BY_ZERO when the universe is zero', () => {
  const result = requiredSupporterYield(100, 0);
  assert.equal(result.value, null);
  assert.equal(Number.isFinite(result.value), false);
  assert.ok(result.issues.some((issue) => issue.code === 'DIVISION_BY_ZERO'));
});

test('requiredSupporterYield does not clamp a requirement above 1', () => {
  const result = requiredSupporterYield(300, 200);
  assert.equal(result.value, 1.5);
});

test('computeVoteComposition composes residual, shares, modeled base, and required yield', () => {
  const result = computeVoteComposition({
    voteGoal: 200,
    adoptedBaseVotes: 150,
    persuasionUniverseSize: 200,
    persuasionSupporterTurnoutRate: 0.5,
    baseSegments: [
      { baseVoters: 200, supportProbability: 0.5, turnoutProbability: 0.5 },
      { baseVoters: 100, supportProbability: 1, turnoutProbability: 0.5 },
    ],
  });

  assert.equal(result.value.modeledBaseVotes, 100);
  assert.deepEqual(result.value.expectedBaseVotes, [50, 50]);
  assert.equal(result.value.adoptedBaseVotes, 150);
  assert.equal(result.value.persuasionVotesRequired, 50);
  assert.equal(result.value.baseVoteShare, 0.75);
  assert.equal(result.value.persuasionVoteShare, 0.25);
  assert.equal(result.value.requiredPersuasionSupporters, 100);
  assert.equal(result.value.requiredSupporterYield, 0.5);
  assert.equal(result.issues.length, 0);
});

test('computeVoteComposition does not invent adopted base or a residual', () => {
  const result = computeVoteComposition({
    voteGoal: 200,
    adoptedBaseVotes: null,
    persuasionUniverseSize: 200,
    persuasionSupporterTurnoutRate: 0.5,
    baseSegments: [],
  });

  assert.equal(result.value.modeledBaseVotes, null);
  assert.equal(result.value.adoptedBaseVotes, null);
  assert.equal(result.value.persuasionVotesRequired, null);
  assert.equal(result.value.baseVoteShare, null);
  assert.equal(result.value.persuasionVoteShare, null);
  assert.equal(result.value.requiredPersuasionSupporters, null);
  assert.equal(result.value.requiredSupporterYield, null);
});

test('computeVoteComposition keeps modeled base when adopted base is an override', () => {
  const result = computeVoteComposition({
    voteGoal: 200,
    adoptedBaseVotes: 150,
    persuasionUniverseSize: null,
    persuasionSupporterTurnoutRate: null,
    baseSegments: [
      { baseVoters: 200, supportProbability: 0.5, turnoutProbability: 0.5 },
    ],
  });

  assert.equal(result.value.modeledBaseVotes, 50);
  assert.equal(result.value.adoptedBaseVotes, 150);
  assert.equal(result.value.persuasionVotesRequired, 50);
});
