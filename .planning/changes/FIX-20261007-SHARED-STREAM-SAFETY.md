# Shared stream safety

- Change-ID: FIX-20261007-SHARED-STREAM-SAFETY
- Baseline: effc6fb; branch codex/FIX-20261007-SHARED-STREAM-SAFETY.
- User goal: fix deadline cancellation under downstream backpressure and enforce the observer packet limit with red-first synthetic tests.
- Scope: minimal server.mjs and provider-a-client.mjs patches, dedicated regression tests, this record.
- Non-goals: question-length alignment (owned separately), broad refactors, credentials, live traffic, deployment, network changes.
- Design: make drain waits abort-aware and destroy timed-out downstream responses; validate each complete SSE packet before parsing and bound pending UTF-8 bytes without rejecting batches of valid events.
- Risks: cancellation races must release admission exactly once; packet enforcement must remain independent of chunk boundaries.
- Acceptance: deadline/disconnect/drain regressions and oversized complete/split/UTF-8 packets; existing suite and build where local dependencies permit.
- Rollout: local atomic commit only; parent integrates after review.
- Rollback: revert this commit, preserving runtime data.
## Verification results

- Red first: initial regressions reported 5 failures and 3 passes on unchanged production code. The additional exact-frame boundary test also failed before its fix.
- Stream limit: 65,536 normalized UTF-8 bytes per frame including the two LF separators; coalesced valid frames are not capped as a batch.
- Initial targeted compatibility run: 20 passed; full suite: 188 passed, 2 optional integration skips; npm run build passed using a temporary symlink to existing local dependencies, without downloading packages. The symlink was removed after verification.
- Final verification after exact-boundary addition: npm test passed (189 passed, 2 optional integration skips), npm run build passed, git diff --check passed.
- Governance: skill-bundled checker used because this standalone repository has no scripts/check_governance.py; existing scaffold, historical change record, other-worktree ownership, and no-upstream warnings remain outside scope.
