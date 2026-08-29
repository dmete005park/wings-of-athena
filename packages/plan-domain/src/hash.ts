import { FeasibilityGapRecord, JsonValue } from './types';

function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function canonicalizePrimitive(value: JsonValue): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return `bool:${value}`;
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return 'num:NaN';
    if (value === Infinity) return 'num:Infinity';
    if (value === -Infinity) return 'num:-Infinity';
    return `num:${value}`;
  }
  if (typeof value === 'string') return `str:${JSON.stringify(value)}`;
  return JSON.stringify(value);
}

function canonicalize(value: JsonValue): string {
  if (value === null || typeof value !== 'object') return canonicalizePrimitive(value);
  if (Array.isArray(value)) return `arr:[${value.map(canonicalize).join(',')}]`;
  const entries = Object.entries(value).sort(([a], [b]) => compareKeys(a, b));
  return `obj:{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonicalize(child)}`).join(',')}}`;
}

/** Exported for regression tests of canonical key ordering and type prefixes. */
export function canonicalizeJsonValue(value: JsonValue): string {
  return canonicalize(value);
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(canonical: string): Promise<string> {
  const data = new TextEncoder().encode(canonical);
  if (!globalThis.crypto?.subtle) {
    throw new Error('WEB_CRYPTO_UNAVAILABLE');
  }
  const buffer = await globalThis.crypto.subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(buffer));
}

/**
 * Stable reproducibility fingerprint, not a cryptographic security boundary.
 *
 * Algorithm prefix (`sha256:`) makes stored fingerprints self-describing.
 * Uses platform Web Crypto (`crypto.subtle`) in browser and Node test runs.
 * Replacing FNV-1a 32 invalidates every existing fingerprint. That is
 * acceptable while LocalPlanStore is browser-local; after hosted persistence
 * lands, a hash algorithm change becomes a stored-data migration.
 */
export async function computeInputHash(inputs: Record<string, JsonValue>): Promise<string> {
  return `sha256:${await sha256Hex(canonicalize(inputs))}`;
}

/** Stable fingerprint of the exact feasibility-gap snapshot a manager acknowledged. */
export async function computeFeasibilityGapFingerprint(gap: FeasibilityGapRecord): Promise<string> {
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
