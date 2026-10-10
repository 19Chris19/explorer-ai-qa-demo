# Show accepted queued questions immediately

Change-ID: FIX-20261009-EXPLORER-QUEUED-ACCEPTANCE

## Goal and scope

Show the user bubble and a quiet queued state as soon as a durable task is
accepted, even while its first snapshot is pending. Reuse the same turn when
execution starts. Separate waiting from execution time and restore execution
elapsed time from valid task timestamps after refresh.

Definitive POST 409 conflicts reject visibly and retain the draft instead of
looking up and adopting a different original task. Network/408/5xx ambiguity
continues lookup-only recovery; no automatic repeat POST.

Frontend feature branch only. No BFF, Provider, proxy, gateway, deployment,
credentials, or real QA changes. Preserve composer focus and existing layout.

## Verification plan

Synthetic lifecycle and browser-DOM tests for acceptance before snapshot,
queued-to-running handoff without duplicate bubbles, cancellation while queued,
timestamp validation and refresh timing. Run affected regression tests, build,
staged secret scan, diff check, and the available external governance checker.

## Verification results

- Seven new synthetic unit/browser-DOM regressions pass: immediate queued
  acceptance before snapshot, one-bubble handoff, queued cancellation, restored
  running elapsed time, invalid timestamp handling, and definitive conflicts
  for direct/queue submissions with bilingual draft retention.
- Full standalone feature branch: 209 tests, 206 passed, 2 existing skips, one
  known static allowlist failure for task-stream.mjs. Parent BFF commit 662cfa4
  owns that allowlist fix, already present on the integration branch. No edits
  to parent-owned files.
- npm run build and git diff --check pass. External governance checker passes
  with pre-existing soft warnings; this private checkout has no local
  scripts/check_governance.py. Named staged-file release/secret scan passes.
- No real QA, live rollout, or deployed changes. Browser-DOM verification only
  for this follow-up; parent owns final image/browser acceptance.

## Rollout and rollback

Parent can cherry-pick the atomic follow-up onto the integrated candidate.
No live rollout. Revert only this follow-up commit to roll back.
