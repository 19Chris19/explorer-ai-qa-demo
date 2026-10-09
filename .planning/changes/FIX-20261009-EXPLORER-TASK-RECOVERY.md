# FIX-20261009-EXPLORER-TASK-RECOVERY

## User Goal
Fix the five blocking BFF recovery findings before the final Docker image, without
UI, live configuration, runtime data, Provider/IMA traffic, or push changes.

## Scope and Plan
- Base: integration commit a544d6e, including retained completion receipt handling.
- Persist submit intent before POST; ambiguous and restarted submissions use GET only.
- Check cancellation before dispatch; persist cancellation until Provider confirms terminal.
- Retry observation/network/JSON faults without declaring execution terminal.
- Count submitting and Provider-queued public work across both task entry points.
- Add synthetic regression coverage and run the full suite/build/governance checks.

## Safety and Rollout
Dedicated codex/FIX-20261009-EXPLORER-TASK-RECOVERY worktree. Parent runtime and
unrelated files remain untouched. Integrate the atomic commit before rebuilding
Docker. Retain the runtime volume; unresolved submission intents deliberately
block replay even when lookup is empty. Never resolve uncertainty by another POST.

## Verification
- Focused BFF/bridge/queue/store/API suite: 23/23 passing.
- Full suite rerun: passing, 228 tests including 2 existing skips. Initial run
  observed the inherited UI timer assertion expecting `10` instead of `10.0`;
  isolated rerun and full rerun passed. No UI or UI-test edits made here.
- `npm run build` and `git diff --check`: passing.
- Standalone repository has no `scripts/check_governance.py`; the supplied root
  repository checker passes with 0 failures and 3 existing workspace warnings.
- Synthetic child-process tests use private temporary runtime directories and
  loopback fake Providers only. They cover ambiguous direct/queue submission,
  two-restart pending cancellation, pre-dispatch cancellation, malformed snapshots,
  mixed-entrypoint capacity through response body delay, and rejected-lane cleanup.
- Split error/status tests preserve cancelled/indeterminate and avoid a second
  BFF error frame. This is not a replacement for prior real-clock chain evidence.

## Integration
Base a544d6e already includes the parent's expiry/history receipt fix and UI merge.
No UI files are changed. Merge/cherry-pick only this atomic commit into the latest
integration branch, rerun its full tests and rebuild the final Docker image.
Keep task-watch.json and queued-turns.json on the existing persistent volume.
Active cancellation now returns 202 pending unless a Provider terminal is confirmed;
clients must keep observing the original task instead of treating DELETE acceptance
as a terminal execution result.

## Rollback
Revert the implementation commit only after draining work. Preserve recovery files;
older code must not be allowed to resubmit unresolved intents.
