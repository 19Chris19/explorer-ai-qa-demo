# FIX-20261006-EXPLORER-MAINTENANCE-STORAGE

- Base: 07a958fc; independent codex worktree, no changes to AirDocker or parent.
- User goal: maintenance preservation must reject invalid queue storage without
  rewriting it or certifying drain; legacy behavior remains compatible.
- Plan: red synthetic storage/startup tests; whole-array validation before restore;
  strict decoding and row/duplicate checks; full suite and build; structured commit.
- Existing behavior: JSON parse errors and non-array roots already throw. Only
  ENOENT defaults to an empty queue; malformed rows and duplicate IDs were lossy.
- Scope: queue loader, synthetic tests and documentation only. No live data,
  credentials, service operations, deployment, push or automatic repair.
- Implementation: strict UTF-8/JSON and complete current save-schema validation,
  unique IDs, ordinary files only, all checked before restore or save. Only an
  initially missing file is empty; a later read failure cannot become empty.
  Parse/non-array legacy errors and legacy lossy normalization remain unchanged.
- Red: first storage regression run 27 tests, 20 failed and 7 passed on base.
- Green: final npm test 149 tests, 148 passed, 0 failed, 1 optional Provider export
  interop skip. npm run build passed. Synthetic BFF startup cases prove nonzero
  exit, unchanged bytes, absent writer/snapshot, failed drain check and zero
  upstream requests. Normal queued/paused/running and expired recovery covered.
- Checks: named staged diff inspected; git diff --check passed. This website has
  no scripts/check_governance.py; attempted --ci exits 2, not claimed successful.
- Rollout: candidate only, requires parent review/integration and authorized
  installation. No live verification claim or automatic storage repair.
- Rollback: revert this commit only after separately preserving/reconciling any
  rejected storage; the old loader can silently discard malformed rows.
