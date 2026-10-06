# FIX-20261006-EXPLORER-ONBOARD-AUDIT

## Goal and scope

Audit the single Explorer v0.2.1 installation entry paired with Provider v0.4.2.
Keep candidate status, independent services and existing installation protection.
Do not publish, push, scan accounts, send real questions, read credentials or
operate existing containers. The release coordinator owns the separate REL record.

## Findings and plan

- Released wrappers trust an existing Provider cache before executing its runtime
  script. Verify the public origin, exact tag commit and clean checkout first.
- Candidate image verification skips version labels. Require the selected pair
  for both candidate and released installations before configuration.
- Resume/check/repair validate the source path but not the recorded bundle.
  Reject mismatched bundles before reading private configuration or Docker calls.
- Linux and historical Docker instructions can be mistaken for current installation
  guidance. Add current interpretation without rewriting historical evidence.

## Verification and rollout

Implemented source-cache validation in both wrappers, candidate image version
validation and recorded-bundle protection on resume/check/repair. Documentation
clarification is a separate commit under this same change record.

- Targeted tests: 12 passed, with isolated Git fixtures and mocked Docker.
- Full `npm test`: 152 tests, 151 passed, 1 skipped (no reviewed
  PROVIDER_A_TRANSFER_TEST_MODULE), 0 failed.
- `npm ci --ignore-scripts`: succeeded, reported 0 vulnerabilities.
- `npm run build`, `sh -n onboard.sh`, `git diff --check`: passed.
- `python3 scripts/check_governance.py --ci`: unavailable, exit 2 because this
  standalone repository does not contain that script. Not reported as green.
- PowerShell runtime unavailable. Windows execution, Docker, SSH, registry
  authorization and real account acceptance: NOT RUN.

Rollout remains candidate-only. Rollback by reverting this task's commits,
without changing private configuration or volumes.
