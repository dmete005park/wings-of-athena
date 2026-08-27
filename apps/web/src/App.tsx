import { useEffect, useMemo, useState } from 'react';
import { MATH_ENGINE_VERSION } from '@wings/math-engine';
import {
  computeFeasibilityGapFingerprint,
  evaluatePlanAdoptionReadiness,
  type FeasibilityGapRecord,
  type PlanVersionRecord,
  type ScenarioName,
} from '@wings/plan-domain';
import { LocalPlanStore } from './storage/localPlanStore';
import {
  buildScenarioPlan,
  createAcknowledgment,
  createStarterScenario,
  type CampaignPathDraft,
  type ChannelDraft,
  type ChannelId,
  type ProgramBudgetDraft,
  type ScenarioDraft,
} from './planBuilder';

const formatNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const formatMoney = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const CAMPAIGN_ID_KEY = 'wings.currentCampaignId.v2';
const SCENARIO_DRAFTS_KEY = 'wings.scenarioDrafts.v2';
const PLAN_IDENTITIES_KEY = 'wings.planIdentities.v2';
const SCENARIOS: ScenarioName[] = ['CONSERVATIVE', 'BASE', 'EXPANDED'];

type PlanActionState =
  | { kind: 'IDLE'; message: string }
  | { kind: 'SAVED'; message: string }
  | { kind: 'ADOPTED'; message: string }
  | { kind: 'ERROR'; message: string };

interface PlanIdentity {
  planVersionId: string;
  createdAt: string;
}

function createLocalId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getCampaignId(): string {
  const existing = window.localStorage.getItem(CAMPAIGN_ID_KEY);
  if (existing) return existing;
  const created = createLocalId('campaign');
  window.localStorage.setItem(CAMPAIGN_ID_KEY, created);
  return created;
}

function loadScenarioDrafts(): Record<string, ScenarioDraft> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SCENARIO_DRAFTS_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function loadPlanIdentities(): Record<string, PlanIdentity> {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PLAN_IDENTITIES_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function ensureIdentity(scenario: ScenarioName): PlanIdentity {
  const identities = loadPlanIdentities();
  if (identities[scenario]) return identities[scenario];
  const identity = { planVersionId: createLocalId('plan'), createdAt: new Date().toISOString() };
  identities[scenario] = identity;
  window.localStorage.setItem(PLAN_IDENTITIES_KEY, JSON.stringify(identities));
  return identity;
}

function loadScenario(scenario: ScenarioName): ScenarioDraft {
  const saved = loadScenarioDrafts()[scenario];
  return saved ?? createStarterScenario(scenario);
}

export default function App() {
  const [scenario, setScenario] = useState<ScenarioName>('BASE');
  const [draft, setDraft] = useState<ScenarioDraft>(() => loadScenario('BASE'));
  const [identity, setIdentity] = useState<PlanIdentity>(() => ensureIdentity('BASE'));
  const [storedPlan, setStoredPlan] = useState<PlanVersionRecord | null>(null);
  const [planAction, setPlanAction] = useState<PlanActionState>({ kind: 'IDLE', message: 'Plan has not been saved yet.' });
  const [ackReasons, setAckReasons] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const planStore = useMemo(() => new LocalPlanStore(), []);
  const campaignId = useMemo(getCampaignId, []);

  useEffect(() => {
    const all = loadScenarioDrafts();
    all[scenario] = draft;
    window.localStorage.setItem(SCENARIO_DRAFTS_KEY, JSON.stringify(all));
    setSavedAt(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
  }, [draft, scenario]);

  useEffect(() => {
    planStore.getPlanVersion(identity.planVersionId).then((plan) => {
      setStoredPlan(plan);
      if (plan?.status === 'ADOPTED' || plan?.status === 'ADOPTED_REFORECAST') {
        setPlanAction({ kind: 'ADOPTED', message: 'This scenario is adopted and locked.' });
      } else if (plan) {
        setPlanAction({ kind: 'SAVED', message: 'This scenario draft is stored locally.' });
      } else {
        setPlanAction({ kind: 'IDLE', message: 'Plan has not been saved yet.' });
      }
    });
  }, [identity.planVersionId, planStore]);

  const built = useMemo(() => buildScenarioPlan(draft, {
    campaignId,
    planVersionId: identity.planVersionId,
    createdAt: identity.createdAt,
    createdBy: 'local-manager',
  }), [campaignId, draft, identity]);

  const currentPlan = built.build.record;
  const planChangedSinceSave = Boolean(storedPlan && storedPlan.inputHash !== currentPlan.inputHash);
  const planIsAdopted = storedPlan?.status === 'ADOPTED' || storedPlan?.status === 'ADOPTED_REFORECAST';
  const readiness = storedPlan
    ? evaluatePlanAdoptionReadiness(storedPlan, currentPlan.inputHash)
    : { ready: false, blockers: [] };

  const switchScenario = (next: ScenarioName) => {
    setScenario(next);
    setDraft(loadScenario(next));
    setIdentity(ensureIdentity(next));
    setStoredPlan(null);
    setAckReasons({});
  };

  const updateCampaign = <K extends keyof CampaignPathDraft>(key: K, value: CampaignPathDraft[K]) => {
    setDraft((current) => ({ ...current, campaign: { ...current.campaign, [key]: value } }));
  };

  const updateProgram = <K extends keyof Omit<ProgramBudgetDraft, 'channels'>>(key: K, value: ProgramBudgetDraft[K]) => {
    setDraft((current) => ({ ...current, programBudget: { ...current.programBudget, [key]: value } }));
  };

  const updateChannel = <K extends keyof ChannelDraft>(channelId: ChannelId, key: K, value: ChannelDraft[K]) => {
    setDraft((current) => ({
      ...current,
      programBudget: {
        ...current.programBudget,
        channels: {
          ...current.programBudget.channels,
          [channelId]: { ...current.programBudget.channels[channelId], [key]: value },
        },
      },
    }));
  };

  const resetScenario = () => {
    setDraft(createStarterScenario(scenario));
    setAckReasons({});
  };

  const savePlanDraft = async () => {
    try {
      await planStore.saveDraft(currentPlan);
      setStoredPlan(currentPlan);
      setPlanAction({
        kind: 'SAVED',
        message: built.build.readyForAdoption
          ? 'Plan draft saved. All required sections are complete.'
          : `Plan draft saved. ${built.build.missingRequiredKeys.length} required item(s) still need attention.`,
      });
    } catch (error) {
      setPlanAction({
        kind: 'ERROR',
        message: error instanceof Error && error.message === 'ADOPTED_PLAN_IMMUTABLE'
          ? 'This plan version is already adopted and cannot be changed in place.'
          : 'The plan draft could not be saved.',
      });
    }
  };

  const adoptPlan = async () => {
    if (!storedPlan) {
      setPlanAction({ kind: 'ERROR', message: 'Save this plan version before adopting it.' });
      return;
    }
    const review = evaluatePlanAdoptionReadiness(storedPlan, currentPlan.inputHash);
    if (!review.ready) {
      setPlanAction({ kind: 'ERROR', message: `${review.blockers.length} adoption blocker(s) require review.` });
      const firstSection = review.blockers.find((blocker) => blocker.context.sectionKey)?.context.sectionKey;
      document.getElementById(firstSection === 'program_budget' ? 'program-budget' : 'adopt-plan')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    try {
      const adopted = await planStore.adoptPlan(identity.planVersionId, {
        actorId: 'local-manager',
        adoptedAt: new Date().toISOString(),
        expectedInputHash: currentPlan.inputHash,
      });
      setStoredPlan(adopted);
      setPlanAction({ kind: 'ADOPTED', message: 'Plan adopted. This version is now immutable.' });
    } catch {
      setPlanAction({ kind: 'ERROR', message: 'The plan could not be adopted. Review the blockers below.' });
    }
  };

  const acknowledgeGap = (gap: FeasibilityGapRecord) => {
    const reason = (ackReasons[gap.gapId] ?? '').trim();
    if (!reason) return;
    const acknowledgment = createAcknowledgment(gap, reason, 'local-manager');
    setDraft((current) => ({
      ...current,
      feasibilityAcknowledgments: [
        ...current.feasibilityAcknowledgments.filter((item) => item.gapId !== gap.gapId),
        acknowledgment,
      ],
    }));
    setAckReasons((current) => ({ ...current, [gap.gapId]: '' }));
  };

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Wings of Athena</p>
          <h1>{draft.campaign.campaignName}</h1>
          <p className="subhead">One canonical plan record now connects campaign setup, path to victory, Program & Budget, and adoption. Every scenario remains a separate plan version under the same campaign.</p>
        </div>
        <div className="header-actions">
          <div className="engine-badge">Math {MATH_ENGINE_VERSION}</div>
          <div className="quiet">{savedAt ? `Draft inputs saved ${savedAt}` : 'Local input draft'}</div>
        </div>
      </header>

      <nav className="flow-nav" aria-label="Planning workflow">
        <a href="#campaign-setup">Campaign</a>
        <a href="#path-to-victory">Path to Victory</a>
        <a href="#program-budget">Program & Budget</a>
        <a href="#adopt-plan">Adopt Plan</a>
      </nav>

      <section className="scenario-bar" aria-label="Scenario selection">
        <div>
          <p className="eyebrow">Scenario</p>
          <strong>{scenario}</strong>
        </div>
        <div className="scenario-actions">
          {SCENARIOS.map((item) => (
            <button key={item} className={item === scenario ? 'scenario-active' : ''} type="button" onClick={() => switchScenario(item)}>{item}</button>
          ))}
        </div>
      </section>

      <section id="campaign-setup" className="campaign-card" aria-label="Campaign setup">
        <div className="panel-heading">
          <div><p className="eyebrow">Step 1</p><h2>Campaign Setup</h2></div>
          <button className="text-button" type="button" onClick={resetScenario}>Reset this scenario</button>
        </div>
        <div className="setup-grid">
          <TextField label="Campaign name" value={draft.campaign.campaignName} onChange={(value) => updateCampaign('campaignName', value)} />
          <TextField label="Office" value={draft.campaign.office} onChange={(value) => updateCampaign('office', value)} />
          <SelectField label="Election type" value={draft.campaign.electionType} onChange={(value) => updateCampaign('electionType', value as CampaignPathDraft['electionType'])} options={['PRIMARY', 'GENERAL', 'MUNICIPAL', 'SPECIAL', 'OTHER']} />
          <TextField label="Election date" value={draft.campaign.electionDate} onChange={(value) => updateCampaign('electionDate', value)} type="date" />
          <TextField label="Geography" value={draft.campaign.geography} onChange={(value) => updateCampaign('geography', value)} />
        </div>
      </section>

      <section id="path-to-victory">
        <div className="section-intro">
          <div><p className="eyebrow">Step 2</p><h2>Path to Victory</h2></div>
          <p>The three turnout bands remain a starter template. The math engine itself supports generic electorate segments.</p>
        </div>
        <div className="hero-grid" aria-label="Path to victory summary">
          <Metric label="Expected electorate" value={built.electorate.value} />
          <Metric label="Mathematical threshold" value={built.threshold?.value ?? null} />
          <Metric label="Campaign vote goal" value={built.voteGoal?.value ?? null} />
          <Metric label="Strategic universe" value={built.universe?.value ?? null} />
        </div>
        <div className="workspace">
          <div className="panel">
            <div className="panel-heading"><div><p className="eyebrow">Electorate</p><h2>Turnout assumptions</h2></div><span className="quiet">Starter template</span></div>
            <NumberField label="Eligible voters" value={draft.campaign.eligibleVoters} onChange={(value) => updateCampaign('eligibleVoters', value)} step={100} />
            <SegmentRow label="High-frequency" count={draft.campaign.highCount} setCount={(value) => updateCampaign('highCount', value)} turnout={draft.campaign.highTurnout} setTurnout={(value) => updateCampaign('highTurnout', value)} />
            <SegmentRow label="Medium-frequency" count={draft.campaign.midCount} setCount={(value) => updateCampaign('midCount', value)} turnout={draft.campaign.midTurnout} setTurnout={(value) => updateCampaign('midTurnout', value)} />
            <SegmentRow label="Low-frequency" count={draft.campaign.lowCount} setCount={(value) => updateCampaign('lowCount', value)} turnout={draft.campaign.lowTurnout} setTurnout={(value) => updateCampaign('lowTurnout', value)} />
          </div>
          <div className="panel">
            <div className="panel-heading"><div><p className="eyebrow">Planning choices</p><h2>Vote goal and reach</h2></div><span className="quiet">Manager-set</span></div>
            <PercentField label="Adopted target share" value={draft.campaign.targetShare} onChange={(value) => updateCampaign('targetShare', value)} />
            <NumberField label="Universe multiplier" value={draft.campaign.universeMultiplier} onChange={(value) => updateCampaign('universeMultiplier', value)} step={0.1} />
            <div className="explain"><p className="eyebrow">Why these numbers?</p><p>Expected electorate is segment count times turnout assumption. The mathematical threshold is separate from the manager-selected target share. Strategic universe is constructed from the vote goal and the chosen multiplier.</p></div>
          </div>
        </div>
      </section>

      <section id="program-budget" className="program-section">
        <div className="section-intro">
          <div><p className="eyebrow">Step 3</p><h2>Program & Budget</h2></div>
          <p>Shared-pool staffing prevents doors and phones from each claiming the same people. Blank fields remain incomplete rather than receiving hidden empirical defaults.</p>
        </div>

        <div className="program-grid">
          <div className="panel">
            <div className="panel-heading"><div><p className="eyebrow">Shared resource pool</p><h2>Campaign capacity</h2></div></div>
            <OptionalNumberField label="Workers available" value={draft.programBudget.resourcePoolWorkers} onChange={(value) => updateProgram('resourcePoolWorkers', value)} />
            <OptionalNumberField label="Completed shifts / worker" value={draft.programBudget.completedShiftsPerWorker} onChange={(value) => updateProgram('completedShiftsPerWorker', value)} step={0.1} />
            <OptionalNumberField label="Remaining active days" value={draft.programBudget.remainingActiveDays} onChange={(value) => updateProgram('remainingActiveDays', value)} />
            <OptionalNumberField label="Available program budget" value={draft.programBudget.availableBudget} onChange={(value) => updateProgram('availableBudget', value)} />
          </div>

          <div className="panel">
            <div className="panel-heading"><div><p className="eyebrow">Optional objective</p><h2>Support IDs</h2></div></div>
            <ToggleField label="Enable Support ID objective" checked={draft.programBudget.supportIdEnabled} onChange={(value) => updateProgram('supportIdEnabled', value)} />
            {draft.programBudget.supportIdEnabled && <>
              <OptionalPercentField label="ID coverage target" value={draft.programBudget.supportIdCoverageTarget} onChange={(value) => updateProgram('supportIdCoverageTarget', value)} />
              <OptionalPercentField label="Supporter turnout rate" value={draft.programBudget.supporterTurnoutRate} onChange={(value) => updateProgram('supporterTurnoutRate', value)} />
            </>}
          </div>
        </div>

        <div className="channel-grid">
          {(['doors', 'phones'] as ChannelId[]).map((channelId) => (
            <ChannelPanel key={channelId} channelId={channelId} channel={draft.programBudget.channels[channelId]} update={(key, value) => updateChannel(channelId, key, value)} />
          ))}
        </div>

        {built.feasibilityGaps.length > 0 && (
          <div className="gap-list" aria-label="Feasibility constraints">
            {built.feasibilityGaps.map((gap) => (
              <GapCard
                key={gap.gapId}
                gap={gap}
                built={built}
                existingAck={draft.feasibilityAcknowledgments.find((item) => item.gapId === gap.gapId)}
                reason={ackReasons[gap.gapId] ?? ''}
                setReason={(value) => setAckReasons((current) => ({ ...current, [gap.gapId]: value }))}
                acknowledge={() => acknowledgeGap(gap)}
              />
            ))}
          </div>
        )}
      </section>

      {built.issues.length > 0 && (
        <section className="issues" aria-live="polite">
          <strong>Calculation review</strong>
          {built.issues.map((issue) => <p key={`${issue.code}-${issue.message}`}>{issue.level}: {issue.message}</p>)}
        </section>
      )}

      <section id="adopt-plan" className="adopt-panel" aria-label="Adopt plan">
        <div className="panel-heading">
          <div><p className="eyebrow">Step 4</p><h2>Adopt Plan</h2></div>
          <span className={`plan-status plan-status-${storedPlan?.status?.toLowerCase() ?? 'unsaved'}`}>{storedPlan?.status ?? 'UNSAVED'}</span>
        </div>
        <div className="adopt-grid">
          <div>
            <p className="adopt-copy">Adoption now uses the canonical builder output across all three planning sections. Incomplete drafts can be saved, but cannot be adopted.</p>
            <div className={`plan-message plan-message-${planAction.kind.toLowerCase()}`} role="status">{planAction.message}</div>
            {planChangedSinceSave && !planIsAdopted && <p className="changed-warning">Inputs changed since the saved plan. Save the updated draft before adoption.</p>}
            {!built.build.readyForAdoption && <div className="blocker-list"><strong>Section completeness</strong>{built.build.missingRequiredKeys.map((key) => <p key={key}>{key}</p>)}</div>}
            {storedPlan && !readiness.ready && <div className="blocker-list"><strong>Adoption blockers</strong>{readiness.blockers.map((blocker, index) => <p key={`${blocker.code}-${index}`}>{blocker.code}{blocker.context.gapId ? ` · ${blocker.context.gapId}` : ''}</p>)}</div>}
          </div>
          <dl className="plan-meta">
            <div><dt>Scenario</dt><dd>{scenario}</dd></div>
            <div><dt>Plan version</dt><dd>{identity.planVersionId.slice(0, 18)}…</dd></div>
            <div><dt>Math engine</dt><dd>{MATH_ENGINE_VERSION}</dd></div>
            <div><dt>Current input hash</dt><dd>{currentPlan.inputHash}</dd></div>
            <div><dt>Stored input hash</dt><dd>{storedPlan?.inputHash ?? 'Not saved'}</dd></div>
          </dl>
        </div>
        <div className="adopt-actions">
          <button className="secondary-button" type="button" onClick={savePlanDraft} disabled={planIsAdopted}>Save plan draft</button>
          <button className="primary-button" type="button" onClick={adoptPlan} disabled={!storedPlan || planIsAdopted || planChangedSinceSave || !readiness.ready}>Adopt this plan</button>
        </div>
        <p className="adopt-footnote">Adoption requires complete sections, current calculations, the exact reviewed input fingerprint, and current acknowledgments for every material feasibility gap.</p>
      </section>

      <footer>Local planning workflow. Command Center and Reforecast are not yet implemented. No Netlify deployment has been triggered.</footer>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number | null | undefined }) {
  return <article className="metric-card"><p>{label}</p><strong>{value == null ? 'NO DATA' : formatNumber.format(value)}</strong></article>;
}

function ChannelPanel({ channelId, channel, update }: { channelId: ChannelId; channel: ChannelDraft; update: <K extends keyof ChannelDraft>(key: K, value: ChannelDraft[K]) => void }) {
  const title = channelId === 'doors' ? 'Doors' : 'Phones';
  return (
    <div className="panel channel-panel">
      <div className="panel-heading"><div><p className="eyebrow">Channel</p><h2>{title}</h2></div><ToggleField label="Enabled" checked={channel.enabled} onChange={(value) => update('enabled', value)} compact /></div>
      {channel.enabled && <>
        <OptionalNumberField label="Reachable universe" value={channel.reachableUniverse} onChange={(value) => update('reachableUniverse', value)} />
        <OptionalNumberField label="Contact depth" value={channel.contactDepthTarget} onChange={(value) => update('contactDepthTarget', value)} step={0.1} />
        <OptionalNumberField label="Attempts / completed shift" value={channel.attemptsPerCompletedShift} onChange={(value) => update('attemptsPerCompletedShift', value)} />
        <OptionalNumberField label="Allocated completed shifts" value={channel.allocatedCompletedShifts} onChange={(value) => update('allocatedCompletedShifts', value)} />
        <OptionalPercentField label="Flake rate (optional)" value={channel.volunteerFlakeRate} onChange={(value) => update('volunteerFlakeRate', value)} />
        <OptionalNumberField label="Cost / completed shift (optional)" value={channel.costPerCompletedShift} onChange={(value) => update('costPerCompletedShift', value)} />
      </>}
    </div>
  );
}

function GapCard({ gap, built, existingAck, reason, setReason, acknowledge }: any) {
  const stale = existingAck && existingAck.gapFingerprint !== computeFeasibilityGapFingerprint(gap);
  const channelId = gap.gapId.includes(':') ? gap.gapId.split(':')[1] : '';
  const channelResult = built.programFeasibility?.value?.channels.find((item: any) => item.channelId === channelId);
  const conflict = built.programFeasibility?.value?.allocationConflicts.find((item: any) => gap.gapId === `allocation:${item.resourcePoolId}`);

  return (
    <article className={`gap-card gap-${gap.constraintType.toLowerCase()}`}>
      <div className="gap-heading"><div><p className="eyebrow">{gap.constraintType}</p><h3>{gap.gap.toLocaleString()} gap</h3></div>{existingAck && !stale && <span className="ack-badge">Acknowledged</span>}</div>
      {stale && <div className="stale-delta"><strong>Changed since acknowledgment</strong><p>Previously {existingAck.gap.toLocaleString()} → now {gap.gap.toLocaleString()} ({gap.gap - existingAck.gap >= 0 ? '+' : ''}{(gap.gap - existingAck.gap).toLocaleString()})</p></div>}
      {gap.constraintType === 'CAPACITY' && channelResult && <>
        <div className="remedy-level-one"><div><span>Additional workers</span><strong>+{channelResult.additionalWorkersRequired}</strong></div><div><span>Incremental cost</span><strong>{channelResult.incrementalCost == null ? 'NO DATA' : formatMoney.format(channelResult.incrementalCost)}</strong></div></div>
        <details><summary>Show shift arithmetic</summary><p>+{channelResult.additionalCompletedShiftsRequired} completed shifts{channelResult.additionalScheduledShiftsRequired != null ? ` · +${channelResult.additionalScheduledShiftsRequired} scheduled shifts` : ''}</p>{channelResult.additionalScheduledShiftsPerActiveDay != null && <p>{channelResult.additionalScheduledShiftsPerActiveDay.toFixed(1)} scheduled shifts per active day</p>}</details>
      </>}
      {gap.constraintType === 'ALLOCATION' && conflict && <div className="allocation-remedy"><strong>{conflict.shiftsToReallocate} shifts must move</strong><p>{conflict.channelAllocations.map((item: any) => `${item.channelId}: ${item.allocatedCompletedShifts}`).join(' · ')}</p></div>}
      {gap.constraintType === 'COST' && <div className="remedy-level-one"><div><span>Additional budget required</span><strong>{formatMoney.format(gap.gap)}</strong></div></div>}
      {gap.constraintType === 'REACHABILITY' && <p className="no-remedy">No deterministic arithmetic remedy is available. Wings records the shortfall without inventing a targeting tactic.</p>}
      <div className="ack-form"><label><span>{stale ? 'Reason for renewed acceptance' : 'Reason if accepting this constraint'}</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} /></label><button type="button" className="secondary-button" disabled={!reason.trim()} onClick={acknowledge}>{stale ? 'Re-acknowledge constraint' : 'Acknowledge constraint'}</button></div>
    </article>
  );
}

function TextField({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="field setup-field"><span>{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return <label className="field setup-field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}

function NumberField({ label, value, onChange, step = 1 }: { label: string; value: number; onChange: (value: number) => void; step?: number }) {
  return <label className="field"><span>{label}</span><input type="number" value={value} min="0" step={step} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function OptionalNumberField({ label, value, onChange, step = 1 }: { label: string; value: number | null; onChange: (value: number | null) => void; step?: number }) {
  return <label className="field"><span>{label}</span><input type="number" value={value ?? ''} min="0" step={step} placeholder="Required" onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))} /></label>;
}

function PercentField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="field"><span>{label}</span><div className="percent-input"><input type="number" value={Math.round(value * 1000) / 10} min="0" max="100" step="0.1" onChange={(event) => onChange(Number(event.target.value) / 100)} /><span>%</span></div></label>;
}

function OptionalPercentField({ label, value, onChange }: { label: string; value: number | null; onChange: (value: number | null) => void }) {
  return <label className="field"><span>{label}</span><div className="percent-input"><input type="number" value={value == null ? '' : Math.round(value * 1000) / 10} min="0" max="100" step="0.1" placeholder="Optional" onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value) / 100)} /><span>%</span></div></label>;
}

function ToggleField({ label, checked, onChange, compact = false }: { label: string; checked: boolean; onChange: (value: boolean) => void; compact?: boolean }) {
  return <label className={compact ? 'toggle compact-toggle' : 'toggle'}><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label>;
}

function SegmentRow({ label, count, setCount, turnout, setTurnout }: { label: string; count: number; setCount: (value: number) => void; turnout: number; setTurnout: (value: number) => void }) {
  return <div className="segment-row"><NumberField label={`${label} voters`} value={count} onChange={setCount} step={100} /><PercentField label="Turnout" value={turnout} onChange={setTurnout} /></div>;
}
