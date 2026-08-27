const test = require('node:test');
const assert = require('node:assert/strict');
const {
  adoptPlanRecord,
  assertDraftMutable,
  assertStoredPlanReplaceable,
  computeInputHash,
  createReforecastDraftRecord,
} = require('../dist');

function basePlan(overrides = {}) {
  const inputs = overrides.inputs ?? { electorate: 1000, targetShare: 0.51 };
  const inputHash = computeInputHash(inputs);
  return {
    planVersionId: 'plan-1',
    campaignId: 'campaign-1',
    parentPlanVersionId: null,
    status: 'DRAFT',
    scenario: 'BASE',
    mathEngineVersion: '0.2.0-alpha.1',
    calibrationProfileVersion: null,
    inputHash,
    inputs,
    assumptions: [],
    overrides: [],
    calculations: [{
      metricKey: 'victory.vote_goal',
      modeledValue: 510,
      adoptedValue: 510,
      formulaId: 'victory.vote_goal.v0.2',
      inputs: { electorate: 1000, targetShare: 0.51 },
      evidenceRefs: [],
      inputHash,
    }],
    evidenceRefs: [],
    feasibilityGaps: [],
    feasibilityAcknowledgments: [],
    createdAt: '2026-08-27T00:00:00Z',
    createdBy: 'user-1',
    adoptedAt: null,
    adoptedBy: null,
    ...overrides,
  };
}

function adoptionMeta(plan, expectedInputHash = plan.inputHash) {
  return { actorId: 'manager-1', adoptedAt: '2026-08-27T12:00:00Z', expectedInputHash };
}

test('input hash is stable across object key ordering', () => {
  const a = computeInputHash({ electorate: 1000, nested: { b: 2, a: 1 } });
  const b = computeInputHash({ nested: { a: 1, b: 2 }, electorate: 1000 });
  assert.equal(a, b);
});

test('adoption stores adoption metadata when snapshots and reviewed inputs are fresh', () => {
  const plan = basePlan();
  const adopted = adoptPlanRecord(plan, adoptionMeta(plan));
  assert.equal(adopted.status, 'ADOPTED');
  assert.equal(adopted.adoptedBy, 'manager-1');
  assert.match(adopted.inputHash, /^fnv1a32:/);
});

test('adoption refuses when manager reviewed a different input fingerprint', () => {
  const plan = basePlan();
  const differentHash = computeInputHash({ electorate: 1000, targetShare: 0.53 });
  assert.throws(() => adoptPlanRecord(plan, adoptionMeta(plan, differentHash)), /PLAN_RECALC_REQUIRED/);
});

test('adoption refuses a draft changed after calculation', () => {
  const plan = basePlan();
  plan.inputs = { electorate: 1000, targetShare: 0.53 };
  assert.throws(() => adoptPlanRecord(plan, adoptionMeta(plan)), /PLAN_RECALC_REQUIRED/);
});

test('adoption refuses a stale calculation snapshot even with a current top-level hash', () => {
  const plan = basePlan({ inputs: { electorate: 1000, targetShare: 0.53 } });
  plan.calculations[0].inputHash = computeInputHash({ electorate: 1000, targetShare: 0.51 });
  assert.throws(() => adoptPlanRecord(plan, adoptionMeta(plan)), /PLAN_RECALC_REQUIRED/);
});

test('material feasibility gap requires explicit acknowledgment', () => {
  const plan = basePlan({
    feasibilityGaps: [{
      gapId: 'capacity-universe-gap',
      constraintType: 'CAPACITY',
      strategicMetricKey: 'universe.desired',
      strategicValue: 1600,
      operationalMetricKey: 'universe.capacity_supported',
      operationalValue: 1200,
      gap: 400,
      requiresAcknowledgment: true,
    }],
  });
  assert.throws(() => adoptPlanRecord(plan, adoptionMeta(plan)), /FEASIBILITY_ACK_REQUIRED:capacity-universe-gap/);
});

test('acknowledged feasibility gap preserves strategic and operational values', () => {
  const plan = basePlan({
    feasibilityGaps: [{
      gapId: 'capacity-universe-gap',
      constraintType: 'CAPACITY',
      strategicMetricKey: 'universe.desired',
      strategicValue: 1600,
      operationalMetricKey: 'universe.capacity_supported',
      operationalValue: 1200,
      gap: 400,
      requiresAcknowledgment: true,
    }],
    feasibilityAcknowledgments: [{
      acknowledgmentId: 'ack-1',
      gapId: 'capacity-universe-gap',
      reason: 'Current staffing supports a smaller operational universe.',
      actorId: 'manager-1',
      acknowledgedAt: '2026-08-27T11:55:00Z',
    }],
  });
  const adopted = adoptPlanRecord(plan, adoptionMeta(plan));
  assert.equal(adopted.feasibilityGaps[0].strategicValue, 1600);
  assert.equal(adopted.feasibilityGaps[0].operationalValue, 1200);
  assert.equal(adopted.feasibilityAcknowledgments.length, 1);
});

test('adopted plan cannot be treated as mutable draft', () => {
  const plan = basePlan();
  const adopted = adoptPlanRecord(plan, adoptionMeta(plan));
  assert.throws(() => assertDraftMutable(adopted), /ADOPTED_PLAN_IMMUTABLE/);
});

test('stored adopted plan cannot be overwritten by a new draft object with the same id', () => {
  const plan = basePlan();
  const adopted = adoptPlanRecord(plan, adoptionMeta(plan));
  assert.throws(() => assertStoredPlanReplaceable(adopted), /ADOPTED_PLAN_IMMUTABLE/);
});

test('reforecast is a new child version and preserves adopted parent', () => {
  const plan = basePlan();
  const parent = adoptPlanRecord(plan, adoptionMeta(plan));
  const child = createReforecastDraftRecord(parent, basePlan({ planVersionId: 'plan-2', inputs: { electorate: 980, targetShare: 0.51 } }));
  assert.equal(parent.status, 'ADOPTED');
  assert.equal(child.status, 'REFORECAST_DRAFT');
  assert.equal(child.parentPlanVersionId, parent.planVersionId);
  assert.notEqual(child.inputHash, parent.inputHash);
});

test('reforecast requires a new version id', () => {
  const plan = basePlan();
  const parent = adoptPlanRecord(plan, adoptionMeta(plan));
  assert.throws(() => createReforecastDraftRecord(parent, basePlan()), /REFORECAST_REQUIRES_NEW_PLAN_VERSION_ID/);
});
