// Command Center actuals are tracking data, not plan state. They are stored
// separately from the plan record and are never written back onto a
// PlanVersionRecord, so reading/writing them cannot mutate an adopted plan.
// There is no server-side or file import pipeline yet; this is a local,
// manager-entered path kept inside src/storage/ per the web-ui storage rule.

const STORAGE_KEY = 'wings.actuals.v1';

export interface KpiActual {
  completedActual: number | null;
  observedRecentDailyPace: number | null;
}

export interface CampaignActuals {
  throughDate: string;
  remainingActiveDays: number | null;
  byMetric: Record<string, KpiActual>;
}

export function emptyActuals(): CampaignActuals {
  return { throughDate: '', remainingActiveDays: null, byMetric: {} };
}

function readAll(): Record<string, CampaignActuals> {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function getActuals(planVersionId: string): CampaignActuals | null {
  return readAll()[planVersionId] ?? null;
}

export function saveActuals(planVersionId: string, actuals: CampaignActuals): void {
  const all = readAll();
  all[planVersionId] = actuals;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}
