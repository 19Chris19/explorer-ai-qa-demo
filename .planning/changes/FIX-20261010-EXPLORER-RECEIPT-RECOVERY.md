# FIX-20261010-EXPLORER-RECEIPT-RECOVERY

## User Goal

Fix lost definitive rejection receipts, lost queued acceptance/pause/delete
recovery by requestId, and safe preview HTTP 422 semantics before parent review.

## Scope And Boundaries

- Work from 4c4e3bb on codex/FIX-20261010-EXPLORER-RECEIPT-RECOVERY.
- Only BFF/browser recovery semantics, preview 422, related tests and documents.
- No private environment/runtime/history reads, real Provider calls, deployment,
  push, version/image workflow or deployment bundle changes.
- Unknown acceptance remains unresolved; no automatic replacement POST.

## Implementation Plan

1. Add failing BFF, browser and cross-proxy regressions with synthetic data.
2. Return owner-scoped rejection receipts from requestId GET; consume them in
   the browser after response loss and refresh. Commit the complete behavior.
3. Correlate queue snapshots and recovery by requestId, including paused and
   explicitly deleted drafts. Commit the complete behavior and documentation.
4. Preserve HTTP 422 only for known JSON submission errors; keep infrastructure
   bodies masked. Commit tests, implementation and final handoff evidence.

## Acceptance

- Lost rejection and refresh settle as rejected and release the browser identity.
- Lost queue acceptance is associated with its job, stays editable when paused,
  and deletion clears the matching request identity without Provider dispatch.
- Unknown submissions and cancellation-in-flight remain non-replayable.
- Ownership, conversation filtering and response sanitization stay intact.
- Red-first focused tests, related regression suite, whitespace and governance
  checks pass. Tests run on public-source temporary copies without .env files.

## Verification

- Rejection red-first: 2/2 regressions failed (submission_unknown instead of
  rejection; refreshed browser identity never cleared).
- Implemented owner-scoped rejection receipts and browser consumption: 46/46
  related tests passed; 5/5 focused rejection/filter/malformed tests passed after
  additional ownership coverage. Whitespace clean; external root governance
  0 failures / 3 existing warnings.
- No runtime or release verification is claimed; parent owns integration, builds
  and rollout.
- Queue red-first: 3/3 new acceptance/pause/delete/refresh regressions failed.
  After implementation 3/3 passed and the expanded related suite passed 64/64.
- Additional crash-window test failed with a resurrected paused draft; startup
  reconciliation now applies persisted local cancellation before queue recovery.
  Expanded queue regression suite passed 67/67; final delayed rejection,
  no-replay and crash-window checks passed 3/3. Whitespace clean; external root
  governance 0 failures / 3 existing warnings.

## Rollout And Rollback

Parent reviews and integrates named local commits; no push or deployment here.
Revert these commits to restore the previous recovery behavior. Preserve receipt
journals and do not convert unresolved requests into replacement submissions.
