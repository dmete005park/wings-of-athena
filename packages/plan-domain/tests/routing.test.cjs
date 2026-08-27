const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PlanAdoptionError,
  adoptPlanRecord,
  buildPlanVersionRecord,
  computeFeasibilityGapFingerprint,
  computeInputHash,
  evaluatePlanSectionStatuses,
} = require('../dist');

const definitions = [
  {
    sectionKey: 'campaign_setup',
    requiredWhen: { type: 'ALWAYS' },
    fields: [{ key: 'campaignName', present: true, requiredWhen: { type: 'ALWAYS' } }],
  },
  {
    sectionKey: 'program_budget',
    requiredWhen: { type: 'ALWAYS' },
    fields: [
      { key: 'resourcePools', present: true, requiredWhen: { type: 'ALWAYS' } },
      { key: 'channelAllocations', present: true, requiredWhen: { type: 'ALWAYS' } },
      { key: 'supportIdCoverageTarget', present: false, requiredWhen: { type: 'OBJECTIVE_ENABLED', objectiveIds: ['SUPPORT_ID'] } },
      { key: 'supporterTurnoutRate', present: false, requiredWhen: { type: 'OBJECTIVE_ENABLED', objectiveIds: ['SUPPORT_ID'] } },
    ],
  },
];

function draftPlan() {
  return {
    planVersionId: 'plan-routing',
    campaignId: 'campaign-1',
    parentPlanVersionId: null,
    status: 'DRAFT',
    scenario: 'BASE',
    mathEngineVersion: '0.2.0-alpha.1',
    calibrationProfileVersion: null,
    inputs: { electorate: 1000 },
    assumptions: [],
    overrides: [],
    calculations: [{
      metricKey: 'victory.vote_goal',
      modeledValue: 510,
      adoptedValue: 510,
      formulaId: 'victory.vote_goal.v0.2',
      inputs: { electorate: 1000 },
      evidenceRefs: [],
    }],
    evidenceRefs: [],
    feasibilityGaps: [],
    feasibilityAcknowledgments: [],
    createdAt: '2026-08-27T00:00:00Z',
    createdBy: 'manager-1',
    adoptedAt: null,
    adoptedBy: null,
  };
}

test('support-id fields are optional until SUPPORT_ID objective is enabled', () => {
  const withoutSupportIds = evaluatePlanSectionStatuses(definitions, []);
  assert.equal(withoutSupportIds.find((s) => s.sectionKey === 'program_budget').status, 'COMPLETE');

  const withSupportIds = evaluatePlanSectionStatuses(definitions, ['SUPPORT_ID']);
  const program = withSupportIds.find((s) => s.sectionKey === 'program_budget');
  assert.equal(program.status, 'INCOMPLETE');
  assert.deepEqual(program.missingKeys, ['supportIdCoverageTarget', 'supporterTurnoutRate']);
});

test('enabled objective set is canonical plan input and changes the fingerprint', () => {
  const base = buildPlanVersionRecord(draftPlan(), definitions, []);
  const support = buildPlanVersionRecord(draftPlan(), definitions, ['SUPPORT_ID']);
  assert.notEqual(base.record.inputHash, support.record.inputHash);
  assert.deepEqual(base.record.inputs.enabledObjectiveIds, []);
  assert.deepEqual(support.record.inputs.enabledObjectiveIds, ['SUPPORT_ID']);
});

test('stale acknowledgment returns routable section and old-vs-new gap snapshots', () => {
  const oldGap = {
    gapId: 'doors-capacity', constraintType: 'CAPACITY', strategicMetricKey: 'universe.reachable', strategicValue: 30100,
    operationalMetricKey: 'universe.capacity_supported', operationalValue: 26800, gap: 3300, requiresAcknowledgment: true,
  };
  const newGap = { ...oldGap, operationalValue: 24100, gap: 6000 };
  const built = buildPlanVersionRecord({
    ...draftPlan(),
    feasibilityGaps: [newGap],
    feasibilityAcknowledgments: [{
      acknowledgmentId: 'ack-1', gapId: oldGap.gapId, gapFingerprint: computeFeasibilityGapFingerprint(oldGap),
      constraintType: oldGap.constraintType, strategicMetricKey: oldGap.strategicMetricKey, strategicValue: oldGap.strategicValue,
      operationalMetricKey: oldGap.operationalMetricKey, operationalValue: oldGap.operationalValue, gap: oldGap.gap,
      reason: 'Staffing constraint', actorId: 'manager-1', acknowledgedAt: '2026-08-27T10:00:00Z',
    }],
  }, definitions, []);

  assert.throws(
    () => adoptPlanRecord(built.record, { actorId: 'manager-1', adoptedAt: '2026-08-27T11:00:00Z', expectedInputHash: built.record.inputHash }),
    (error) => {
      assert.ok(error instanceof PlanAdoptionError);
      assert.equal(error.code, 'FEASIBILITY_ACK_STALE');
      assert.equal(error.context.sectionKey, 'program_budget');
      assert.equal(error.context.gapId, 'doors-capacity');
      assert.equal(error.context.previousGap.gap, 3300);
      assert.equal(error.context.currentGap.gap, 6000);
      return true;
    },
  );
});
