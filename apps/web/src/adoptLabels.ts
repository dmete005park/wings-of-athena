import type { AdoptionBlocker } from '@wings/plan-domain';

export interface ChannelCapacityDraft {
  enabled: boolean;
  uniqueReachTarget: number | null;
  reachableUniverse: number | null;
  contactDepthTarget: number | null;
  attemptsPerCompletedShift: number | null;
  allocatedCompletedShifts: number | null;
}

export interface IncompleteDraft {
  programBudget: {
    channels: Record<string, ChannelCapacityDraft>;
  };
}

export interface IncompleteItem {
  key: string;
  label: string;
  href: string;
}

export interface BlockerItem {
  key: string;
  label: string;
  href?: string;
}

const SECTION_HREF: Record<string, string> = {
  campaign_setup: '#campaign-setup',
  path_to_victory: '#path-to-victory',
  program_budget: '#program-budget',
};

const SECTION_NAME: Record<string, string> = {
  campaign_setup: 'Campaign Setup',
  path_to_victory: 'Path to Victory',
  program_budget: 'Program & Budget',
};

const FIELD_LINE: Record<string, { label: string; href: string }> = {
  'campaign_setup.campaignName': { label: 'Campaign: campaign name', href: '#campaign-setup' },
  'campaign_setup.office': { label: 'Campaign: office', href: '#campaign-setup' },
  'campaign_setup.electionDate': { label: 'Campaign: election date', href: '#campaign-setup' },
  'campaign_setup.geography': { label: 'Campaign: geography', href: '#campaign-setup' },
  'path_to_victory.electorate': { label: 'Path to Victory: turnout', href: '#path-to-victory' },
  'path_to_victory.raceRule': { label: 'Campaign: race rule', href: '#campaign-setup' },
  'path_to_victory.voteGoal': { label: 'Path to Victory: vote goal', href: '#path-to-victory' },
  'path_to_victory.strategicUniverse': { label: 'Path to Victory: universe', href: '#path-to-victory' },
  'program_budget.enabledChannel': { label: 'Program & Budget: turn on a channel', href: '#program-budget' },
  'program_budget.resourcePoolWorkers': { label: 'Program & Budget: workers', href: '#capacity-pool' },
  'program_budget.completedShiftsPerWorker': { label: 'Program & Budget: shifts per worker', href: '#capacity-pool' },
  'program_budget.supportIdCoverageTarget': { label: 'Program & Budget: ID coverage', href: '#support-ids' },
  'program_budget.supporterTurnoutRate': { label: 'Program & Budget: supporter turnout', href: '#support-ids' },
};

const CHANNEL_FIELD_CHECKS: Array<{
  key: keyof ChannelCapacityDraft;
  label: string;
  present: (value: number | null) => boolean;
}> = [
  { key: 'uniqueReachTarget', label: 'unique reach', present: positive },
  { key: 'reachableUniverse', label: 'reachable', present: nonNegative },
  { key: 'contactDepthTarget', label: 'contact depth', present: positive },
  { key: 'attemptsPerCompletedShift', label: 'attempts per shift', present: positive },
  { key: 'allocatedCompletedShifts', label: 'allocated shifts', present: nonNegative },
];

function positive(value: number | null): boolean {
  return value !== null && Number.isFinite(value) && value > 0;
}

function nonNegative(value: number | null): boolean {
  return value !== null && Number.isFinite(value) && value >= 0;
}

function channelTitle(channelId: string): string {
  if (channelId === 'doors') return 'Doors';
  if (channelId === 'phones') return 'Phones';
  return channelId.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function missingChannelFields(channel: ChannelCapacityDraft): string[] {
  return CHANNEL_FIELD_CHECKS.filter((field) => !field.present(channel[field.key] as number | null)).map((field) => field.label);
}

function expandChannelCapacity(draft: IncompleteDraft | undefined): IncompleteItem[] {
  const channels = draft?.programBudget.channels ?? {};
  const items: IncompleteItem[] = [];
  for (const [channelId, channel] of Object.entries(channels)) {
    if (!channel.enabled) continue;
    const missing = missingChannelFields(channel);
    if (missing.length === 0) continue;
    items.push({
      key: `program_budget.channelCapacityInputs.${channelId}`,
      label: `${channelTitle(channelId)}: ${missing.join(', ')}`,
      href: `#channel-${channelId}`,
    });
  }
  return items;
}

function fallbackLabel(qualifiedKey: string): IncompleteItem {
  const dot = qualifiedKey.indexOf('.');
  const sectionKey = dot === -1 ? 'plan' : qualifiedKey.slice(0, dot);
  const fieldKey = dot === -1 ? qualifiedKey : qualifiedKey.slice(dot + 1);
  const section = SECTION_NAME[sectionKey] ?? 'Plan';
  const field = fieldKey
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .toLowerCase();
  return {
    key: qualifiedKey,
    label: `${section}: ${field}`,
    href: SECTION_HREF[sectionKey] ?? '#adopt-plan',
  };
}

/** Maps stored section.field keys to manager-facing lines. Never returns a raw key or error code. */
export function incompleteItems(keys: string[], draft?: IncompleteDraft): IncompleteItem[] {
  const items: IncompleteItem[] = [];
  for (const key of keys) {
    if (key === 'program_budget.channelCapacityInputs') {
      const expanded = expandChannelCapacity(draft);
      if (expanded.length > 0) {
        items.push(...expanded);
        continue;
      }
      // Workers / shifts already have their own keys; skip a redundant composite line.
      continue;
    }
    items.push(FIELD_LINE[key] ? { key, ...FIELD_LINE[key] } : fallbackLabel(key));
  }
  return items;
}

function constraintPhrase(gapId: string | undefined): string {
  if (!gapId) return 'a feasibility constraint';
  const [kind, subject] = gapId.split(':');
  const channel = subject === 'doors' || subject === 'phones' ? channelTitle(subject) : null;
  switch (kind) {
    case 'capacity':
      return channel ? `the ${channel.toLowerCase()} capacity shortfall` : 'the capacity shortfall';
    case 'reachability':
      return channel ? `the ${channel.toLowerCase()} reachability gap` : 'the reachability gap';
    case 'allocation':
      return 'the shift allocation conflict';
    case 'cost':
      return 'the budget gap';
    default:
      return 'a feasibility constraint';
  }
}

function sectionFinishLine(sectionKey: string | undefined): { label: string; href: string } {
  const key = sectionKey ?? 'plan';
  const name = SECTION_NAME[key] ?? 'the plan';
  return {
    label: `Finish ${name}`,
    href: SECTION_HREF[key] ?? '#adopt-plan',
  };
}

/** One manager-facing line per blocker, collapsing duplicate incomplete-section codes. */
export function adoptionBlockerItems(blockers: AdoptionBlocker[]): BlockerItem[] {
  const items: BlockerItem[] = [];
  const seenIncompleteSections = new Set<string>();

  for (const [index, blocker] of blockers.entries()) {
    if (blocker.code === 'PLAN_SECTION_INCOMPLETE') {
      const sectionKey = blocker.context.sectionKey ?? 'plan';
      if (seenIncompleteSections.has(sectionKey)) continue;
      seenIncompleteSections.add(sectionKey);
      const line = sectionFinishLine(sectionKey);
      items.push({ key: `incomplete:${sectionKey}`, ...line });
      continue;
    }
    if (blocker.code === 'PLAN_RECALC_REQUIRED') {
      items.push({
        key: `recalc:${index}`,
        label: 'The plan changed after it was last calculated. Save again.',
        href: '#adopt-plan',
      });
      continue;
    }
    if (blocker.code === 'FEASIBILITY_ACK_REQUIRED') {
      items.push({
        key: `ack:${blocker.context.gapId ?? index}`,
        label: `Acknowledge ${constraintPhrase(blocker.context.gapId)}.`,
        href: '#program-budget',
      });
      continue;
    }
    if (blocker.code === 'FEASIBILITY_ACK_STALE') {
      items.push({
        key: `stale:${blocker.context.gapId ?? index}`,
        label: `${constraintPhrase(blocker.context.gapId).replace(/^./, (char) => char.toUpperCase())} changed. Acknowledge it again.`,
        href: '#program-budget',
      });
      continue;
    }
    items.push({
      key: `blocker:${index}`,
      label: 'This plan is not ready to adopt.',
      href: '#adopt-plan',
    });
  }
  return items;
}
