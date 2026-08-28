import { FeasibilityGapRecord, JsonValue } from './types';

function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function canonicalizePrimitive(value: JsonValue): string {
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return '"__NaN__"';
    if (value === Infinity) return '"__Infinity__"';
    if (value === -Infinity) return '"__-Infinity__"';
  }
  return JSON.stringify(value);
}

function canonicalize(value: JsonValue): string {
  if (value === null || typeof value !== 'object') return canonicalizePrimitive(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const entries = Object.entries(value).sort(([a], [b]) => compareKeys(a, b));
  return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonicalize(child)}`).join(',')}}`;
}

function fnv1a32(canonical: string): string {
  let hash = 2166136261;
  for (let i = 0; i < canonical.length; i += 1) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/** Stable reproducibility fingerprint, not a cryptographic security hash. */
export function computeInputHash(inputs: Record<string, JsonValue>): string {
  return fnv1a32(canonicalize(inputs));
}

/** Stable fingerprint of the exact feasibility-gap snapshot a manager acknowledged. */
export function computeFeasibilityGapFingerprint(gap: FeasibilityGapRecord): string {
  return computeInputHash({
    gapId: gap.gapId,
    constraintType: gap.constraintType,
    strategicMetricKey: gap.strategicMetricKey,
    strategicValue: gap.strategicValue,
    operationalMetricKey: gap.operationalMetricKey,
    operationalValue: gap.operationalValue,
    gap: gap.gap,
    requiresAcknowledgment: gap.requiresAcknowledgment,
  });
}
