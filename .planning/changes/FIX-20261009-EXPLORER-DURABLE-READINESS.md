# Durable website readiness

Change-ID: FIX-20261009-EXPLORER-DURABLE-READINESS

## Goal and boundaries

The task-only website must not report itself askable against a legacy keyed-SSE
Provider without durable tasks. Preserve authentication, capacity and legacy
contract facts independently. No live Provider, IMA, credentials, rollout or
parent checkout changes. ONLINE_PREVIEW and LINUX_HANDOFF are owned separately.

## Plan

1. Reproduce missing-durable readiness through client and BFF health tests.
2. Require the durable capability for ready; keep legacy API behavior intact.
3. Replace the host preview's legacy-only fixture with a shared, tested synthetic
   task fixture supporting owner isolation, idempotency, cursors and cancellation.
4. Run focused/full tests, build, diff and governance checks; commit named files.

## Verification

- Red first: client and BFF health regression tests both failed because legacy
  keyed SSE with positive capacity incorrectly reported ready.
- Focused readiness/task/proxy/fixture tests: 12 passed. Built-host and fixture
  verification: 2 passed, covering root and nested prefixes through the BFF.
- Final `npm test`: 243 tests, 241 passed, 2 optional skipped, 0 failed.
- `npm run build` and `git diff --check`: passed. Dependencies installed from
  local npm cache using `npm ci --ignore-scripts --offline`.
- Repository `python3 scripts/check_governance.py --ci`: unavailable (file absent).
  External skill checker: existing hard failure on the integration change record's
  production wording without SHA; existing initialization/audit warnings remain.
  Staged scan also flags three unchanged header/synthetic assignments in
  provider-a-client and preview-synthetic-host. Regex match comparison against
  5f83e69 confirms baseline 3 / staged 3, identical values; no real credentials.
  These findings are recorded, not reported as a green governance result.

All fixtures use synthetic values and loopback only. The in-memory preview does
not prove durable disk recovery or actual IMA behavior. Legacy proxy tests retain
their old contract/capacity facts and still exercise direct ask; their ready flag
is now false. The old Docker fixture is unchanged and is not a modern UI preview.

## Rollout and rollback

Local candidate only. Integrate this isolated commit after review; revert it to
roll back. Do not deploy the modern UI against a legacy-only Provider.
