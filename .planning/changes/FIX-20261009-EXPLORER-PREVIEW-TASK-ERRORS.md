# Preserve safe durable task errors across preview

Change-ID: FIX-20261009-EXPLORER-PREVIEW-TASK-ERRORS

## Goal and scope

Base: website parent 9adec55. Preserve API 410 only for allowlisted API paths
with JSON error content type and no tunnel error marker. Rebuild a small set
of machine codes from endpoint, method and status, never upstream error text.
Keep tunnel/invalid-content-type failures as service unavailable, existing
503 and bounded Retry-After behavior, route restrictions, and no POST retries.

Scope: preview/api/proxy.mjs, preview/api/failure.mjs, focused synthetic tests
and this record. No raw gateway/BFF, UI, Provider, live or parent edits.

## Safe machine mapping

- GET task events: 409 task_cursor_mismatch, 410 task_events_expired,
  503 task_subscription_unavailable.
- POST tasks or queue: 409 task_request_conflict, 503 task_request_unconfirmed.
- GET/DELETE one task: 410 or 503 task_request_unconfirmed.
- All other combinations retain preview_<status>. Mapping uses the original
  status, not a normalized 503. Upstream error bodies are cancelled, not read;
  even an upstream code matching the whitelist is not copied. These codes are
  endpoint-level categories, not assertions about a private rejection cause.

## Verification plan

Save the seven reviewed cross-proxy cases first: events 410 then expired
snapshot; cursor 409 then fresh snapshot; direct and queued POST 409; DELETE
202 pending; DELETE 503 then confirmed snapshot; split SSE error/cancelled.
Add red-first assertions for status and safe codes, tunnel/content-type
isolation, route/auth restrictions and maintenance Retry-After. Run focused
tests only; parent owns final full tests, builds and candidate images.

## Verification results

- Saved the seven cross-proxy cases before changing production code. Red first:
  7 failures and 2 passes across those cases and the two boundary tests.
- Added a red-first exact-status boundary check, then ensured HTTP 500 does not
  acquire a whitelisted HTTP 503 task code through normalization.
- Green: 26 focused tests pass across preview-task-errors, preview-failure,
  task-stream and vercel-preview. Includes all seven cross-proxy scenarios,
  ngrok/HTML/SSE/asset 410 isolation, no raw error text, no repost, maintenance
  Retry-After and unchanged route/origin/key restrictions.
- git diff --check passes. External root governance: 0 failures, 3 existing
  warnings; the standalone website repository has no local governance checker.
- Full suite, build and image rebuild deliberately not run; parent owns those
  final gates. All network responses are mocked in memory, with no live calls.

## Rollout and rollback

Parent may cherry-pick the atomic commit for preview candidate integration.
Revert this commit to restore generic preview failure mapping. No deployment
or image rebuild is performed in this worktree.
