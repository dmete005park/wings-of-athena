const test = require('node:test');
const assert = require('node:assert/strict');
const {
  adoptPlanRecord,
  assertDraftMutable,
  assertStoredPlanReplaceable,
  buildPlanVersionRecord,
  computeFeasibilityGapFingerprint,
  computeInputHash,
  createReforecastDraftRecord,
} = require('../dist');

const completeSections = [
  { sectionKey: 'campaign_setup', requiredForAdoption: true, status: 'COMPLETE', missingKeys: [] },
  { sectionKey: 'path_to_victory', requiredForAdoption: true, status: 'COMPLETE', missingKeys: [] },
  { sectionKey: 'program_budget', requiredForAdoption: true, status: 'COMPLETE', missingKeys: [] },
];

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
    sectionStatuses: completeSections,
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

function capacityGap(overrides = {}) {
  return {
    gapId: 'capacity-universe-gap',
    constraintType: 'CAPACITY',
    strategicMetricKey: 'universe.reachable',
    strategicValue: 30100,
    operationalMetricKey: 'universe.capacity_supported',
    operationalValue: 26800,
    gap: 3300,
    requiresAcknowledgment: true,
    ...overrides,
  };
}

function acknowledgmentFor(gap, overrides = {}) {
  return {
    acknowledgmentId: 'ack-1',
    gapId: gap.gapId,
    gapFingerprint: computeFeasibilityGapFingerprint(gap),
    constraintType: gap.constraintType,
    strategicMetricKey: gap.strategicMetricKey,
    strategicValue: gap.strategicValue,
    operationalMetricKey: gap.operationalMetricKey,
    operationalValue: gap.operationalValue,
    gap: gap.gap,
    reason: 'Current staffing cannot close the remaining capacity gap within the program window.',
    actorId: 'manager-1',
    acknowledgedAt: '2026-08-27T11:55:00Z',
    ...overrides,
  };
}

test('input hash is stable across object key ordering', () => {
  const a = computeInputHash({ electorate: 1000, nested: { b: 2, a: 1 } });
  const b = computeInputHash({ nested: { a: 1, b: 2 }, electorate: 1000 });
  assert.equal(a, b);
});

test('input hash uses code-unit key ordering, not localeCompare', () => {
  const a = computeInputHash({ Z: 1, a: 2 });
  const b = computeInputHash({ a: 2, Z: 1 });
  assert.equal(a, b);
  assert.match(a, /^fnv1a32:/);
});

test('non-finite numbers do not canonicalize identically to null', () => {
  const nullHash = computeInputHash({ value: null });
  const nanHash = computeInputHash({ value: Number.NaN });
  const infinityHash = computeInputHash({ value: Infinity });
  const negInfinityHash = computeInputHash({ value: -Infinity });
  assert.notEqual(nullHash, nanHash);
  assert.notEqual(nullHash, infinityHash);
  assert.notEqual(nullHash, negInfinityHash);
  assert.notEqual(nanHash, infinityHash);
  assert.notEqual(infinityHash, negInfinityHash);
});

test('plan builder serializes incomplete drafts and reports exact missing required keys', () => {
  const source = basePlan();
  const { inputHash, sectionStatuses, calculations, ...draft } = source;
  const build = buildPlanVersionRecord(
    {
      ...draft,
      calculations: calculations.map(({ inputHash: _snapshotHash, ...snapshot }) => snapshot),
    },
    [
      completeSections[0],
      completeSections[1],
      { sectionKey: 'program_budget', requiredForAdoption: true, status: 'INCOMPLETE', missingKeys: ['resourcePools', 'channelAllocations'] },
    ],
  );

  assert.match(build.record.inputHash, /^fnv1a32:/);
  assert.equal(build.readyForAdoption, false);
  assert.deepEqual(build.missingRequiredKeys, [
    'program_budget.resourcePools',
    'program_budget.channelAllocations',
  ]);
  assert.ok(build.record.calculations.every((snapshot) => snapshot.inputHash === build.record.inputHash));
});

test('adoption refuses an incomplete required section with a specific error', () => {
  const plan = basePlan({
    sectionStatuses: [
      completeSections[0],
      completeSections[1],
      { sectionKey: 'program_budget', requiredForAdoption: true, status: 'INCOMPLETE', missingKeys: ['resourcePools'] },
    ],
  });
  assert.throws(
    () => adoptPlanRecord(plan, adoptionMeta(plan)),
    /PLAN_SECTION_INCOMPLETE:program_budget:resourcePools/,
  );
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
  const gap = capacityGap();
  const plan = basePlan({ feasibilityGaps: [gap] });
  assert.throws(() => adoptPlanRecord(plan, adoptionMeta(plan)), /FEASIBILITY_ACK_REQUIRED:capacity-universe-gap/);
});

test('gap change invalidates an earlier acknowledgment', () => {
  const originalGap = capacityGap();
  const changedGap = capacityGap({ operationalValue: 24100, gap: 6000 });
  const plan = basePlan({
    feasibilityGaps: [changedGap],
    feasibilityAcknowledgments: [acknowledgmentFor(originalGap)],
  });
  assert.throws(
    () => adoptPlanRecord(plan, adoptionMeta(plan)),
    /FEASIBILITY_ACK_STALE:capacity-universe-gap/,
  );
});

test('fresh acknowledged feasibility gap preserves reason and exact decision snapshot', () => {
  const gap = capacityGap();
  const acknowledgment = acknowledgmentFor(gap);
  const plan = basePlan({
    feasibilityGaps: [gap],
    feasibilityAcknowledgments: [acknowledgment],
  });
  const adopted = adoptPlanRecord(plan, adoptionMeta(plan));
  assert.equal(adopted.feasibilityAcknowledgments[0].gapFingerprint, computeFeasibilityGapFingerprint(gap));
  assert.equal(adopted.feasibilityAcknowledgments[0].gap, 3300);
  assert.equal(adopted.feasibilityAcknowledgments[0].reason, acknowledgment.reason);
});

test('allocation conflict is a first-class feasibility constraint', () => {
  const gap = {
    ...capacityGap(),
    gapId: 'shared-pool-allocation-gap',
    constraintType: 'ALLOCATION',
    strategicMetricKey: 'capacity.pool.available_completed_shifts',
    strategicValue: 40,
    operationalMetricKey: 'capacity.pool.allocated_completed_shifts',
    operationalValue: 50,
    gap: 10,
  };
  const plan = basePlan({
    feasibilityGaps: [gap],
    feasibilityAcknowledgments: [acknowledgmentFor(gap, { reason: 'Manager accepts the temporary cross-channel allocation conflict.' })],
  });
  const adopted = adoptPlanRecord(plan, adoptionMeta(plan));
  assert.equal(adopted.feasibilityAcknowledgments[0].constraintType, 'ALLOCATION');
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
