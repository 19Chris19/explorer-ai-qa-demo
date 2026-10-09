# Keep answer status and terminal recovery consistent

Change-ID: FIX-20261009-EXPLORER-TASK-RECOVERY-STATUS

## Goal and scope

Render the generating lifecycle label in the same update as received answer
text. Restore the newest failed, cancelled, or indeterminate task from its
retained snapshot after local task identities have been forgotten. Use the
Provider's newest-first task order and successful history receipts to avoid
replaying an old failed turn after a newer successful answer.

Narrow frontend follow-up only: app.js, synthetic browser-DOM tests, and this
record. No queue refactor, backend changes, real QA, or live rollout.

## Verification plan

Reproduce the lifecycle render-order lag and refresh loss before fixing them.
Test immediate generation status, timer ticks and stream reconnection, each
unsuccessful terminal status without local records, history ordering, and no
duplicate or automatic POST. Run focused regressions, build, staged secret
scan, diff check, and external governance checker.

## Verification results

- Before the fix, four targeted regressions failed: immediate generation label
  and all three unsuccessful terminal refresh states. The label corrected on
  the next timer tick in the synthetic reproduction; a permanently stuck label
  was not reproduced locally.
- After the fix, all 42 focused lifecycle, task stream, browser-DOM, and history
  restoration tests pass. Nine new cases cover immediate label updates through
  rotation/ticks, each terminal state with empty or earlier successful history,
  and suppression of older failures with either task receipts or history dates.
- Corrected the existing timing assertion to accept equivalent 10 and 10.0
  formatting at the floating-point precision boundary.
- npm run build and git diff --check pass. Staged secret scan and external
  governance checker pass with existing soft warnings. The private repository
  has no local scripts/check_governance.py.
- Full suite not rerun for this narrow follow-up; the standalone feature branch
  still depends on the parent's already-integrated task module allowlist.
- Synthetic DOM evidence only, no screenshot claim, real QA, or deployment.

## Rollout and rollback

Parent can cherry-pick the atomic follow-up for candidate acceptance. No live
rollout. Revert this commit to restore the previous frontend behavior.
