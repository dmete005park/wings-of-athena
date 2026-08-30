const test = require('node:test');
const assert = require('node:assert/strict');
const { adoptionBlockerItems, incompleteItems } = require('../dist/adoptLabels.cjs');

function emptyChannel(enabled) {
  return {
    enabled,
    uniqueReachTarget: null,
    reachableUniverse: null,
    contactDepthTarget: null,
    attemptsPerCompletedShift: null,
    allocatedCompletedShifts: null,
  };
}

function draftWithChannels(doors, phones = emptyChannel(false)) {
  return { programBudget: { channels: { doors, phones } } };
}

function looksInternal(text) {
  return /PLAN_|FEASIBILITY_|program_budget|path_to_victory|campaign_setup|channelCapacityInputs|supportIdCoverageTarget/.test(text);
}

test('incomplete keys become plain labels with a route, never raw section keys', () => {
  const items = incompleteItems(
    [
      'campaign_setup.office',
      'program_budget.resourcePoolWorkers',
      'program_budget.supportIdCoverageTarget',
      'program_budget.channelCapacityInputs',
    ],
    draftWithChannels(emptyChannel(true)),
  );

  assert.deepEqual(items.map((item) => item.label), [
    'Campaign: office',
    'Program & Budget: workers',
    'Program & Budget: ID coverage',
    'Doors: unique reach, reachable, contact depth, attempts per shift, allocated shifts',
  ]);
  assert.equal(items[0].href, '#campaign-setup');
  assert.equal(items[1].href, '#capacity-pool');
  assert.equal(items[2].href, '#support-ids');
  assert.equal(items[3].href, '#channel-doors');
  assert.equal(items.some((item) => looksInternal(item.label)), false);
});

test('channelCapacityInputs expands only the fields that channel is missing', () => {
  const items = incompleteItems(
    ['program_budget.channelCapacityInputs'],
    draftWithChannels({
      enabled: true,
      uniqueReachTarget: 1000,
      reachableUniverse: 1200,
      contactDepthTarget: 2,
      attemptsPerCompletedShift: null,
      allocatedCompletedShifts: 50,
    }),
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].label, 'Doors: attempts per shift');
});

test('channelCapacityInputs is omitted when only pool fields are missing', () => {
  const items = incompleteItems(
    ['program_budget.resourcePoolWorkers', 'program_budget.channelCapacityInputs'],
    draftWithChannels({
      enabled: true,
      uniqueReachTarget: 1000,
      reachableUniverse: 1200,
      contactDepthTarget: 2,
      attemptsPerCompletedShift: 40,
      allocatedCompletedShifts: 50,
    }),
  );
  assert.deepEqual(items.map((item) => item.label), ['Program & Budget: workers']);
});

test('duplicate PLAN_SECTION_INCOMPLETE blockers collapse to one line per section', () => {
  const items = adoptionBlockerItems([
    { code: 'PLAN_SECTION_INCOMPLETE', context: { sectionKey: 'program_budget', missingKeys: ['resourcePoolWorkers'] } },
    { code: 'PLAN_SECTION_INCOMPLETE', context: { sectionKey: 'program_budget', missingKeys: ['channelCapacityInputs'] } },
    { code: 'PLAN_SECTION_INCOMPLETE', context: { sectionKey: 'campaign_setup', missingKeys: ['office'] } },
    { code: 'PLAN_RECALC_REQUIRED', context: { recalculationReasons: ['INPUT_HASH_MISMATCH'] } },
    { code: 'FEASIBILITY_ACK_REQUIRED', context: { gapId: 'capacity:doors' } },
  ]);

  assert.deepEqual(items.map((item) => item.label), [
    'Finish Program & Budget',
    'Finish Campaign Setup',
    'The plan changed after it was last calculated. Save again.',
    'Acknowledge the doors capacity shortfall.',
  ]);
  assert.equal(items.some((item) => looksInternal(item.label)), false);
});
