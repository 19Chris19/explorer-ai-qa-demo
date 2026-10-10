# Preserve cancellation before Provider submission

Change-ID: FIX-20261009-EXPLORER-CANCEL-RECEIPT

## Goal and scope

Persist DELETE acknowledgement when a queued turn is running locally but still
awaiting Provider readiness. A crash must not restore that cancelled draft as
paused. Keep submitted or ambiguous cancellation recovery intact and do not
persist raw client identity for never-submitted drafts.

Scope: conversation-turn-queue.mjs, focused synthetic regressions, this record.
Independent branch from b332d98, which includes 827ef49. No parent workspace,
server, UI, live configuration, credentials, or deployment changes.

## Verification plan

First reproduce with a real BFF child process and loopback-only fake Provider:
hold dispatch readiness, DELETE the job, kill the BFF before readiness returns,
restart on the same temporary storage, and assert no resurrected draft or POST.
Then persist the cancellation receipt and discard only provably unsubmitted
cancelled rows on recovery. Cover maintenance preservation and retain existing
ambiguous/submitted cancellation tests. Run focused tests, full suite, build,
diff checks and the external repository governance check.

## Verification results

- Red first: the new HTTP DELETE / SIGKILL / restart regression failed because
  the acknowledged deleted draft returned as paused. No Provider POST occurred.
- Green: all 15 focused queue and recovery tests pass. Three new regressions
  cover the actual BFF restart and both ordinary and maintenance-preserving
  recovery, including sibling draft retention and no raw draft client identity.
  Existing ambiguous and accepted cancellation recovery tests remain green.
- Full npm test: 244 passed, 2 skipped, 0 failed (54.937 seconds).
- npm run build and git diff --check pass.
- External root scripts/check_governance.py --ci: 0 failures, 3 existing
  workspace/upstream/worktree warnings. This checks the OpenLongXia root,
  not this standalone website repository, which has no local checker.
- Verification uses synthetic temporary storage and loopback fake Provider
  only. No live calls, deployment, or new long-clock proof is claimed.

## Rollout and rollback

Parent may cherry-pick the atomic commit for candidate integration. No live
rollout is performed. Revert this commit to restore the previous behavior;
older code ignores unsubmitted cancellation receipts on recovery.
