# FIX-20261006-EXPLORER-SOURCE-MAP-AUDIT

## Goal and scope
Update only the source-map-js development transitive dependency from 1.2.1 to
1.2.2 for GHSA-68fv-2mgg-jv7q. Base: 1a40cce0ba86614f351d849952e09f7d9fb6328a.
Owner: provider-admin-20261006, independent claimed codex worktree.
No package.json, major versions, runtime, live services or checker changes.

## Implementation
Targeted npm update --package-lock-only --ignore-scripts changed only the
source-map-js version, resolved URL and integrity. The existing ^1.2.1 range
already accepts 1.2.2. Dependency path: jsdom -> css-tree -> source-map-js (dev).
Production Docker installation continues to omit development dependencies.

## Verification
Clean npm ci --ignore-scripts passed. Full npm test with the explicit reviewed
Provider account-transfer.js module: 108/108 passed, zero skipped. Build passed.
npm audit --omit=dev: zero vulnerabilities; npm audit --include=dev: zero
vulnerabilities. Provider source hashes unchanged before/after verification.
Named staging, staged review and whitespace check passed. Shared governance
still has the existing main-shell missing-SHA finding at this commit; the next
documentation-only commit addresses its evidence, not the checker. Local checker
is absent. No Docker or live validation was performed.

## Rollout and rollback
Unpublished dependency candidate only; no deployment, restart or live requests.
Revert this commit to restore the old lock (and its known dev-only vulnerability).
