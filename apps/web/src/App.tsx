import { useEffect, useMemo, useState } from 'react';
import {
  MATH_ENGINE_VERSION,
  calculateCampaignVoteGoal,
  calculateExpectedElectorate,
  calculateRaceThreshold,
  constructStrategicUniverse,
} from '@wings/math-engine';
import { computeInputHash } from '@wings/plan-domain';
import type { JsonValue, PlanVersionRecord } from '@wings/plan-domain';
import { LocalPlanStore } from './storage/localPlanStore';

const formatNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const STORAGE_KEY = 'wings.campaignDraft.v1';
const CAMPAIGN_ID_KEY = 'wings.currentCampaignId.v1';
const PLAN_ID_KEY = 'wings.currentPlanVersionId.v1';
const PLAN_CREATED_AT_KEY = 'wings.currentPlanCreatedAt.v1';

type ElectionType = 'PRIMARY' | 'GENERAL' | 'MUNICIPAL' | 'SPECIAL' | 'OTHER';

type PlanActionState =
  | { kind: 'IDLE'; message: string }
  | { kind: 'SAVED'; message: string }
  | { kind: 'ADOPTED'; message: string }
  | { kind: 'ERROR'; message: string };

interface CampaignDraft {
  campaignName: string;
  office: string;
  electionDate: string;
  electionType: ElectionType;
  geography: string;
  eligibleVoters: number;
  highCount: number;
  highTurnout: number;
  midCount: number;
  midTurnout: number;
  lowCount: number;
  lowTurnout: number;
  targetShare: number;
  universeMultiplier: number;
}

const starterDraft: CampaignDraft = {
  campaignName: 'Untitled Campaign',
  office: '',
  electionDate: '',
  electionType: 'PRIMARY',
  geography: '',
  eligibleVoters: 60000,
  highCount: 12000,
  highTurnout: 0.82,
  midCount: 22000,
  midTurnout: 0.58,
  lowCount: 26000,
  lowTurnout: 0.28,
  targetShare: 0.5,
  universeMultiplier: 1.6,
};

function loadDraft(): CampaignDraft {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved ? { ...starterDraft, ...JSON.parse(saved) } : starterDraft;
  } catch {
    return starterDraft;
  }
}

function getOrCreateLocalValue(key: string, createValue: () => string): string {
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const value = createValue();
  window.localStorage.setItem(key, value);
  return value;
}

function createLocalId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function App() {
  const [draft, setDraft] = useState<CampaignDraft>(loadDraft);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [planAction, setPlanAction] = useState<PlanActionState>({ kind: 'IDLE', message: 'Plan has not been saved yet.' });
  const [storedPlan, setStoredPlan] = useState<PlanVersionRecord | null>(null);
  const planStore = useMemo(() => new LocalPlanStore(), []);
  const campaignId = useMemo(() => getOrCreateLocalValue(CAMPAIGN_ID_KEY, () => createLocalId('campaign')), []);
  const planVersionId = useMemo(() => getOrCreateLocalValue(PLAN_ID_KEY, () => createLocalId('plan')), []);
  const planCreatedAt = useMemo(() => getOrCreateLocalValue(PLAN_CREATED_AT_KEY, () => new Date().toISOString()), []);

  const update = <K extends keyof CampaignDraft>(key: K, value: CampaignDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    setSavedAt(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
  }, [draft]);

  useEffect(() => {
    planStore.getPlanVersion(planVersionId).then((plan) => {
      setStoredPlan(plan);
      if (plan?.status === 'ADOPTED' || plan?.status === 'ADOPTED_REFORECAST') {
        setPlanAction({ kind: 'ADOPTED', message: 'This plan version is adopted and locked.' });
      } else if (plan) {
        setPlanAction({ kind: 'SAVED', message: 'A plan draft is stored locally.' });
      }
    });
  }, [planStore, planVersionId]);

  const result = useMemo(() => {
    const electorate = calculateExpectedElectorate({
      eligibleVoters: draft.eligibleVoters,
      segmentsAreMutuallyExclusive: true,
      segments: [
        { id: 'high', label: 'High-frequency', count: draft.highCount, turnoutProbability: draft.highTurnout },
        { id: 'mid', label: 'Medium-frequency', count: draft.midCount, turnoutProbability: draft.midTurnout },
        { id: 'low', label: 'Low-frequency', count: draft.lowCount, turnoutProbability: draft.lowTurnout },
      ],
    });

    if (electorate.value === null) return { electorate, threshold: null, voteGoal: null, universe: null };

    const threshold = calculateRaceThreshold(electorate.value, {
      type: 'MAJORITY',
      requiredShare: 0.5,
      strictlyGreater: true,
    });

    const voteGoal = calculateCampaignVoteGoal({
      adoptedExpectedElectorate: electorate.value,
      adoptedTargetShare: draft.targetShare,
      mathematicalThreshold: threshold.value,
    });

    const universe = voteGoal.value === null
      ? null
      : constructStrategicUniverse(voteGoal.value, {
          type: 'VOTE_GOAL_MULTIPLIER',
          multiplier: draft.universeMultiplier,
        });

    return { electorate, threshold, voteGoal, universe };
  }, [draft]);

  const issues = [
    ...result.electorate.issues,
    ...(result.threshold?.issues ?? []),
    ...(result.voteGoal?.issues ?? []),
    ...(result.universe?.issues ?? []),
  ];
  const hasBlockingIssue = issues.some((issue) => issue.level === 'ERROR');
  const hasCompletePlanResult = result.electorate.value != null
    && result.threshold?.value != null
    && result.voteGoal?.value != null
    && result.universe?.value != null;

  const currentPlan = useMemo<PlanVersionRecord | null>(() => {
    if (!hasCompletePlanResult || !result.threshold || !result.voteGoal || !result.universe) return null;

    const inputs: Record<string, JsonValue> = {
      campaignName: draft.campaignName,
      office: draft.office,
      electionDate: draft.electionDate,
      electionType: draft.electionType,
      geography: draft.geography,
      eligibleVoters: draft.eligibleVoters,
      highCount: draft.highCount,
      highTurnout: draft.highTurnout,
      midCount: draft.midCount,
      midTurnout: draft.midTurnout,
      lowCount: draft.lowCount,
      lowTurnout: draft.lowTurnout,
      targetShare: draft.targetShare,
      universeMultiplier: draft.universeMultiplier,
    };
    const inputHash = computeInputHash(inputs);
    const electorateValue = result.electorate.value as number;
    const thresholdValue = result.threshold.value as number;
    const voteGoalValue = result.voteGoal.value as number;
    const universeValue = result.universe.value as number;
    const calculations: PlanVersionRecord['calculations'] = [
      {
        metricKey: 'electorate.expected.modeled',
        modeledValue: electorateValue,
        adoptedValue: electorateValue,
        formulaId: 'electorate.expected.v0.2',
        inputs: { eligibleVoters: draft.eligibleVoters },
        evidenceRefs: [],
        inputHash,
      },
      {
        metricKey: 'victory.threshold',
        modeledValue: thresholdValue,
        adoptedValue: thresholdValue,
        formulaId: 'victory.threshold.majority.v0.2',
        inputs: { expectedElectorate: electorateValue, requiredShare: 0.5 },
        evidenceRefs: [],
        inputHash,
      },
      {
        metricKey: 'victory.vote_goal',
        modeledValue: voteGoalValue,
        adoptedValue: voteGoalValue,
        formulaId: 'victory.vote_goal.v0.2',
        inputs: { expectedElectorate: electorateValue, targetShare: draft.targetShare },
        evidenceRefs: [],
        inputHash,
      },
      {
        metricKey: 'universe.desired',
        modeledValue: universeValue,
        adoptedValue: universeValue,
        formulaId: 'universe.vote_goal_multiplier.v0.2',
        inputs: { voteGoal: voteGoalValue, multiplier: draft.universeMultiplier },
        evidenceRefs: [],
        inputHash,
      },
    ];

    return {
      planVersionId,
      campaignId,
      parentPlanVersionId: null,
      status: 'DRAFT',
      scenario: 'BASE',
      mathEngineVersion: MATH_ENGINE_VERSION,
      calibrationProfileVersion: null,
      inputHash,
      inputs,
      assumptions: [
        { key: 'turnout.segment.high_frequency', value: draft.highTurnout, evidenceRefs: [], source: 'MANAGER' },
        { key: 'turnout.segment.medium_frequency', value: draft.midTurnout, evidenceRefs: [], source: 'MANAGER' },
        { key: 'turnout.segment.low_frequency', value: draft.lowTurnout, evidenceRefs: [], source: 'MANAGER' },
        { key: 'victory.target_share', value: draft.targetShare, evidenceRefs: [], source: 'MANAGER' },
        { key: 'universe.vote_goal_multiplier', value: draft.universeMultiplier, evidenceRefs: [], source: 'MANAGER' },
      ],
      overrides: [],
      calculations,
      evidenceRefs: [],
      feasibilityGaps: [],
      feasibilityAcknowledgments: [],
      createdAt: planCreatedAt,
      createdBy: 'local-manager',
      adoptedAt: null,
      adoptedBy: null,
    };
  }, [campaignId, draft, hasCompletePlanResult, planCreatedAt, planVersionId, result]);

  const planChangedSinceSave = Boolean(storedPlan && currentPlan && storedPlan.inputHash !== currentPlan.inputHash);
  const planIsAdopted = storedPlan?.status === 'ADOPTED' || storedPlan?.status === 'ADOPTED_REFORECAST';

  const resetDraft = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setDraft(starterDraft);
  };

  const savePlanDraft = async () => {
    if (!currentPlan || hasBlockingIssue) {
      setPlanAction({ kind: 'ERROR', message: 'Resolve calculation errors before saving the plan.' });
      return;
    }
    try {
      await planStore.saveDraft(currentPlan);
      setStoredPlan(currentPlan);
      setPlanAction({ kind: 'SAVED', message: 'Plan draft saved. Review it before adoption.' });
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      setPlanAction({
        kind: 'ERROR',
        message: code === 'ADOPTED_PLAN_IMMUTABLE'
          ? 'This plan version is already adopted and cannot be changed in place.'
          : 'The plan draft could not be saved.',
      });
    }
  };

  const adoptPlan = async () => {
    if (!currentPlan) {
      setPlanAction({ kind: 'ERROR', message: 'A complete calculation is required before adoption.' });
      return;
    }
    try {
      const adopted = await planStore.adoptPlan(planVersionId, {
        actorId: 'local-manager',
        adoptedAt: new Date().toISOString(),
        expectedInputHash: currentPlan.inputHash,
      });
      setStoredPlan(adopted);
      setPlanAction({ kind: 'ADOPTED', message: 'Plan adopted. This version is now immutable.' });
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      let message = 'The plan could not be adopted.';
      if (code === 'PLAN_VERSION_NOT_FOUND') message = 'Save the plan draft before adopting it.';
      if (code === 'PLAN_RECALC_REQUIRED') message = 'The plan changed since the saved calculation. Save and review the updated plan before adoption.';
      if (code.startsWith('FEASIBILITY_ACK_REQUIRED')) message = 'A material feasibility gap must be acknowledged before adoption.';
      setPlanAction({ kind: 'ERROR', message });
    }
  };

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Wings of Athena</p>
          <h1>{draft.campaignName}</h1>
          <p className="subhead">Campaign Setup feeds the same deterministic engine that will power planning, measurement, and reforecasting. This draft is stored only in this browser for now.</p>
        </div>
        <div className="header-actions">
          <div className="engine-badge">Math {MATH_ENGINE_VERSION}</div>
          <div className="quiet">{savedAt ? `Inputs saved locally ${savedAt}` : 'Local input draft'}</div>
        </div>
      </header>

      <section className="campaign-card" aria-label="Campaign setup">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Step 1</p>
            <h2>Campaign Setup</h2>
          </div>
          <button className="text-button" type="button" onClick={resetDraft}>Reset starter draft</button>
        </div>
        <div className="setup-grid">
          <TextField label="Campaign name" value={draft.campaignName} onChange={(value) => update('campaignName', value)} />
          <TextField label="Office" value={draft.office} onChange={(value) => update('office', value)} placeholder="e.g. State Senate District 35" />
          <SelectField label="Election type" value={draft.electionType} onChange={(value) => update('electionType', value as ElectionType)} options={['PRIMARY', 'GENERAL', 'MUNICIPAL', 'SPECIAL', 'OTHER']} />
          <TextField label="Election date" value={draft.electionDate} onChange={(value) => update('electionDate', value)} type="date" />
          <TextField label="Geography" value={draft.geography} onChange={(value) => update('geography', value)} placeholder="District, city, county, or state" />
        </div>
      </section>

      <div className="section-intro">
        <div>
          <p className="eyebrow">Step 2</p>
          <h2>Path to Victory</h2>
        </div>
        <p>The three turnout bands below are only a starter template. The engine itself supports generic electorate segments.</p>
      </div>

      <section className="hero-grid" aria-label="Path to victory summary">
        <Metric label="Expected electorate" value={result.electorate.value} />
        <Metric label="Mathematical threshold" value={result.threshold?.value ?? null} />
        <Metric label="Campaign vote goal" value={result.voteGoal?.value ?? null} />
        <Metric label="Strategic universe" value={result.universe?.value ?? null} />
      </section>

      <section className="workspace">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Electorate</p>
              <h2>Turnout assumptions</h2>
            </div>
            <span className="quiet">Starter template</span>
          </div>
          <NumberField label="Eligible voters" value={draft.eligibleVoters} onChange={(value) => update('eligibleVoters', value)} step={100} />
          <SegmentRow label="High-frequency" count={draft.highCount} setCount={(value) => update('highCount', value)} turnout={draft.highTurnout} setTurnout={(value) => update('highTurnout', value)} />
          <SegmentRow label="Medium-frequency" count={draft.midCount} setCount={(value) => update('midCount', value)} turnout={draft.midTurnout} setTurnout={(value) => update('midTurnout', value)} />
          <SegmentRow label="Low-frequency" count={draft.lowCount} setCount={(value) => update('lowCount', value)} turnout={draft.lowTurnout} setTurnout={(value) => update('lowTurnout', value)} />
        </div>

        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Planning choices</p>
              <h2>Vote goal and reach</h2>
            </div>
            <span className="quiet">Manager-set</span>
          </div>
          <PercentField label="Adopted target share" value={draft.targetShare} onChange={(value) => update('targetShare', value)} />
          <NumberField label="Universe multiplier" value={draft.universeMultiplier} onChange={(value) => update('universeMultiplier', value)} step={0.1} />
          <div className="explain">
            <p className="eyebrow">Why these numbers?</p>
            <p>Expected electorate is the sum of each segment count multiplied by its turnout assumption. The mathematical threshold is calculated separately from the campaign's chosen target share. Wings does not insert a 52% cushion automatically. Strategic universe is then constructed from the vote goal and the manager-selected multiplier.</p>
          </div>
        </div>
      </section>

      {issues.length > 0 && (
        <section className="issues" aria-live="polite">
          <strong>Review before adoption</strong>
          {issues.map((issue) => <p key={`${issue.code}-${issue.message}`}>{issue.level}: {issue.message}</p>)}
        </section>
      )}

      <section className="adopt-panel" aria-label="Adopt plan">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Step 4 vertical slice</p>
            <h2>Adopt Plan</h2>
          </div>
          <span className={`plan-status plan-status-${storedPlan?.status?.toLowerCase() ?? 'unsaved'}`}>{storedPlan?.status ?? 'UNSAVED'}</span>
        </div>

        <div className="adopt-grid">
          <div>
            <p className="adopt-copy">This first adoption slice freezes the Path-to-Victory calculations currently available. Program & Budget will add capacity, cost, reachability, and feasibility acknowledgments before the full MVP adoption flow is complete.</p>
            <div className={`plan-message plan-message-${planAction.kind.toLowerCase()}`} role="status">{planAction.message}</div>
            {planChangedSinceSave && !planIsAdopted && <p className="changed-warning">Inputs changed since the saved plan. Save the updated draft before adoption.</p>}
          </div>
          <dl className="plan-meta">
            <div><dt>Plan version</dt><dd>{planVersionId.slice(0, 18)}…</dd></div>
            <div><dt>Math engine</dt><dd>{MATH_ENGINE_VERSION}</dd></div>
            <div><dt>Calibration</dt><dd>None / manager assumptions</dd></div>
            <div><dt>Current input hash</dt><dd>{currentPlan?.inputHash ?? 'Unavailable'}</dd></div>
            <div><dt>Stored input hash</dt><dd>{storedPlan?.inputHash ?? 'Not saved'}</dd></div>
          </dl>
        </div>

        <div className="adopt-actions">
          <button className="secondary-button" type="button" onClick={savePlanDraft} disabled={!currentPlan || hasBlockingIssue || planIsAdopted}>Save plan draft</button>
          <button className="primary-button" type="button" onClick={adoptPlan} disabled={!currentPlan || hasBlockingIssue || planIsAdopted || planChangedSinceSave}>Adopt this plan</button>
        </div>
        <p className="adopt-footnote">Adoption uses the exact current input fingerprint. Once adopted, this plan version cannot be edited in place.</p>
      </section>

      <footer>Local-only MVP workflow. No database and no Netlify deploy yet.</footer>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <article className="metric-card">
      <p>{label}</p>
      <strong>{value == null ? 'NO DATA' : formatNumber.format(value)}</strong>
    </article>
  );
}

function TextField({ label, value, onChange, placeholder, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return (
    <label className="field setup-field">
      <span>{label}</span>
      <input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <label className="field setup-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option} value={option}>{option.replace('_', ' ')}</option>)}
      </select>
    </label>
  );
}

function NumberField({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (value: number) => void; step?: number }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" value={value} min="0" step={step} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function PercentField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="percent-input">
        <input type="number" value={Math.round(value * 1000) / 10} min="0" max="100" step="0.1" onChange={(event) => onChange(Number(event.target.value) / 100)} />
        <span>%</span>
      </div>
    </label>
  );
}

function SegmentRow({ label, count, setCount, turnout, setTurnout }: { label: string; count: number; setCount: (value: number) => void; turnout: number; setTurnout: (value: number) => void }) {
  return (
    <div className="segment-row">
      <NumberField label={`${label} voters`} value={count} onChange={setCount} step={100} />
      <PercentField label="Turnout" value={turnout} onChange={setTurnout} />
    </div>
  );
}
