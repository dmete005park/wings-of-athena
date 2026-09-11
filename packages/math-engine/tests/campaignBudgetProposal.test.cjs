const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateCampaignBudgetProposal } = require('../dist');

test('campaign budget proposal rolls up allocated channel costs against available budget', () => {
  const result = calculateCampaignBudgetProposal({
    availableBudget: 40000,
    channels: [
      {
        channelId: 'doors',
        allocatedCompletedShifts: 200,
        costPerCompletedShift: 75,
        additionalCompletedShiftsRequired: 20,
        requiredCompletedShifts: 260,
      },
      {
        channelId: 'phones',
        allocatedCompletedShifts: 100,
        costPerCompletedShift: 40,
        additionalCompletedShiftsRequired: 0,
        requiredCompletedShifts: 100,
      },
    ],
  });

  assert.equal(result.value?.channelLines[0].allocatedCost, 15000);
  assert.equal(result.value?.channelLines[1].allocatedCost, 4000);
  assert.equal(result.value?.modeledProgramCost, 19000);
  assert.equal(result.value?.availableBudget, 40000);
  assert.equal(result.value?.remainingBudget, 21000);
  assert.equal(result.value?.budgetGap, 0);
  assert.equal(result.value?.capacityCloseCost, 1500);
  assert.equal(result.value?.requiredProgramCost, 23500);
  assert.deepEqual(result.value?.incompleteCostChannelIds, []);
});

test('campaign budget proposal reports NO DATA when a channel unit cost is missing', () => {
  const result = calculateCampaignBudgetProposal({
    availableBudget: 10000,
    channels: [
      { channelId: 'doors', allocatedCompletedShifts: 50, costPerCompletedShift: 80 },
      { channelId: 'phones', allocatedCompletedShifts: 40, additionalCompletedShiftsRequired: 10 },
    ],
  });

  assert.equal(result.value?.channelLines[1].allocatedCost, null);
  assert.equal(result.value?.modeledProgramCost, null);
  assert.deepEqual(result.value?.incompleteCostChannelIds, ['phones']);
  assert.equal(result.value?.remainingBudget, null);
  assert.equal(result.value?.capacityCloseCost, null);
  assert.deepEqual(result.value?.incompleteCapacityCostChannelIds, ['phones']);
});

test('campaign budget proposal surfaces overspend as a budget gap', () => {
  const result = calculateCampaignBudgetProposal({
    availableBudget: 5000,
    channels: [
      { channelId: 'doors', allocatedCompletedShifts: 100, costPerCompletedShift: 75 },
    ],
  });

  assert.equal(result.value?.modeledProgramCost, 7500);
  assert.equal(result.value?.remainingBudget, -2500);
  assert.equal(result.value?.budgetGap, 2500);
});
