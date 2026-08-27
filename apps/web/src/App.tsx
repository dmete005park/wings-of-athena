import { useMemo, useState } from 'react';
import {
  MATH_ENGINE_VERSION,
  calculateCampaignVoteGoal,
  calculateExpectedElectorate,
  calculateRaceThreshold,
  constructStrategicUniverse,
} from '@wings/math-engine';

const formatNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export default function App() {
  const [eligibleVoters, setEligibleVoters] = useState(60000);
  const [highCount, setHighCount] = useState(12000);
  const [highTurnout, setHighTurnout] = useState(0.82);
  const [midCount, setMidCount] = useState(22000);
  const [midTurnout, setMidTurnout] = useState(0.58);
  const [lowCount, setLowCount] = useState(26000);
  const [lowTurnout, setLowTurnout] = useState(0.28);
  const [targetShare, setTargetShare] = useState(0.52);
  const [universeMultiplier, setUniverseMultiplier] = useState(1.6);

  const result = useMemo(() => {
    const electorate = calculateExpectedElectorate({
      eligibleVoters,
      segmentsAreMutuallyExclusive: true,
      segments: [
        { id: 'high', label: 'High-frequency', count: highCount, turnoutProbability: highTurnout },
        { id: 'mid', label: 'Medium-frequency', count: midCount, turnoutProbability: midTurnout },
        { id: 'low', label: 'Low-frequency', count: lowCount, turnoutProbability: lowTurnout },
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
      adoptedTargetShare: targetShare,
      mathematicalThreshold: threshold.value,
    });

    const universe = voteGoal.value === null
      ? null
      : constructStrategicUniverse(voteGoal.value, {
          type: 'VOTE_GOAL_MULTIPLIER',
          multiplier: universeMultiplier,
        });

    return { electorate, threshold, voteGoal, universe };
  }, [eligibleVoters, highCount, highTurnout, midCount, midTurnout, lowCount, lowTurnout, targetShare, universeMultiplier]);

  const issues = [
    ...result.electorate.issues,
    ...(result.threshold?.issues ?? []),
    ...(result.voteGoal?.issues ?? []),
    ...(result.universe?.issues ?? []),
  ];

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Wings of Athena</p>
          <h1>Path to Victory</h1>
          <p className="subhead">Build the plan from explicit assumptions. Every result below comes from the shared deterministic math engine.</p>
        </div>
        <div className="engine-badge">Math {MATH_ENGINE_VERSION}</div>
      </header>

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
              <p className="eyebrow">Campaign setup</p>
              <h2>Electorate assumptions</h2>
            </div>
            <span className="quiet">Editable</span>
          </div>

          <NumberField label="Eligible voters" value={eligibleVoters} onChange={setEligibleVoters} step={100} />
          <SegmentRow label="High-frequency" count={highCount} setCount={setHighCount} turnout={highTurnout} setTurnout={setHighTurnout} />
          <SegmentRow label="Medium-frequency" count={midCount} setCount={setMidCount} turnout={midTurnout} setTurnout={setMidTurnout} />
          <SegmentRow label="Low-frequency" count={lowCount} setCount={setLowCount} turnout={lowTurnout} setTurnout={setLowTurnout} />
        </div>

        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Planning choices</p>
              <h2>Vote goal and reach</h2>
            </div>
            <span className="quiet">No hidden defaults</span>
          </div>

          <PercentField label="Adopted target share" value={targetShare} onChange={setTargetShare} />
          <NumberField label="Universe multiplier" value={universeMultiplier} onChange={setUniverseMultiplier} step={0.1} />

          <div className="explain">
            <p className="eyebrow">Why these numbers?</p>
            <p>Expected electorate is the sum of each segment count multiplied by its turnout assumption. The majority threshold is calculated separately from the campaign's chosen target share. Strategic universe is then constructed from the vote goal and the selected multiplier.</p>
          </div>
        </div>
      </section>

      {issues.length > 0 && (
        <section className="issues" aria-live="polite">
          <strong>Review before adoption</strong>
          {issues.map((issue) => <p key={`${issue.code}-${issue.message}`}>{issue.level}: {issue.message}</p>)}
        </section>
      )}

      <footer>First vertical slice: browser UI → @wings/math-engine → explainable result.</footer>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <article className="metric-card">
      <p>{label}</p>
      <strong>{value == null ? 'Unavailable' : formatNumber.format(value)}</strong>
    </article>
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
