import { Calculation, ElectorateSegment, ValidationIssue } from './types';
import { isFiniteNonNegative, validateProbability } from './validation';

export interface ExpectedElectorateInput {
  eligibleVoters: number;
  segments: ElectorateSegment[];
  segmentsAreMutuallyExclusive: boolean;
}

export function calculateExpectedElectorate(input: ExpectedElectorateInput): Calculation<number> {
  const issues: ValidationIssue[] = [];
  if (!isFiniteNonNegative(input.eligibleVoters)) {
    issues.push({ level: 'ERROR', code: 'INVALID_ELIGIBLE_VOTERS', message: 'Eligible voters must be non-negative.' });
  }
  if (!input.segmentsAreMutuallyExclusive) {
    issues.push({ level: 'ERROR', code: 'OVERLAPPING_SEGMENTS', message: 'Weighted-segment electorate math requires mutually exclusive segments.' });
  }

  let segmentTotal = 0;
  let modeled = 0;
  for (const segment of input.segments) {
    if (!isFiniteNonNegative(segment.count)) {
      issues.push({ level: 'ERROR', code: 'INVALID_SEGMENT_COUNT', message: `Segment ${segment.label} count must be non-negative.` });
    }
    issues.push(...validateProbability(segment.turnoutProbability, `Segment ${segment.label} turnout probability`));
    segmentTotal += segment.count;
    modeled += segment.count * segment.turnoutProbability;
  }

  if (segmentTotal > input.eligibleVoters) {
    issues.push({ level: 'ERROR', code: 'SEGMENTS_EXCEED_ELIGIBLE', message: 'Electorate segment counts exceed eligible voters.' });
  } else if (segmentTotal < input.eligibleVoters) {
    issues.push({ level: 'WARNING', code: 'INCOMPLETE_SEGMENT_COVERAGE', message: 'Electorate segments do not cover all eligible voters; add a remainder segment or disclose incomplete coverage.' });
  }

  if (issues.some((issue) => issue.level === 'ERROR')) return { value: null, issues };
  return { value: modeled, issues };
}
