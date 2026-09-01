import { EvidenceClass } from './types';
import { VOTE_COMPOSITION_ASSUMPTION } from './voteComposition';

export interface AssumptionDefinition {
  key: string;
  displayName: string;
  unit: string;
  allowedEvidence: EvidenceClass[];
  managerEditable: boolean;
}

const empiricalOrManager: EvidenceClass[] = ['DOCUMENTED_PRACTICE', 'OBSERVATIONAL_BENCHMARK', 'MANAGER_ASSUMPTION', 'PRODUCT_PLACEHOLDER'];

export const ASSUMPTION_REGISTRY: readonly AssumptionDefinition[] = [
  { key: 'turnout.segment.*', displayName: 'Segment Turnout Probability', unit: 'probability', allowedEvidence: ['OBSERVATIONAL_BENCHMARK', 'MANAGER_ASSUMPTION', 'PRODUCT_PLACEHOLDER'], managerEditable: true },
  { key: 'victory.target_share', displayName: 'Campaign Target Share', unit: 'share', allowedEvidence: empiricalOrManager, managerEditable: true },
  { key: VOTE_COMPOSITION_ASSUMPTION.BASE_SUPPORT, displayName: 'Base Support Probability', unit: 'probability', allowedEvidence: empiricalOrManager, managerEditable: true },
  { key: VOTE_COMPOSITION_ASSUMPTION.BASE_TURNOUT, displayName: 'Base Turnout Probability', unit: 'probability', allowedEvidence: empiricalOrManager, managerEditable: true },
  { key: VOTE_COMPOSITION_ASSUMPTION.PERSUASION_SUPPORTER_TURNOUT, displayName: 'Persuasion Supporter Turnout Rate', unit: 'probability', allowedEvidence: empiricalOrManager, managerEditable: true },
  { key: 'universe.method_and_parameters', displayName: 'Universe Method and Parameters', unit: 'structured', allowedEvidence: empiricalOrManager, managerEditable: true },
  { key: 'outreach.contact_depth_target', displayName: 'Contact Depth Target', unit: 'attempts/person', allowedEvidence: empiricalOrManager, managerEditable: true },
  { key: 'outreach.per_attempt_contact_rate', displayName: 'Per-Attempt Contact Rate', unit: 'probability', allowedEvidence: empiricalOrManager, managerEditable: true },
  { key: 'capacity.attempts_per_shift', displayName: 'Attempts per Completed Shift', unit: 'attempts/shift', allowedEvidence: empiricalOrManager, managerEditable: true },
  { key: 'volunteer.flake_rate', displayName: 'Volunteer Flake Rate', unit: 'probability', allowedEvidence: empiricalOrManager, managerEditable: true },
  { key: 'support_ids.coverage_target', displayName: 'Support-ID Coverage Target', unit: 'share', allowedEvidence: empiricalOrManager, managerEditable: true },
  { key: 'support_ids.turnout_rate', displayName: 'Supporter Turnout Rate', unit: 'probability', allowedEvidence: empiricalOrManager, managerEditable: true },
  { key: 'pace.recent_window_active_days', displayName: 'Recent Pace Window', unit: 'active_days', allowedEvidence: ['MANAGER_ASSUMPTION', 'PRODUCT_PLACEHOLDER'], managerEditable: true }
] as const;
