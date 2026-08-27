#!/usr/bin/env bash
# Coarse guard against committing classified content to a public repository.
# See docs/DATA_CLASSIFICATION.md. This is a net, not a judgment.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FAIL=0
EXCLUDES=(--exclude-dir=.git --exclude-dir=node_modules --exclude-dir=dist
          --exclude=check-classification.sh --exclude=DATA_CLASSIFICATION.md)

report() {
  echo ""
  echo "BLOCKED: $1"
  echo "$2"
  FAIL=1
}

# 1. Credentials
HITS=$(grep -rInE \
  "(AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,}|xox[baprs]-[A-Za-z0-9-]{10,}|sk-[A-Za-z0-9]{32,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)" \
  "${EXCLUDES[@]}" . 2>/dev/null)
[ -n "$HITS" ] && report "credential-shaped string" "$HITS"

# 2. Env and key files
HITS=$(find . -path ./node_modules -prune -o \
  \( -name ".env" -o -name ".env.*" ! -name ".env.example" \
     -o -name "*.pem" -o -name "*.p12" -o -name "*.pfx" -o -name "*.key" \) \
  -print 2>/dev/null | grep -v '^./.git/')
[ -n "$HITS" ] && report "environment or key file" "$HITS"

# 3. Bulk data files, which are how voter and turnout data often arrives
HITS=$(find . -path ./node_modules -prune -o \
  \( -name "*.csv" -o -name "*.xlsx" -o -name "*.xls" -o -name "*.sav" \
     -o -name "*.dta" -o -name "*.parquet" \) -print 2>/dev/null \
  | grep -v '^./.git/')
[ -n "$HITS" ] && report "bulk data file (calibration and voter data are private)" "$HITS"

# 4. Voter-level field names
HITS=$(grep -rInE \
  "\b(van_?id|voter_?id|myv_?van_?id|sos_?voter|registrant_?id|dwid)\b" \
  "${EXCLUDES[@]}" . 2>/dev/null)
[ -n "$HITS" ] && report "voter-level identifier field" "$HITS"

# 5. Direct PII patterns
HITS=$(grep -rInE \
  "\b[0-9]{3}-[0-9]{2}-[0-9]{4}\b|\b[0-9]{3}-[0-9]{3}-[0-9]{4}\b|[A-Za-z0-9._%+-]+@(gmail|yahoo|hotmail|outlook|aol)\.com" \
  "${EXCLUDES[@]}" . 2>/dev/null)
[ -n "$HITS" ] && report "personal identifier" "$HITS"

# 6. Restricted-source markers
HITS=$(grep -rInE \
  "(reuseRestriction|reuse_restriction)[\"' :=]+[\"']?(RESTRICTED|PROPRIETARY|CONFIDENTIAL|INTERNAL_ONLY|NDA)" \
  "${EXCLUDES[@]}" . 2>/dev/null)
[ -n "$HITS" ] && report "restricted-source evidence in public code" "$HITS"

# 7. Calibration values outside the boundary interface
HITS=$(grep -rIn "CALIBRATION_PROFILE\|calibrationValues" \
  "${EXCLUDES[@]}" --include="*.ts" . 2>/dev/null \
  | grep -v "NULL_CALIBRATION_PROFILE" \
  | grep -v "src/calibration.ts")
[ -n "$HITS" ] && report "possible calibration values outside the private package" "$HITS"

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "Classification check passed."
  echo "Automated checks cannot judge whether a number came from a real campaign."
  exit 0
fi

echo "Classification check failed. See docs/DATA_CLASSIFICATION.md."
echo "Do not delete and recommit. Deleting does not remove anything from history."
exit 1
