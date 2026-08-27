import { AdoptionErrorCode, AdoptionErrorContext } from './types';

export class PlanAdoptionError extends Error {
  readonly code: AdoptionErrorCode;
  readonly context: AdoptionErrorContext;

  constructor(code: AdoptionErrorCode, context: AdoptionErrorContext = {}) {
    super(code);
    this.name = 'PlanAdoptionError';
    this.code = code;
    this.context = context;
  }
}
