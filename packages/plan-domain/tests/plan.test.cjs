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
  return {
    planVersionId: 'plan-1',
    campaignId: 'campaign-1',
    parentPlanVersionId: null,
    status: 'DRAFT',
    scenario: 'BASE',
    mathEngineVersion: '0.2.0-alpha.1',
    calibrationProfileVersion: null,
    inputHash: '',
    inputs: { electorate: 1000, targetShare: 0.51 },
    assumptions: [],
    overrides: [],
    calculations: [],
    evidenceRefs: [],
    createdAt: '2026-08-27T00:00:00Z',
    createdBy: 'user-1',
    adoptedAt: null,
    adoptedBy: null,
    ...overrides,
  };
}

test('input hash is stable across object key ordering', () => {
  const a = computeInputHash({ electorate: 1000, nested: { b: 2, a: 1 } });
  const b = computeInputHash({ nested: { a: 1, b: 2 }, electorate: 1000 });
  assert.equal(a, b);
});

test('adoption stores canonical input hash and adoption metadata', () => {
  const adopted = adoptPlanRecord(basePlan(), { actorId: 'manager-1', adoptedAt: '2026-08-27T12:00:00Z' });
  assert.equal(adopted.status, 'ADOPTED');
  assert.equal(adopted.adoptedBy, 'manager-1');
  assert.match(adopted.inputHash, /^fnv1a32:/);
});

test('adopted plan cannot be treated as mutable draft', () => {
  const adopted = adoptPlanRecord(basePlan(), { actorId: 'manager-1', adoptedAt: '2026-08-27T12:00:00Z' });
  assert.throws(() => assertDraftMutable(adopted), /ADOPTED_PLAN_IMMUTABLE/);
});

test('stored adopted plan cannot be overwritten by a new draft object with the same id', () => {
  const adopted = adoptPlanRecord(basePlan(), { actorId: 'manager-1', adoptedAt: '2026-08-27T12:00:00Z' });
  assert.throws(() => assertStoredPlanReplaceable(adopted), /ADOPTED_PLAN_IMMUTABLE/);
});

test('reforecast is a new child version and preserves adopted parent', () => {
  const parent = adoptPlanRecord(basePlan(), { actorId: 'manager-1', adoptedAt: '2026-08-27T12:00:00Z' });
  const child = createReforecastDraftRecord(parent, basePlan({ planVersionId: 'plan-2', inputs: { electorate: 980, targetShare: 0.51 } }));
  assert.equal(parent.status, 'ADOPTED');
  assert.equal(child.status, 'REFORECAST_DRAFT');
  assert.equal(child.parentPlanVersionId, parent.planVersionId);
  assert.notEqual(child.inputHash, parent.inputHash);
});

test('reforecast requires a new version id', () => {
  const parent = adoptPlanRecord(basePlan(), { actorId: 'manager-1', adoptedAt: '2026-08-27T12:00:00Z' });
  assert.throws(() => createReforecastDraftRecord(parent, basePlan()), /REFORECAST_REQUIRES_NEW_PLAN_VERSION_ID/);
});
