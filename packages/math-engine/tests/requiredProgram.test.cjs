const test = require('node:test');
const assert = require('node:assert/strict');
const {
  attemptsRequiredForContactGoal,
  calculateBreakEvenRates,
  calculateRequiredProgram,
  contactsRequiredForIdGoal,
  idsRequiredForVoteGoal,
  shiftsRequiredForAttempts,
} = require('../dist');

/**
 * Invented round numbers. Vote need 200 at turnout 0.5, conversion 0.5,
 * contact rate 0.5, 40 attempts per shift:
 *   required IDs      = ceil(200 / 0.5) = 400
 *   required contacts = ceil(400 / 0.5) = 800
 *   required attempts = ceil(800 / 0.5) = 1600
 *   required shifts   = ceil(1600 / 40) = 40
 *
 * Produced program of 2000 attempts / 1000 contacts / 50 shifts:
 *   break-even contact rate     = 200 / (2000 × 0.5 × 0.5) = 0.4
 *   break-even ID conversion    = 200 / (1000 × 0.5) = 0.4
 *   break-even attempts / shift = 200 / (50 × 0.5 × 0.5 × 0.5) = 32
 */

test('idsRequiredForVoteGoal divides required votes by supporter turnout and ceils', () => {
  const result = idsRequiredForVoteGoal(200, 0.5);
  assert.equal(result.value, 400);
  assert.equal(result.issues.length, 0);
});

test('idsRequiredForVoteGoal ceils a non-integer quotient', () => {
  const result = idsRequiredForVoteGoal(200, 0.3);
  assert.equal(result.value, 667);
});

test('idsRequiredForVoteGoal rejects zero turnout rather than returning Infinity', () => {
  const result = idsRequiredForVoteGoal(200, 0);
  assert.equal(result.value, null);
  assert.equal(Number.isFinite(result.value), false);
  assert.ok(result.issues.some((issue) => issue.code === 'ZERO_SUPPORTER_TURNOUT'));
});

test('idsRequiredForVoteGoal rejects turnout outside 0–1', () => {
  const high = idsRequiredForVoteGoal(200, 1.2);
  assert.equal(high.value, null);
  assert.ok(high.issues.some((issue) => issue.code === 'INVALID_PROBABILITY'));

  const negative = idsRequiredForVoteGoal(200, -0.1);
  assert.equal(negative.value, null);
  assert.ok(negative.issues.some((issue) => issue.code === 'INVALID_PROBABILITY'));
});

test('idsRequiredForVoteGoal rejects negative required votes', () => {
  const result = idsRequiredForVoteGoal(-1, 0.5);
  assert.equal(result.value, null);
  assert.ok(result.issues.some((issue) => issue.code === 'INVALID_VOTE_GOAL'));
});

test('contactsRequiredForIdGoal divides required IDs by conversion and ceils', () => {
  const result = contactsRequiredForIdGoal(400, 0.5);
  assert.equal(result.value, 800);
  assert.equal(result.issues.length, 0);
});

test('contactsRequiredForIdGoal rejects zero conversion rather than returning Infinity', () => {
  const result = contactsRequiredForIdGoal(400, 0);
  assert.equal(result.value, null);
  assert.ok(result.issues.some((issue) => issue.code === 'ZERO_ID_CONVERSION_RATE'));
});

test('contactsRequiredForIdGoal rejects conversion outside 0–1', () => {
  const high = contactsRequiredForIdGoal(400, 1.2);
  assert.equal(high.value, null);
  assert.ok(high.issues.some((issue) => issue.code === 'INVALID_PROBABILITY'));
});

test('attemptsRequiredForContactGoal is reused for required contacts', () => {
  const result = attemptsRequiredForContactGoal(800, 0.5);
  assert.equal(result.value, 1600);
  assert.equal(result.issues.length, 0);
});

test('attemptsRequiredForContactGoal rejects zero contact rate rather than returning Infinity', () => {
  const result = attemptsRequiredForContactGoal(800, 0);
  assert.equal(result.value, null);
  assert.ok(result.issues.some((issue) => issue.code === 'ZERO_CONTACT_RATE'));
});

test('attemptsRequiredForContactGoal rejects contact rate outside 0–1', () => {
  const high = attemptsRequiredForContactGoal(800, 1.2);
  assert.equal(high.value, null);
  assert.ok(high.issues.some((issue) => issue.code === 'INVALID_PROBABILITY'));
});

test('shiftsRequiredForAttempts divides required attempts by attempts per shift and ceils', () => {
  const result = shiftsRequiredForAttempts(1600, 40);
  assert.equal(result.value, 40);
  assert.equal(result.issues.length, 0);
});

test('shiftsRequiredForAttempts ceils a non-integer quotient', () => {
  const result = shiftsRequiredForAttempts(1601, 40);
  assert.equal(result.value, 41);
});

test('shiftsRequiredForAttempts rejects zero productivity rather than returning Infinity', () => {
  const result = shiftsRequiredForAttempts(1600, 0);
  assert.equal(result.value, null);
  assert.ok(result.issues.some((issue) => issue.code === 'ZERO_PRODUCTIVITY'));
});

test('shiftsRequiredForAttempts allows zero attempts at zero productivity', () => {
  const result = shiftsRequiredForAttempts(0, 0);
  assert.equal(result.value, 0);
});

test('calculateRequiredProgram composes the four inverse steps', () => {
  const result = calculateRequiredProgram({
    requiredVotes: 200,
    supporterTurnoutRate: 0.5,
    idConversionRate: 0.5,
    perAttemptContactRate: 0.5,
    attemptsPerCompletedShift: 40,
  });
  assert.equal(result.value?.requiredIds, 400);
  assert.equal(result.value?.requiredContacts, 800);
  assert.equal(result.value?.requiredAttempts, 1600);
  assert.equal(result.value?.requiredShifts, 40);
  assert.equal(result.issues.length, 0);
});

test('calculateRequiredProgram stops later steps when an early rate is zero', () => {
  const noTurnout = calculateRequiredProgram({
    requiredVotes: 200,
    supporterTurnoutRate: 0,
    idConversionRate: 0.5,
    perAttemptContactRate: 0.5,
    attemptsPerCompletedShift: 40,
  });
  assert.equal(noTurnout.value?.requiredIds, null);
  assert.equal(noTurnout.value?.requiredContacts, null);
  assert.equal(noTurnout.value?.requiredAttempts, null);
  assert.equal(noTurnout.value?.requiredShifts, null);
  assert.ok(noTurnout.issues.some((issue) => issue.code === 'ZERO_SUPPORTER_TURNOUT'));

  const noConversion = calculateRequiredProgram({
    requiredVotes: 200,
    supporterTurnoutRate: 0.5,
    idConversionRate: 0,
    perAttemptContactRate: 0.5,
    attemptsPerCompletedShift: 40,
  });
  assert.equal(noConversion.value?.requiredIds, 400);
  assert.equal(noConversion.value?.requiredContacts, null);
  assert.equal(noConversion.value?.requiredAttempts, null);
  assert.ok(noConversion.issues.some((issue) => issue.code === 'ZERO_ID_CONVERSION_RATE'));
});

test('calculateBreakEvenRates is one division per lever over entered values', () => {
  const result = calculateBreakEvenRates({
    votesNeeded: 200,
    attempts: 2000,
    contacts: 1000,
    shifts: 50,
    supporterTurnoutRate: 0.5,
    idConversionRate: 0.5,
    perAttemptContactRate: 0.5,
  });
  assert.equal(result.value?.contactRate, 0.4);
  assert.equal(result.value?.idConversionRate, 0.4);
  assert.equal(result.value?.attemptsPerShift, 32);
  assert.equal(result.issues.length, 0);
});

test('calculateBreakEvenRates does not clamp a rate above 1', () => {
  const result = calculateBreakEvenRates({
    votesNeeded: 200,
    attempts: 200,
    contacts: 100,
    shifts: 5,
    supporterTurnoutRate: 0.5,
    idConversionRate: 0.5,
    perAttemptContactRate: 0.5,
  });
  assert.equal(result.value?.contactRate, 4);
  assert.equal(result.value?.idConversionRate, 4);
  assert.ok((result.value?.contactRate ?? 0) > 1);
});

test('calculateBreakEvenRates rejects zero denominators rather than returning Infinity', () => {
  const zeroAttempts = calculateBreakEvenRates({
    votesNeeded: 200,
    attempts: 0,
    contacts: 1000,
    shifts: 50,
    supporterTurnoutRate: 0.5,
    idConversionRate: 0.5,
    perAttemptContactRate: 0.5,
  });
  assert.equal(zeroAttempts.value?.contactRate, null);
  assert.notEqual(zeroAttempts.value?.contactRate, Infinity);
  assert.ok(zeroAttempts.issues.some((issue) => issue.code === 'ZERO_DENOMINATOR'));

  const zeroTurnout = calculateBreakEvenRates({
    votesNeeded: 200,
    attempts: 2000,
    contacts: 1000,
    shifts: 50,
    supporterTurnoutRate: 0,
    idConversionRate: 0.5,
    perAttemptContactRate: 0.5,
  });
  assert.equal(zeroTurnout.value?.contactRate, null);
  assert.equal(zeroTurnout.value?.idConversionRate, null);
  assert.equal(zeroTurnout.value?.attemptsPerShift, null);
  assert.ok(zeroTurnout.issues.some((issue) => issue.code === 'ZERO_SUPPORTER_TURNOUT'));
});

test('calculateBreakEvenRates omits attempts-per-shift when shifts are not supplied', () => {
  const result = calculateBreakEvenRates({
    votesNeeded: 200,
    attempts: 2000,
    contacts: 1000,
    supporterTurnoutRate: 0.5,
    idConversionRate: 0.5,
    perAttemptContactRate: 0.5,
  });
  assert.equal(result.value?.contactRate, 0.4);
  assert.equal(result.value?.idConversionRate, 0.4);
  assert.equal(result.value?.attemptsPerShift, null);
  assert.equal(result.issues.some((issue) => issue.code === 'ZERO_DENOMINATOR'), false);
});

test('calculateBreakEvenRates rejects input rates outside 0–1', () => {
  const result = calculateBreakEvenRates({
    votesNeeded: 200,
    attempts: 2000,
    contacts: 1000,
    shifts: 50,
    supporterTurnoutRate: 1.2,
    idConversionRate: 0.5,
    perAttemptContactRate: 0.5,
  });
  assert.equal(result.value?.contactRate, null);
  assert.equal(result.value?.idConversionRate, null);
  assert.ok(result.issues.some((issue) => issue.code === 'INVALID_PROBABILITY'));
});
