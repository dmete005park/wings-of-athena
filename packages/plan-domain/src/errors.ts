import { AdoptionErrorCode, AdoptionErrorContext } from './types';

function formatMessage(code: AdoptionErrorCode, context: AdoptionErrorContext): string {
  if (code === 'PLAN_SECTION_INCOMPLETE') {
    const sectionKey = context.sectionKey ?? 'plan';
    const missingKeys = context.missingKeys?.join(',') ?? '';
    return `${code}:${sectionKey}:${missingKeys}`;
  }
  if ((code === 'FEASIBILITY_ACK_REQUIRED' || code === 'FEASIBILITY_ACK_STALE') && context.gapId) {
    return `${code}:${context.gapId}`;
  }
  return code;
}

export class PlanAdoptionError extends Error {
  readonly code: AdoptionErrorCode;
  readonly context: AdoptionErrorContext;

  constructor(code: AdoptionErrorCode, context: AdoptionErrorContext = {}) {
    super(formatMessage(code, context));
    this.name = 'PlanAdoptionError';
    this.code = code;
    this.context = context;
  }
}
