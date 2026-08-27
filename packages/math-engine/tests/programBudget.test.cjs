const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateProgramBudgetFeasibility } = require('../dist');

test('split diagnosis keeps reachability and capacity gaps separate with remediation quantities', () => {
  const result = calculateProgramBudgetFeasibility({
    remainingActiveDays: 10,
    resourcePools: [{ resourcePoolId: 'field-volunteers', workers: 20, completedShiftsPerWorker: 3 }],
    channels: [{
      channelId: 'doors',
      resourcePoolId: 'field-volunteers',
      uniqueReachTarget: 32400,
      reachableUniverse: 30100,
      contactDepthTarget: 1,
      attemptsPerCompletedShift: 100,
      allocatedCompletedShifts: 268,
      volunteerFlakeRate: 0.2,
      costPerCompletedShift: 75,
    }],
  });

  assert.equal(result.value?.channels[0].reachabilityGap, 2300);
  assert.equal(result.value?.channels[0].capacitySupportedUniverse, 26800);
  assert.equal(result.value?.channels[0].capacityGap, 3300);
  assert.equal(result.value?.channels[0].additionalAttemptsRequired, 3300);
  assert.equal(result.value?.channels[0].additionalCompletedShiftsRequired, 33);
  assert.equal(result.value?.channels[0].additionalScheduledShiftsRequired, 42);
  assert.equal(result.value?.channels[0].additionalWorkersRequired, 11);
  assert.equal(result.value?.channels[0].additionalCompletedShiftsPerActiveDay, 3.3);
  assert.equal(result.value?.channels[0].additionalScheduledShiftsPerActiveDay, 4.2);
  assert.equal(result.value?.channels[0].incrementalCost, 2475);
});

test('shared resource pool prevents doors and phones from each claiming the full worker pool', () => {
  const result = calculateProgramBudgetFeasibility({
    resourcePools: [{ resourcePoolId: 'shared-volunteers', workers: 10, completedShiftsPerWorker: 4 }],
    channels: [
      {
        channelId: 'doors',
        resourcePoolId: 'shared-volunteers',
        uniqueReachTarget: 1000,
        reachableUniverse: 1000,
        contactDepthTarget: 1,
        attemptsPerCompletedShift: 50,
        allocatedCompletedShifts: 25,
      },
      {
        channelId: 'phones',
        resourcePoolId: 'shared-volunteers',
        uniqueReachTarget: 1500,
        reachableUniverse: 1500,
        contactDepthTarget: 1,
        attemptsPerCompletedShift: 100,
        allocatedCompletedShifts: 25,
      },
    ],
  });

  const pool = result.value?.resourcePools[0];
  assert.equal(pool.availableCompletedShifts, 40);
  assert.equal(pool.allocatedCompletedShifts, 50);
  assert.equal(pool.overAllocatedCompletedShifts, 10);
  assert.ok(result.issues.some((issue) => issue.code === 'RESOURCE_POOL_OVERALLOCATED'));
});

test('dedicated teams are modeled as separate resource pools', () => {
  const result = calculateProgramBudgetFeasibility({
    resourcePools: [
      { resourcePoolId: 'door-vendor', workers: 8, completedShiftsPerWorker: 5 },
      { resourcePoolId: 'phone-team', workers: 6, completedShiftsPerWorker: 5 },
    ],
    channels: [
      {
        channelId: 'doors', resourcePoolId: 'door-vendor', uniqueReachTarget: 1000, reachableUniverse: 1000,
        contactDepthTarget: 1, attemptsPerCompletedShift: 50, allocatedCompletedShifts: 20,
      },
      {
        channelId: 'phones', resourcePoolId: 'phone-team', uniqueReachTarget: 1500, reachableUniverse: 1500,
        contactDepthTarget: 1, attemptsPerCompletedShift: 100, allocatedCompletedShifts: 15,
      },
    ],
  });

  assert.equal(result.value?.resourcePools.length, 2);
  assert.ok(result.value?.resourcePools.every((pool) => pool.overAllocatedCompletedShifts === 0));
});
