import { useEffect, useMemo, useRef, useState } from 'react';
import { MATH_ENGINE_VERSION } from '@wings/math-engine';
import {
  computeFeasibilityGapFingerprint,
  evaluatePlanAdoptionReadiness,
  type AdoptionReadiness,
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
import { FIELD_GUIDES, type FieldGuide } from './fieldGuides';
import { isProductionDeploy, wingsDataMode, wingsDeployContext } from './deployContext';

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
  const [planAction, setPlanAction] = useState<PlanActionState>({ kind: 'IDLE', message: 'Not saved' });
  const [ackReasons, setAckReasons] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const planStore = useMemo(() => new LocalPlanStore(), []);
  const campaignId = useMemo(getCampaignId, []);
  const hasBuiltOnce = useRef(false);
  const [built, setBuilt] = useState<Awaited<ReturnType<typeof buildScenarioPlan>> | null>(null);
  const [displayReadiness, setDisplayReadiness] = useState<AdoptionReadiness>({ ready: false, blockers: [] });
  const [gapFingerprints, setGapFingerprints] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    const delay = hasBuiltOnce.current ? 150 : 0;
    const timer = window.setTimeout(() => {
      void buildScenarioPlan(draft, {
        campaignId,
        planVersionId: identity.planVersionId,
        createdAt: identity.createdAt,
        createdBy: 'local-manager',
      }).then((result) => {
        if (cancelled) return;
        hasBuiltOnce.current = true;
        setBuilt(result);
      });
    }, delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [campaignId, draft, identity]);

  useEffect(() => {
    if (!storedPlan || !built) {
      setDisplayReadiness({ ready: false, blockers: [] });
      return;
    }
    let cancelled = false;
    void evaluatePlanAdoptionReadiness(storedPlan, built.build.record.inputHash).then((readiness) => {
      if (!cancelled) setDisplayReadiness(readiness);
    });
    return () => {
      cancelled = true;
    };
  }, [storedPlan, built]);

  useEffect(() => {
    if (!built) {
      setGapFingerprints({});
      return;
    }
    let cancelled = false;
    void Promise.all(
      built.feasibilityGaps.map(async (gap) => [gap.gapId, await computeFeasibilityGapFingerprint(gap)] as const),
    ).then((entries) => {
      if (!cancelled) setGapFingerprints(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [built]);

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
        setPlanAction({ kind: 'ADOPTED', message: 'Adopted' });
      } else if (plan) {
        setPlanAction({ kind: 'SAVED', message: 'Saved' });
      } else {
        setPlanAction({ kind: 'IDLE', message: 'Not saved' });
      }
    });
  }, [identity.planVersionId, planStore]);

  const currentPlan = built?.build.record ?? null;
  const planChangedSinceSave = Boolean(storedPlan && currentPlan && storedPlan.inputHash !== currentPlan.inputHash);
  const planIsAdopted = storedPlan?.status === 'ADOPTED' || storedPlan?.status === 'ADOPTED_REFORECAST';

  const sectionComplete = (sectionKey: string) =>
    built?.build.sectionStatuses.find((s) => s.sectionKey === sectionKey)?.status === 'COMPLETE';

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
    if (!currentPlan || !built) return;
    try {
      await planStore.saveDraft(currentPlan);
      setStoredPlan(currentPlan);
      setPlanAction({
        kind: 'SAVED',
        message: built.build.readyForAdoption
          ? 'Saved'
          : `Saved · ${built.build.missingRequiredKeys.length} incomplete`,
      });
    } catch (error) {
      setPlanAction({
        kind: 'ERROR',
        message: error instanceof Error && error.message === 'ADOPTED_PLAN_IMMUTABLE'
          ? 'Adopted plans cannot be edited.'
          : 'Could not save.',
      });
    }
  };

  const adoptPlan = async () => {
    if (!storedPlan || !currentPlan) {
      setPlanAction({ kind: 'ERROR', message: 'Save before adopting.' });
      return;
    }
    const review = await evaluatePlanAdoptionReadiness(storedPlan, currentPlan.inputHash);
    if (!review.ready) {
      setPlanAction({ kind: 'ERROR', message: `${review.blockers.length} blocker(s)` });
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
      setPlanAction({ kind: 'ADOPTED', message: 'Adopted' });
    } catch {
      setPlanAction({ kind: 'ERROR', message: 'Could not adopt.' });
    }
  };

  const acknowledgeGap = async (gap: FeasibilityGapRecord) => {
    const reason = (ackReasons[gap.gapId] ?? '').trim();
    if (!reason) return;
    const acknowledgment = await createAcknowledgment(gap, reason, 'local-manager');
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
          <p className="subhead">{draft.campaign.office} · {draft.campaign.geography}</p>
        </div>
        <div className="header-actions">
          {!isProductionDeploy && (
            <div className="engine-badge deploy-context-badge" title={`Data mode: ${wingsDataMode}`}>
              {wingsDeployContext}
            </div>
          )}
          <div className="engine-badge">Math {MATH_ENGINE_VERSION}</div>
          <div className="quiet">{savedAt ? `Saved ${savedAt}` : 'Draft'}</div>
        </div>
      </header>

      <nav className="flow-nav" aria-label="Planning workflow">
        <a href="#campaign-setup" className={sectionComplete('campaign_setup') ? 'nav-complete' : ''}>Campaign</a>
        <a href="#path-to-victory" className={sectionComplete('path_to_victory') ? 'nav-complete' : ''}>Path to Victory</a>
        <a href="#program-budget" className={sectionComplete('program_budget') ? 'nav-complete' : ''}>Program & Budget</a>
        <a href="#adopt-plan" className={storedPlan && displayReadiness.ready ? 'nav-complete' : ''}>Adopt</a>
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
          <button className="text-button" type="button" onClick={resetScenario}>Reset</button>
        </div>
        <div className="setup-grid">
          <TextField label="Campaign name" guide={FIELD_GUIDES.campaignName} value={draft.campaign.campaignName} onChange={(value) => updateCampaign('campaignName', value)} />
          <TextField label="Office" guide={FIELD_GUIDES.office} value={draft.campaign.office} onChange={(value) => updateCampaign('office', value)} />
          <SelectField label="Election type" guide={FIELD_GUIDES.electionType} value={draft.campaign.electionType} onChange={(value) => updateCampaign('electionType', value as CampaignPathDraft['electionType'])} options={['PRIMARY', 'GENERAL', 'MUNICIPAL', 'SPECIAL', 'OTHER']} />
          <TextField label="Election date" guide={FIELD_GUIDES.electionDate} value={draft.campaign.electionDate} onChange={(value) => updateCampaign('electionDate', value)} type="date" />
          <TextField label="Geography" guide={FIELD_GUIDES.geography} value={draft.campaign.geography} onChange={(value) => updateCampaign('geography', value)} />
        </div>
      </section>

      <section id="path-to-victory">
        <div className="section-intro">
          <div><p className="eyebrow">Step 2</p><h2>Path to Victory</h2></div>
        </div>
        <div className="hero-grid" aria-label="Path to victory summary">
          <Metric label="Expected voters" value={built?.electorate.value ?? null} />
          <Metric label="Majority line" value={built?.threshold?.value ?? null} />
          <Metric label="Vote goal" value={built?.voteGoal?.value ?? null} />
          <Metric label="Universe" value={built?.universe?.value ?? null} />
        </div>
        <div className="workspace">
          <div className="panel">
            <div className="panel-heading"><div><p className="eyebrow">Electorate</p><h2>Turnout</h2></div></div>
            <NumberField label="Eligible voters" guide={FIELD_GUIDES.eligibleVoters} value={draft.campaign.eligibleVoters} onChange={(value) => updateCampaign('eligibleVoters', value)} step={100} />
            <SegmentRow label="High-frequency" count={draft.campaign.highCount} setCount={(value) => updateCampaign('highCount', value)} turnout={draft.campaign.highTurnout} setTurnout={(value) => updateCampaign('highTurnout', value)} />
            <SegmentRow label="Medium-frequency" count={draft.campaign.midCount} setCount={(value) => updateCampaign('midCount', value)} turnout={draft.campaign.midTurnout} setTurnout={(value) => updateCampaign('midTurnout', value)} />
            <SegmentRow label="Low-frequency" count={draft.campaign.lowCount} setCount={(value) => updateCampaign('lowCount', value)} turnout={draft.campaign.lowTurnout} setTurnout={(value) => updateCampaign('lowTurnout', value)} />
          </div>
          <div className="panel">
            <div className="panel-heading"><div><p className="eyebrow">Goal</p><h2>Vote goal & universe</h2></div></div>
            <PercentField label="Target share" guide={FIELD_GUIDES.targetShare} value={draft.campaign.targetShare} onChange={(value) => updateCampaign('targetShare', value)} />
            <NumberField label="Universe multiplier" guide={FIELD_GUIDES.universeMultiplier} value={draft.campaign.universeMultiplier} onChange={(value) => updateCampaign('universeMultiplier', value)} step={0.1} />
          </div>
        </div>
      </section>

      <section id="program-budget" className="program-section">
        <div className="section-intro">
          <div><p className="eyebrow">Step 3</p><h2>Program & Budget</h2></div>
        </div>

        <div className="program-anchor" aria-label="Universe anchor">
          <span className="anchor-label">Universe</span>
          <strong className="anchor-value">{built?.universe?.value == null ? 'NO DATA' : formatNumber.format(built.universe.value)}</strong>
        </div>

        <div className="program-grid">
          <div className="panel">
            <div className="panel-heading"><div><p className="eyebrow">Pool</p><h2>Capacity</h2></div></div>
            <OptionalNumberField label="Workers" guide={FIELD_GUIDES.resourcePoolWorkers} value={draft.programBudget.resourcePoolWorkers} onChange={(value) => updateProgram('resourcePoolWorkers', value)} />
            <OptionalNumberField label="Shifts per worker" guide={FIELD_GUIDES.completedShiftsPerWorker} value={draft.programBudget.completedShiftsPerWorker} onChange={(value) => updateProgram('completedShiftsPerWorker', value)} step={0.1} />
            <OptionalNumberField label="Days left" guide={FIELD_GUIDES.remainingActiveDays} value={draft.programBudget.remainingActiveDays} onChange={(value) => updateProgram('remainingActiveDays', value)} />
            <OptionalNumberField label="Budget" guide={FIELD_GUIDES.availableBudget} value={draft.programBudget.availableBudget} onChange={(value) => updateProgram('availableBudget', value)} />
          </div>

          <div className="panel">
            <div className="panel-heading"><div><p className="eyebrow">Optional</p><h2>Support IDs</h2></div></div>
            <ToggleField label="Enable" guide={FIELD_GUIDES.supportIdEnabled} checked={draft.programBudget.supportIdEnabled} onChange={(value) => updateProgram('supportIdEnabled', value)} />
            {draft.programBudget.supportIdEnabled && <>
              <OptionalPercentField label="ID coverage" guide={FIELD_GUIDES.supportIdCoverageTarget} value={draft.programBudget.supportIdCoverageTarget} onChange={(value) => updateProgram('supportIdCoverageTarget', value)} />
              <OptionalPercentField label="Supporter turnout" guide={FIELD_GUIDES.supporterTurnoutRate} value={draft.programBudget.supporterTurnoutRate} onChange={(value) => updateProgram('supporterTurnoutRate', value)} />
            </>}
          </div>
        </div>

        <div className="channel-grid">
          {(['doors', 'phones'] as ChannelId[]).map((channelId) => (
            <ChannelPanel key={channelId} channelId={channelId} channel={draft.programBudget.channels[channelId]} update={(key, value) => updateChannel(channelId, key, value)} />
          ))}
        </div>

        {built && built.feasibilityGaps.length > 0 && (
          <div className="gap-list" aria-label="Feasibility constraints">
            {built.feasibilityGaps.map((gap) => (
              <GapCard
                key={gap.gapId}
                gap={gap}
                built={built}
                gapFingerprint={gapFingerprints[gap.gapId]}
                existingAck={draft.feasibilityAcknowledgments.find((item) => item.gapId === gap.gapId)}
                reason={ackReasons[gap.gapId] ?? ''}
                setReason={(value: string) => setAckReasons((current) => ({ ...current, [gap.gapId]: value }))}
                acknowledge={() => { void acknowledgeGap(gap); }}
              />
            ))}
          </div>
        )}
      </section>

      {built && built.issues.length > 0 && (
        <section className="issues" aria-live="polite">
          <strong>Review</strong>
          {built.issues.map((issue) => <p key={`${issue.code}-${issue.message}`}>{issue.level}: {issue.message}</p>)}
        </section>
      )}

      <section id="adopt-plan" className="adopt-panel" aria-label="Adopt plan">
        <div className="panel-heading">
          <div><p className="eyebrow">Step 4</p><h2>Adopt</h2></div>
          <span className={`plan-status plan-status-${storedPlan?.status?.toLowerCase() ?? 'unsaved'}`}>{storedPlan?.status ?? 'UNSAVED'}</span>
        </div>
        <div className="adopt-grid">
          <div>
            <div className={`plan-message plan-message-${planAction.kind.toLowerCase()}`} role="status">{planAction.message}</div>
            {planChangedSinceSave && !planIsAdopted && <p className="changed-warning">Inputs changed — save again.</p>}
            {!built?.build.readyForAdoption && built && <div className="blocker-list"><strong>Incomplete</strong>{built.build.missingRequiredKeys.map((key) => <p key={key}>{key}</p>)}</div>}
            {storedPlan && !displayReadiness.ready && <div className="blocker-list"><strong>Blockers</strong>{displayReadiness.blockers.map((blocker, index) => <p key={`${blocker.code}-${index}`}>{blocker.code}{blocker.context.gapId ? ` · ${blocker.context.gapId}` : ''}</p>)}</div>}
          </div>
          <dl className="plan-meta">
            <div><dt>Scenario</dt><dd>{scenario}</dd></div>
            <div><dt>Status</dt><dd>{storedPlan?.status ?? 'UNSAVED'}</dd></div>
          </dl>
        </div>
        <details className="plan-audit">
          <summary>Audit</summary>
          <dl className="plan-meta plan-meta-audit">
            <div><dt>Plan version</dt><dd>{identity.planVersionId}</dd></div>
            <div><dt>Engine</dt><dd>{MATH_ENGINE_VERSION}</dd></div>
            <div><dt>Input hash</dt><dd>{currentPlan?.inputHash ?? '—'}</dd></div>
            <div><dt>Stored hash</dt><dd>{storedPlan?.inputHash ?? '—'}</dd></div>
          </dl>
        </details>
        <div className="adopt-actions">
          <button className="secondary-button" type="button" onClick={savePlanDraft} disabled={planIsAdopted}>Save</button>
          <button className="primary-button" type="button" onClick={adoptPlan} disabled={!storedPlan || !built || planIsAdopted || planChangedSinceSave}>Adopt</button>
        </div>
      </section>
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
      <div className="panel-heading"><div><h2>{title}</h2></div><ToggleField label="On" guide={FIELD_GUIDES.channelEnabled} checked={channel.enabled} onChange={(value) => update('enabled', value)} compact /></div>
      {channel.enabled && <>
        <OptionalNumberField label="Unique reach" guide={FIELD_GUIDES.uniqueReachTarget} value={channel.uniqueReachTarget} onChange={(value) => update('uniqueReachTarget', value)} />
        <OptionalNumberField label="Reachable" guide={FIELD_GUIDES.reachableUniverse} value={channel.reachableUniverse} onChange={(value) => update('reachableUniverse', value)} />
        <OptionalNumberField label="Contact depth" guide={FIELD_GUIDES.contactDepthTarget} value={channel.contactDepthTarget} onChange={(value) => update('contactDepthTarget', value)} step={0.1} />
        <OptionalNumberField label="Attempts / shift" guide={FIELD_GUIDES.attemptsPerCompletedShift} value={channel.attemptsPerCompletedShift} onChange={(value) => update('attemptsPerCompletedShift', value)} />
        <OptionalNumberField label="Allocated shifts" guide={FIELD_GUIDES.allocatedCompletedShifts} value={channel.allocatedCompletedShifts} onChange={(value) => update('allocatedCompletedShifts', value)} />
        <OptionalPercentField label="Flake rate" guide={FIELD_GUIDES.volunteerFlakeRate} value={channel.volunteerFlakeRate} onChange={(value) => update('volunteerFlakeRate', value)} />
        <OptionalNumberField label="Cost / shift" guide={FIELD_GUIDES.costPerCompletedShift} value={channel.costPerCompletedShift} onChange={(value) => update('costPerCompletedShift', value)} />
      </>}
    </div>
  );
}

function GapCard({ gap, built, gapFingerprint, existingAck, reason, setReason, acknowledge }: any) {
  const stale = Boolean(existingAck && gapFingerprint && existingAck.gapFingerprint !== gapFingerprint);
  const channelId = gap.gapId.includes(':') ? gap.gapId.split(':')[1] : '';
  const channelResult = built.programFeasibility?.value?.channels.find((item: any) => item.channelId === channelId);
  const conflict = built.programFeasibility?.value?.allocationConflicts.find((item: any) => gap.gapId === `allocation:${item.resourcePoolId}`);

  return (
    <article className={`gap-card gap-${gap.constraintType.toLowerCase()}`}>
      <div className="gap-heading"><div><p className="eyebrow">{gap.constraintType}</p><h3>{gap.gap.toLocaleString()}</h3></div>{existingAck && !stale && <span className="ack-badge">OK</span>}</div>
      {stale && <div className="stale-delta"><strong>Changed</strong><p>{existingAck.gap.toLocaleString()} → {gap.gap.toLocaleString()}</p></div>}
      {gap.constraintType === 'CAPACITY' && channelResult && <>
        <div className="remedy-level-one"><div><span>Workers</span><strong>+{channelResult.additionalWorkersRequired}</strong></div><div><span>Cost</span><strong>{channelResult.incrementalCost == null ? 'NO DATA' : formatMoney.format(channelResult.incrementalCost)}</strong></div></div>
        <details><summary>Shift math</summary><p>+{channelResult.additionalCompletedShiftsRequired} shifts{channelResult.additionalScheduledShiftsRequired != null ? ` · +${channelResult.additionalScheduledShiftsRequired} scheduled` : ''}</p>{channelResult.additionalScheduledShiftsPerActiveDay != null && <p>{channelResult.additionalScheduledShiftsPerActiveDay.toFixed(1)} / day</p>}</details>
      </>}
      {gap.constraintType === 'ALLOCATION' && conflict && <div className="allocation-remedy"><strong>{conflict.shiftsToReallocate} shifts to move</strong><p>{conflict.channelAllocations.map((item: any) => `${item.channelId}: ${item.allocatedCompletedShifts}`).join(' · ')}</p></div>}
      {gap.constraintType === 'COST' && (
        <div className="remedy-level-one">
          <div><span>Budget gap</span><strong>{formatMoney.format(gap.gap)}</strong></div>
        </div>
      )}
      {gap.constraintType === 'REACHABILITY' && (
        <>
          <div className="remedy-level-one">
            <div><span>Shortfall</span><strong>{formatNumber.format(gap.gap)}</strong></div>
          </div>
          <p className="no-remedy">No auto-fix. Adjust reach targets or acknowledge.</p>
        </>
      )}
      <div className="ack-form"><label><span>{stale ? 'New reason' : 'Reason'}</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why accept this gap?" /></label><button type="button" className="secondary-button" disabled={!reason.trim()} onClick={acknowledge}>{stale ? 'Re-acknowledge' : 'Acknowledge'}</button></div>
    </article>
  );
}

function TextField({ label, value, onChange, type = 'text', guide }: { label: string; value: string; onChange: (value: string) => void; type?: string; guide?: FieldGuide }) {
  return (
    <label className="field setup-field">
      <span>{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectField({ label, value, onChange, options, guide }: { label: string; value: string; onChange: (value: string) => void; options: string[]; guide?: FieldGuide }) {
  return (
    <label className="field setup-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option}>{option}</option>)}</select>
    </label>
  );
}

function NumberField({ label, value, onChange, step = 1, guide }: { label: string; value: number; onChange: (value: number) => void; step?: number; guide?: FieldGuide }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" value={value} min="0" step={step} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function OptionalNumberField({ label, value, onChange, step = 1, guide }: { label: string; value: number | null; onChange: (value: number | null) => void; step?: number; guide?: FieldGuide }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" value={value ?? ''} min="0" step={step} placeholder={guide?.format ?? '—'} onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))} />
    </label>
  );
}

function PercentField({ label, value, onChange, guide }: { label: string; value: number; onChange: (value: number) => void; guide?: FieldGuide }) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="percent-input"><input type="number" value={Math.round(value * 1000) / 10} min="0" max="100" step="0.1" onChange={(event) => onChange(Number(event.target.value) / 100)} /><span>%</span></div>
    </label>
  );
}

function OptionalPercentField({ label, value, onChange, guide }: { label: string; value: number | null; onChange: (value: number | null) => void; guide?: FieldGuide }) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="percent-input"><input type="number" value={value == null ? '' : Math.round(value * 1000) / 10} min="0" max="100" step="0.1" placeholder="—" onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value) / 100)} /><span>%</span></div>
    </label>
  );
}

function ToggleField({ label, checked, onChange, compact = false, guide }: { label: string; checked: boolean; onChange: (value: boolean) => void; compact?: boolean; guide?: FieldGuide }) {
  if (compact) {
    return <label className="toggle compact-toggle"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span>{label}</span></label>;
  }
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function SegmentRow({ label, count, setCount, turnout, setTurnout }: { label: string; count: number; setCount: (value: number) => void; turnout: number; setTurnout: (value: number) => void }) {
  return (
    <div className="segment-row">
      <NumberField label={`${label} voters`} guide={FIELD_GUIDES.segmentCount} value={count} onChange={setCount} step={100} />
      <PercentField label="Turnout" guide={FIELD_GUIDES.segmentTurnout} value={turnout} onChange={setTurnout} />
    </div>
  );
}
