const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateProgramBudgetFeasibility } = require('../dist');

test('allocation conflict identifies competing channels and shifts that must move', () => {
  const result = calculateProgramBudgetFeasibility({
    resourcePools: [{ resourcePoolId: 'shared', workers: 10, completedShiftsPerWorker: 4 }],
    channels: [
      {
        channelId: 'doors', resourcePoolId: 'shared', uniqueReachTarget: 1000, reachableUniverse: 1000,
        contactDepthTarget: 1, attemptsPerCompletedShift: 50, allocatedCompletedShifts: 25,
      },
      {
        channelId: 'phones', resourcePoolId: 'shared', uniqueReachTarget: 1500, reachableUniverse: 1500,
        contactDepthTarget: 1, attemptsPerCompletedShift: 100, allocatedCompletedShifts: 25,
      },
    ],
  });

  const conflict = result.value?.allocationConflicts[0];
  assert.equal(conflict.resourcePoolId, 'shared');
  assert.deepEqual(conflict.competingChannelIds, ['doors', 'phones']);
  assert.equal(conflict.shiftsToReallocate, 10);
  assert.deepEqual(conflict.channelAllocations, [
    { channelId: 'doors', allocatedCompletedShifts: 25 },
    { channelId: 'phones', allocatedCompletedShifts: 25 },
  ]);
});
