#!/usr/bin/env node
/**
 * Guard against committing classified content to a public repository.
 * See docs/DATA_CLASSIFICATION.md. This is a net, not a judgment.
 *
 * Node-only so it runs identically on Windows, macOS, Linux, and CI.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'coverage', '.netlify']);
const SKIP_FILES = new Set(['check-classification.mjs', 'DATA_CLASSIFICATION.md', 'classification.mdc']);

const BLOCKED_EXTENSIONS = new Set(['.csv', '.xlsx', '.xls', '.sav', '.dta', '.parquet']);
const BLOCKED_NAMES = [/^\.env$/, /^\.env\..+/, /\.pem$/, /\.p12$/, /\.pfx$/, /\.key$/];
const ALLOWED_NAMES = [/^\.env\.example$/];

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.woff', '.woff2',
  '.ttf', '.otf', '.eot', '.pdf', '.zip', '.gz', '.mp4', '.node',
]);

const CONTENT_RULES = [
  {
    label: 'credential-shaped string',
    pattern: /AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,}|xox[baprs]-[A-Za-z0-9-]{10,}|sk-[A-Za-z0-9]{32,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  },
  {
    label: 'voter-level identifier field',
    pattern: /\b(van_?id|voter_?id|myv_?van_?id|sos_?voter|registrant_?id|dwid)\b/i,
  },
  {
    label: 'personal identifier',
    pattern: /\b\d{3}-\d{2}-\d{4}\b|\b\d{3}-\d{3}-\d{4}\b|[A-Za-z0-9._%+-]+@(gmail|yahoo|hotmail|outlook|aol)\.com/i,
  },
  {
    label: 'restricted-source evidence in public code',
    pattern: /(reuseRestriction|reuse_restriction)["'\s:=]+["']?(RESTRICTED|PROPRIETARY|CONFIDENTIAL|INTERNAL_ONLY|NDA)/i,
  },
  {
    label: 'possible calibration values outside the private package',
    pattern: /\bCALIBRATION_PROFILE\b|\bcalibrationValues\b/,
    exempt: (rel, line) =>
      rel.replace(/\\/g, '/').endsWith('src/calibration.ts') || /NULL_CALIBRATION_PROFILE/.test(line),
    extensions: ['.ts', '.tsx'],
  },
];

const findings = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(entry)) walk(full);
      continue;
    }
    inspect(full, entry);
  }
}

function inspect(full, name) {
  if (SKIP_FILES.has(name)) return;
  const rel = relative(ROOT, full);
  const ext = extname(name).toLowerCase();

  if (BLOCKED_EXTENSIONS.has(ext)) {
    findings.push({ label: 'bulk data file (calibration and voter data are private)', rel });
    return;
  }
  if (!ALLOWED_NAMES.some((r) => r.test(name)) && BLOCKED_NAMES.some((r) => r.test(name))) {
    findings.push({ label: 'environment or key file', rel });
    return;
  }
  if (BINARY_EXTENSIONS.has(ext)) return;

  let lines;
  try {
    lines = readFileSync(full, 'utf8').split(/\r?\n/);
  } catch {
    return;
  }

  lines.forEach((line, index) => {
    for (const rule of CONTENT_RULES) {
      if (rule.extensions && !rule.extensions.includes(ext)) continue;
      if (!rule.pattern.test(line)) continue;
      if (rule.exempt?.(rel, line)) continue;
      findings.push({ label: rule.label, rel, line: index + 1, text: line.trim().slice(0, 120) });
    }
  });
}

walk(ROOT);

if (findings.length === 0) {
  console.log('Classification check passed.');
  console.log('Automated checks cannot judge whether a number came from a real campaign.');
  process.exit(0);
}

console.error('');
console.error(`Classification check FAILED with ${findings.length} finding(s).`);
for (const f of findings) {
  console.error('');
  console.error(`  ${f.label}`);
  console.error(`  ${f.rel}${f.line ? `:${f.line}` : ''}`);
  if (f.text) console.error(`  > ${f.text}`);
}
console.error('');
console.error('See docs/DATA_CLASSIFICATION.md.');
console.error('Do not delete and recommit. Deleting does not remove anything from history.');
process.exit(1);
