# Durable task frontend reconnection

Change-ID: FEAT-20261009-EXPLORER-TASK-UI

## Goal and scope

Keep one submitted QA task alive across stream rotation, network loss, refresh,
and conversation navigation. Never automatically resubmit a question. Preserve
the existing layout, focus behavior, queue editing and Chinese/English UI.

Owned files: public/task-stream.mjs, public/app.js, frontend tests/support, this
record. No server, provider client, proxy, gateway, credentials, or deployment
changes. Base: 5b61704; branch: codex/FEAT-20261009-EXPLORER-TASK-UI.

## Contract and decisions

- Require health.durableTasksSupported === true; keep drafts on incompatibility.
- POST /api/qa/tasks once per requestId. Ambiguous results use GET list lookup,
  including after refresh; they never fall back to direct ask.
- GET task returns task plus snapshot.events. Events have sequential integer
  IDs. Duplicate IDs are ignored; gaps/conflicts recover from the same snapshot.
- GET events?after=N may end normally after 240 seconds. Heartbeats are 15
  seconds; missed heartbeats reconnect without declaring task failure.
- DELETE is explicit cancellation. Aborting a view subscription is not cancel.
- localStorage stores bounded, validated task/conversation/request IDs only;
  no questions, answers, source content, tokens, or event payloads.
- Confirmed with parent: POST {task}, list {tasks}, GET list ?requestId correlates
  Provider requestKey without exposing raw request IDs, queue job.taskId becomes
  available after acceptance. Poll queue/task metadata to hand off to task SSE;
  never use the old queue stream EOF as a task outcome.
- Terminal events may expire after 24 hours. eventsExpired plus task.history
  triggers canonical conversation history recovery by taskId, without an empty
  answer, repeated stream attempts, or duplicate rendered history. Missing
  history is an explicit recoverable/unconfirmed state, never a successful answer.
- Queue jobs completed between polls are recovered by their saved requestId.
  New conversations disconnect only the viewed subscription. Stop DELETE is
  confirmed by task state even when its HTTP acknowledgement is lost.

## Verification plan

Synthetic unit and browser-DOM tests: rotation/network recovery, partial and
duplicate snapshots, cancellation, task resume, ambiguous POST lookup, capability
gating, cross-conversation viewing, and queue task subscription. Run npm test,
npm run build, git diff --check, and the available governance checker. No real QA
calls, no deployed changes.

## Verification results

- 22 new synthetic task unit/browser-DOM tests pass, covering all scenarios above,
  queue editing/deleting, fast queued completion, an expiration race returning
  HTTP 410 between snapshot and SSE, capability absence, cross-chat
  submission, and both normal and expired-event history deduplication.
- Full standalone frontend branch: 201 tests, 198 passed, 2 existing skips, 1
  expected integration failure: test/vercel-preview.test.mjs needs the new static
  module allowlist. Parent owns that file and added the module to gateway/proxy/
  Nginx/Vercel in BFF candidate 662cfa4. Do not duplicate that change here. Re-run
  full tests after integrating both commits before building a release image.
- npm run build, node scripts/check-release.mjs, and git diff --check pass.
- Real Chromium, loopback synthetic fixture only: one POST, stream rotation
  recovered one answer with no error; refresh did not POST again. 1440px and
  390px checks show one answer and no horizontal overflow. Browser screenshot
  capture timed out twice; screenshot-based visual verification is not claimed.
  Fixture and browser task were closed after testing.
- This private repo has no scripts/check_governance.py. The installed governance
  skill checker was run with --repo and --ci: 13 passes, 4 pre-existing soft
  warnings, zero hard blockers. Existing warnings concern incomplete governance
  initialization, an older change record, worktree ownership and no upstream.
- No real QA requests, Docker builds, release deployment, or upstream changes.

Reproduce the synthetic browser fixture with
`node test-support/task-ui-preview.mjs`; it prints a loopback-only URL and never
imports a Provider client. Stop it after the browser check.

## Rollout and rollback

Parent integrates with matching durable-task BFF/provider changes before release.
Local commit only. Revert this frontend commit together with the paired contract
changes to roll back; never turn an unknown task into a new automatic submission.
