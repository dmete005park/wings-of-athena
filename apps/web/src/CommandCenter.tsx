import { useEffect, useMemo, useState } from 'react';
import {
  classifyKpiPace,
  deriveWinningPathStatus,
  metricDefinition,
  type DecisionAlert,
  type KpiPaceResult,
  type WinningPathStatus,
} from '@wings/math-engine';
import type { FeasibilityAcknowledgment, JsonValue, PlanVersionRecord, ScenarioName } from '@wings/plan-domain';
import {
  emptyActuals,
  getActuals,
  saveActuals,
  type CampaignActuals,
} from './storage/localActualsStore';

const num = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const dec1 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

// Accumulation goals the manager tracks against actuals. These read from the
// adopted plan's calculation snapshots by metricKey; nothing is recomputed.
const TRACKABLE_KPIS: Array<{ metricKey: string; label: string; unit: string }> = [
  { metricKey: 'victory.vote_goal', label: 'Vote goal', unit: 'votes' },
  { metricKey: 'universe.strategic_desired', label: 'Voter universe', unit: 'voters' },
  { metricKey: 'outreach.attempts_goal.doors', label: 'Door attempts', unit: 'attempts' },
  { metricKey: 'outreach.attempts_goal.phones', label: 'Phone attempts', unit: 'attempts' },
  { metricKey: 'outreach.successful_contacts_expected.doors', label: 'Door contacts', unit: 'contacts' },
  { metricKey: 'outreach.successful_contacts_expected.phones', label: 'Phone contacts', unit: 'contacts' },
  { metricKey: 'support_ids.required', label: 'Support IDs', unit: 'IDs' },
  { metricKey: 'support_ids.expected_votes.doors', label: 'Door votes from IDs', unit: 'votes' },
  { metricKey: 'support_ids.expected_votes.phones', label: 'Phone votes from IDs', unit: 'votes' },
  { metricKey: 'capacity.completed_shifts_required.doors', label: 'Door shifts', unit: 'shifts' },
  { metricKey: 'capacity.completed_shifts_required.phones', label: 'Phone shifts', unit: 'shifts' },
];

const STATUS_META: Record<WinningPathStatus, { label: string; className: string; rank: number }> = {
  AT_RISK: { label: 'AT RISK', className: 'at-risk', rank: 0 },
  WATCH: { label: 'WATCH', className: 'watch', rank: 1 },
  UNAVAILABLE: { label: 'NO DATA', className: 'no-data', rank: 2 },
  ON_TRACK: { label: 'ON TRACK', className: 'on-track', rank: 3 },
};

function readNumber(value: JsonValue | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isAdopted(plan: PlanVersionRecord | null): boolean {
  return plan?.status === 'ADOPTED' || plan?.status === 'ADOPTED_REFORECAST';
}

interface TrackedKpi {
  metricKey: string;
  label: string;
  unit: string;
  adoptedGoal: number;
  completedActual: number | null;
  recentPace: number | null;
  formulaId: string;
  modeledValue: JsonValue;
  result: KpiPaceResult;
}

export default function CommandCenter({
  plan,
  planVersionId,
  scenario,
}: {
  plan: PlanVersionRecord | null;
  planVersionId: string;
  scenario: ScenarioName;
}) {
  const [actuals, setActuals] = useState<CampaignActuals | null>(() => getActuals(planVersionId));
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [overallOpen, setOverallOpen] = useState(false);

  useEffect(() => {
    setActuals(getActuals(planVersionId));
    setEditing(false);
    setExpanded(new Set());
    setOverallOpen(false);
  }, [planVersionId]);

  const adopted = isAdopted(plan);

  const horizonDays = useMemo(() => {
    if (!plan) return null;
    const programBudget = (plan.inputs?.['programBudget'] ?? null) as Record<string, JsonValue> | null;
    return programBudget ? readNumber(programBudget['remainingActiveDays']) : null;
  }, [plan]);

  const tracked = useMemo<TrackedKpi[]>(() => {
    if (!plan || !adopted) return [];
    const daysKnown = actuals != null && actuals.remainingActiveDays != null;
    const remainingActiveDays = actuals?.remainingActiveDays ?? 0;
    const out: TrackedKpi[] = [];
    for (const kpi of TRACKABLE_KPIS) {
      const calc = plan.calculations.find((c) => c.metricKey === kpi.metricKey);
      const adoptedGoal = calc ? readNumber(calc.adoptedValue) : null;
      if (calc == null || adoptedGoal == null) continue;
      const entry = actuals?.byMetric[kpi.metricKey];
      const completedActual = entry?.completedActual ?? null;
      const recent = entry?.observedRecentDailyPace ?? undefined;
      const hasActuals = daysKnown && completedActual != null;
      const originalPlannedDailyPace = horizonDays && horizonDays > 0 ? adoptedGoal / horizonDays : undefined;
      const result = classifyKpiPace({
        metricKey: kpi.metricKey,
        adoptedGoal,
        completedActual: completedActual ?? 0,
        remainingActiveDays,
        observedRecentDailyPace: recent,
        originalPlannedDailyPace,
        hasActuals,
      });
      out.push({
        metricKey: kpi.metricKey,
        label: kpi.label,
        unit: kpi.unit,
        adoptedGoal,
        completedActual,
        recentPace: recent ?? null,
        formulaId: calc.formulaId,
        modeledValue: calc.modeledValue,
        result,
      });
    }
    return out.sort((a, b) => STATUS_META[a.result.status].rank - STATUS_META[b.result.status].rank);
  }, [plan, adopted, actuals, horizonDays]);

  const overall = useMemo(() => {
    const withData = tracked.filter((t) => t.result.status !== 'UNAVAILABLE');
    if (withData.length === 0) {
      return {
        status: 'UNAVAILABLE' as WinningPathStatus,
        triggeringRuleIds: [] as string[],
        triggeringAlerts: [] as DecisionAlert[],
        missingRequiredInputs: tracked.map((t) => t.label),
      };
    }
    const alerts = withData
      .map((t) => t.result.alert)
      .filter((a): a is DecisionAlert => a != null);
    return deriveWinningPathStatus(alerts);
  }, [tracked]);

  if (!plan || !adopted) {
    return (
      <section className="cc-empty" aria-label="Command Center">
        <p className="eyebrow">Command Center</p>
        <h2>No adopted plan for {String(scenario)} yet</h2>
        <p className="cc-empty-copy">
          Command Center tracks actuals against an adopted plan. Adopt a plan in the Plan view to begin tracking.
        </p>
      </section>
    );
  }

  const activeCards = tracked.filter((t) => t.result.status !== 'ON_TRACK');
  const onTrackCards = tracked.filter((t) => t.result.status === 'ON_TRACK');
  const throughLabel = actuals?.throughDate ? `Actuals through ${actuals.throughDate}` : 'No actuals imported yet';

  return (
    <section className="cc" aria-label="Command Center">
      <div className="cc-head">
        <div>
          <p className="eyebrow">Command Center · {String(scenario)}</p>
          <p className="cc-through">{throughLabel}</p>
        </div>
        <button type="button" className="secondary-button" onClick={() => setEditing((v) => !v)}>
          {actuals ? 'Update actuals' : 'Enter actuals'}
        </button>
      </div>

      <OverallStatus overall={overall} open={overallOpen} onToggle={() => setOverallOpen((v) => !v)} />

      {editing && (
        <ActualsForm
          planVersionId={planVersionId}
          kpis={tracked}
          initial={actuals ?? emptyActuals()}
          onCancel={() => setEditing(false)}
          onSave={(next) => {
            saveActuals(planVersionId, next);
            setActuals(next);
            setEditing(false);
          }}
        />
      )}

      <div className="cc-cards">
        {activeCards.map((kpi) => (
          <KpiCard
            key={kpi.metricKey}
            kpi={kpi}
            plan={plan}
            open={expanded.has(kpi.metricKey)}
            onToggle={() =>
              setExpanded((prev) => {
                const next = new Set(prev);
                if (next.has(kpi.metricKey)) next.delete(kpi.metricKey);
                else next.add(kpi.metricKey);
                return next;
              })
            }
          />
        ))}
      </div>

      {onTrackCards.length > 0 && (
        <details className="cc-ontrack">
          <summary>On track ({onTrackCards.length})</summary>
          <div className="cc-cards">
            {onTrackCards.map((kpi) => (
              <KpiCard
                key={kpi.metricKey}
                kpi={kpi}
                plan={plan}
                open={expanded.has(kpi.metricKey)}
                onToggle={() =>
                  setExpanded((prev) => {
                    const next = new Set(prev);
                    if (next.has(kpi.metricKey)) next.delete(kpi.metricKey);
                    else next.add(kpi.metricKey);
                    return next;
                  })
                }
              />
            ))}
          </div>
        </details>
      )}

      <AcceptedConstraints acknowledgments={plan.feasibilityAcknowledgments} />
    </section>
  );
}

function constraintWord(type: FeasibilityAcknowledgment['constraintType']): string {
  switch (type) {
    case 'CAPACITY': return 'Capacity';
    case 'COST': return 'Cost';
    case 'REACHABILITY': return 'Reachability';
    case 'ALLOCATION': return 'Allocation';
    default: return 'Constraint';
  }
}

function formatAckDate(iso: string): string {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime())
    ? iso
    : parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// Level-2 labels come from METRIC_REGISTRY. Channel-suffixed keys
// (universe.capacity_supported.doors) resolve by stripping trailing segments.
// Unregistered universe.* keys (reachable by channel) inherit the strategic
// universe label. Any other miss keeps the raw key rather than inventing a name.
function lookupMetric(key: string) {
  let candidate = key;
  for (;;) {
    const found = metricDefinition(candidate);
    if (found) return found;
    const dot = candidate.lastIndexOf('.');
    if (dot <= 0) return undefined;
    candidate = candidate.slice(0, dot);
  }
}

function metricLabel(key: string): string {
  const def = lookupMetric(key)
    ?? (key.startsWith('universe.') ? metricDefinition('universe.strategic_desired') : undefined);
  if (!def) return key;
  const hyphenated = def.displayName.match(/[A-Za-z]+(?:-[A-Za-z]+)+/);
  if (hyphenated) return hyphenated[0].replace(/-/g, ' ').toLowerCase();
  const words = def.displayName.trim().split(/\s+/);
  return (words[words.length - 1] ?? def.displayName).toLowerCase();
}

// Level-2 context: the acknowledgments the manager accepted at adoption, read
// from the adopted record so the decision survives into the running campaign —
// constraint by cause, the numbers at the time of acceptance, and the reason.
// Placed below the pacing cards and collapsed so it never competes with status.
function AcceptedConstraints({ acknowledgments }: { acknowledgments: FeasibilityAcknowledgment[] }) {
  if (!acknowledgments || acknowledgments.length === 0) return null;
  return (
    <details className="cc-acks">
      <summary>Accepted constraints ({acknowledgments.length})</summary>
      <div className="cc-acks-list">
        {acknowledgments.map((ack) => (
          <article key={ack.acknowledgmentId} className="cc-ack">
            <p className="cc-ack-lead">
              <strong>{constraintWord(ack.constraintType)} constraint</strong> accepted {formatAckDate(ack.acknowledgedAt)}.
            </p>
            <p className="cc-ack-nums">
              Strategic {metricLabel(ack.strategicMetricKey)} was <span className="tabular">{num.format(ack.strategicValue)}</span>; operational {metricLabel(ack.operationalMetricKey)} <span className="tabular">{num.format(ack.operationalValue)}</span>.
            </p>
            <p className="cc-ack-gap">Gap at acceptance: <span className="tabular">{num.format(ack.gap)}</span>.</p>
            <p className="cc-ack-reason">Manager reason: {ack.reason}</p>
          </article>
        ))}
      </div>
    </details>
  );
}

function StatusRing({ status }: { status: WinningPathStatus }) {
  const meta = STATUS_META[status];
  return <span className={`cc-ring cc-ring-${meta.className}`} aria-hidden="true" />;
}

function OverallStatus({
  overall,
  open,
  onToggle,
}: {
  overall: { status: WinningPathStatus; triggeringRuleIds: string[]; triggeringAlerts: DecisionAlert[]; missingRequiredInputs: string[] };
  open: boolean;
  onToggle: () => void;
}) {
  const meta = STATUS_META[overall.status];
  return (
    <div className="cc-overall">
      <button type="button" className="cc-status-btn cc-overall-btn" onClick={onToggle} aria-expanded={open}>
        <StatusRing status={overall.status} />
        <span className="cc-status-label">{meta.label}</span>
        <span className="cc-tap-hint">{open ? 'Hide why' : 'Why?'}</span>
      </button>
      {open && (
        <div className="cc-why">
          {overall.status === 'UNAVAILABLE' ? (
            <p>Waiting on actuals for: {overall.missingRequiredInputs.join(', ') || 'all KPIs'}.</p>
          ) : overall.triggeringAlerts.length > 0 ? (
            <ul>
              {overall.triggeringAlerts.map((alert, index) => (
                <li key={`${alert.ruleId ?? alert.code}-${index}`}>
                  <span className="cc-rule-id">{alert.ruleId ?? alert.code}</span>
                  <span>{alert.message}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p>Every tracked KPI is projected to meet its adopted goal.</p>
          )}
        </div>
      )}
    </div>
  );
}

function KpiCard({
  kpi,
  plan,
  open,
  onToggle,
}: {
  kpi: TrackedKpi;
  plan: PlanVersionRecord;
  open: boolean;
  onToggle: () => void;
}) {
  const { result } = kpi;
  const meta = STATUS_META[result.status];
  const pace = result.pace;
  const shortfall = pace?.projectedShortfall ?? null;
  const hasGap = shortfall != null && shortfall > 0;
  const hasActuals = result.status !== 'UNAVAILABLE' || (kpi.completedActual != null);
  const overrides = plan.overrides.filter((o) => o.metricKey === kpi.metricKey);

  return (
    <article className={`cc-card cc-card-${meta.className}`}>
      <div className="cc-card-head">
        <h3>{kpi.label}</h3>
        <button type="button" className={`cc-status-btn cc-status-${meta.className}`} onClick={onToggle} aria-expanded={open}>
          <StatusRing status={result.status} />
          <span className="cc-status-label">{meta.label}</span>
        </button>
      </div>

      <dl className="cc-l1">
        <div>
          <dt>Adopted goal</dt>
          <dd className="tabular">{num.format(kpi.adoptedGoal)} {kpi.unit}</dd>
        </div>
        <div>
          <dt>Actual to date</dt>
          <dd className="tabular">{kpi.completedActual != null ? num.format(kpi.completedActual) : 'No actuals yet'}</dd>
        </div>
        {hasGap && (
          <div className="cc-gap">
            <dt>Projected gap</dt>
            <dd className="tabular">{num.format(shortfall as number)} {kpi.unit} behind</dd>
          </div>
        )}
      </dl>

      {open && (
        <div className="cc-detail">
          <div className="cc-why">
            {result.status === 'UNAVAILABLE' ? (
              <p>Waiting on: {result.missingInputs.join(', ') || 'actuals'}.</p>
            ) : result.alert ? (
              <p>
                <span className="cc-rule-id">{result.alert.ruleId ?? result.alert.code}</span>
                {result.alert.message}
              </p>
            ) : (
              <p>Projected to meet the adopted goal at the recent pace.</p>
            )}
          </div>

          {hasActuals && pace && (
            <dl className="cc-l2">
              <div>
                <dt>Percent complete</dt>
                <dd className="tabular">{kpi.adoptedGoal > 0 && kpi.completedActual != null ? `${num.format((kpi.completedActual / kpi.adoptedGoal) * 100)}%` : '—'}</dd>
              </div>
              <div>
                <dt>Required pace</dt>
                <dd className="tabular">{pace.requiredDailyPace != null ? `${dec1.format(pace.requiredDailyPace)}/day` : '—'}</dd>
              </div>
              <div>
                <dt>Recent pace</dt>
                <dd className="tabular">{kpi.recentPace != null ? `${dec1.format(kpi.recentPace)}/day` : '—'}</dd>
              </div>
              <div>
                <dt>Projected final</dt>
                <dd className="tabular">{pace.projectedFinal != null ? num.format(pace.projectedFinal) : '—'}</dd>
              </div>
            </dl>
          )}

          <details className="cc-audit">
            <summary>Audit</summary>
            <dl className="plan-meta plan-meta-audit">
              <div><dt>Metric key</dt><dd>{kpi.metricKey}</dd></div>
              <div><dt>Formula ID</dt><dd>{kpi.formulaId}</dd></div>
              <div><dt>Modeled vs adopted</dt><dd className="tabular">{String(kpi.modeledValue)} · {num.format(kpi.adoptedGoal)}</dd></div>
              <div><dt>Overrides</dt><dd>{overrides.length === 0 ? 'none' : `${overrides.length} recorded`}</dd></div>
              <div><dt>Input hash</dt><dd>{plan.inputHash}</dd></div>
              <div><dt>Engine</dt><dd>{plan.mathEngineVersion}</dd></div>
              <div><dt>Calibration</dt><dd>{plan.calibrationProfileVersion ?? 'none'}</dd></div>
            </dl>
          </details>
        </div>
      )}
    </article>
  );
}

function ActualsForm({
  planVersionId,
  kpis,
  initial,
  onSave,
  onCancel,
}: {
  planVersionId: string;
  kpis: TrackedKpi[];
  initial: CampaignActuals;
  onSave: (next: CampaignActuals) => void;
  onCancel: () => void;
}) {
  const [throughDate, setThroughDate] = useState(initial.throughDate);
  const [remainingDays, setRemainingDays] = useState<string>(initial.remainingActiveDays?.toString() ?? '');
  const [rows, setRows] = useState<Record<string, { actual: string; recent: string }>>(() => {
    const seed: Record<string, { actual: string; recent: string }> = {};
    for (const kpi of kpis) {
      const entry = initial.byMetric[kpi.metricKey];
      seed[kpi.metricKey] = {
        actual: entry?.completedActual?.toString() ?? '',
        recent: entry?.observedRecentDailyPace?.toString() ?? '',
      };
    }
    return seed;
  });

  const toNum = (value: string): number | null => {
    if (value.trim() === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const submit = () => {
    const byMetric: CampaignActuals['byMetric'] = {};
    for (const kpi of kpis) {
      const row = rows[kpi.metricKey];
      byMetric[kpi.metricKey] = {
        completedActual: toNum(row?.actual ?? ''),
        observedRecentDailyPace: toNum(row?.recent ?? ''),
      };
    }
    onSave({ throughDate, remainingActiveDays: toNum(remainingDays), byMetric });
  };

  return (
    <div className="cc-form panel">
      <div className="panel-heading"><div><p className="eyebrow">Actuals</p><h2>Enter actuals</h2></div></div>
      <p className="cc-form-note">Manager-entered. There is no import pipeline yet; these are stored locally and compared against the adopted goals.</p>
      <div className="cc-form-grid">
        <label className="field"><span>Actuals through</span><input type="date" value={throughDate} onChange={(e) => setThroughDate(e.target.value)} /></label>
        <label className="field"><span>Active days remaining</span><input type="number" min="0" value={remainingDays} onChange={(e) => setRemainingDays(e.target.value)} /></label>
      </div>
      {kpis.map((kpi) => (
        <div key={kpi.metricKey} className="cc-form-kpi">
          <h3>{kpi.label}</h3>
          <div className="cc-form-grid">
            <label className="field"><span>Actual to date</span><input type="number" min="0" value={rows[kpi.metricKey]?.actual ?? ''} onChange={(e) => setRows((prev) => ({ ...prev, [kpi.metricKey]: { ...prev[kpi.metricKey], actual: e.target.value } }))} /></label>
            <label className="field"><span>Recent daily pace</span><input type="number" min="0" value={rows[kpi.metricKey]?.recent ?? ''} onChange={(e) => setRows((prev) => ({ ...prev, [kpi.metricKey]: { ...prev[kpi.metricKey], recent: e.target.value } }))} /></label>
          </div>
        </div>
      ))}
      <div className="cc-form-actions">
        <button type="button" className="secondary-button" onClick={onCancel}>Cancel</button>
        <button type="button" className="primary-button" onClick={submit}>Save actuals</button>
      </div>
    </div>
  );
}
