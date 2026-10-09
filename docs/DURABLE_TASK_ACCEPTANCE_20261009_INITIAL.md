# Historical initial durable QA isolated acceptance

Superseded by DURABLE_TASK_ACCEPTANCE.md. This dated report describes an earlier
candidate, not the current runtime or installation instructions.

Date: 2026-10-09. Status: isolated candidate, not released or deployed.
No real questions, account data, production runtime changes or remote pushes
were used. Existing 3117/3317/4317/4318/4417, robot and Vercel remain unchanged.

## Fixed runtime pair

| Component | Source commit | Local ARM64 image identity |
| --- | --- | --- |
| Provider A | 866b731fa4bdd3d424e14ffcd110196b4198e8bc | sha256:a85eb7dd6a487c6e10867abe543dbb52a97f294565d90b0df04509b9b284df7f |
| Explorer | 05a5bf5bcaec0f6c6839b701e4256bb9451b8f2a | sha256:2865c9770fb76c9dd58c9e0ff9c929d2c08bbd19ebde014124fcb2db540ce893 |

These are local image IDs, not published registry digests. Subsequent changes
in this acceptance commit affect tests/documentation only, not runtime sources.
Provider branch: codex/INT-20261009-PROVIDER-DURABLE.
Explorer branch: codex/INT-20261009-EXPLORER-DURABLE.

## Observed results

- Provider complete Node suite: 637 tests, 632 pass, 5 optional skip, 0 fail.
- Explorer complete Node suite: 240 tests, 238 pass, 2 optional skip, 0 fail.
- Explorer build and both ARM64 image builds passed.
- Final real-clock synthetic pair: 370717ms, one 240-second subscription
  rotation, one upstream dispatch, one terminal completion, exact whitespace.
- Native HTTP synthetic transport separately survived 365115ms without upstream
  bytes and finished after 365867ms; it does not impose a 180/190/300s total cap.
- Nginx -> BFF -> real Provider application with injected fake upstream passed
  replay, duplicate/conflicting submissions, owner isolation, exact Markdown,
  sources, unique history, explicit cancellation and management-path blocking.
- Restart of only the isolated Provider container yielded indeterminate for
  dispatched work, no fabricated history, and no new dispatch on repeated submit.
- Browser on the final pair: refresh during generation resumed the same task;
  the third synthetic table completed and remained identical after another
  refresh. DOM width checks passed at 390px and 1366px. Earlier candidate also
  passed browser offline/online recovery. Automated replay tests cover final code.
- Screenshot capture timed out. DOM checks do not substitute visual approval,
  real phone keyboard checks or an actual mobile/public-network experiment.
- Root governance: 0 failures, 3 pre-existing warnings (dirty unrelated paths,
  no upstream, many worktrees). Named candidate changes pass whitespace checks.

Under heavy simultaneous test load, the first final website suite had two test
timing failures. Focused runs passed; heartbeat ordering now has controlled-clock
coverage, and the CLI test waits for a fresh maintenance snapshot. The production
2-second freshness check is unchanged. The complete rerun above passed.

## Reproduce without accounts

Read deploy/docker/compose.durable-test.yaml before starting the isolated fixture.
It injects a fake Provider upstream and uses an internal network with no IMA
egress. Never point these tests at a production Provider or production volumes.

```sh
npm test
npm run build
SYNTHETIC_PROVIDER_SOURCE=/absolute/path/to/provider-candidate \
  SYNTHETIC_DURATION_MS=370000 node scripts/verify-durable-chain.mjs
SYNTHETIC_WEBSITE_URL=http://127.0.0.1:TEST_PORT \
  node scripts/check-durable-docker.mjs
SYNTHETIC_WEBSITE_URL=http://127.0.0.1:TEST_PORT \
  SYNTHETIC_PROVIDER_CONTAINER=qa-durable-20261009-provider-a-1 \
  node scripts/check-durable-restart.mjs
```

The restart script deliberately rejects other container identities. Use only
the test project qa-durable-20261009. Stop its containers after acceptance; keep
all production containers and volumes untouched.

## Not yet accepted

Trusted per-deployment scheduling identity and account-aware runnable dispatch
remain follow-up work: current grouping is by trusted interface class, and a
pinned-account waiter can occupy a global dispatch slot. This is not complete
per-deployment work-conserving scheduling.

The public-base Provider candidate must reconcile Air's bot extensions before
3117 replacement. New website code intentionally refuses an older Provider
without durable_qa_tasks_v1, so 4318 must not be upgraded alone against it.

Actual Vercel/ngrok rotation, real long IMA question/follow-up, screenshots,
live maintenance/cutover, fresh AMD64 acceptance and remote release/PR are not
claimed. Request the appropriate authorization window before live changes.

Rollback must stop admission and drain work first. Retain task journals and
new histories; never replace them with an old backup or reask uncertain work.
