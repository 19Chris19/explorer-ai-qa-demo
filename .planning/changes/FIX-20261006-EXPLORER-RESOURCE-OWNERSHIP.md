# FIX-20261006-EXPLORER-RESOURCE-OWNERSHIP

## Goal

Follow-up to Compose lock review: new website installations must not silently
reuse orphan Provider-account or website-queue volumes/networks after containers
are removed. Provider-only changes belong to the other agent.
Implemented on codex/FIX-20261006-EXPLORER-COMPOSE-LOCK after d342c60.

## Scope and design

- Protect onboard init, deploy.sh init and legacy docker:start before configuration,
  image execution or build. Check containers, project-labeled volumes/networks,
  and exact default Compose volume/network names even without project labels.
- Inventory errors fail closed. Do not adopt, reset, delete or relabel resources.
- Init continues to refuse existing configuration even with deployment metadata.
  Existing owned installations use explicit resume after metadata validation.
- Unified resume/repair/check also reject a project mismatch between deployment
  metadata and the release lock before helper or Compose side effects.
- Add synthetic negative tests first, then implementation and documentation.

## Verification and handoff

- Red first: all 15 initial resource regressions failed; the separate mismatched
  project-metadata regression failed too.
- First targeted run after implementation: 25/25 passed, including existing
  installer, Compose-lock, upgrade/rollback and host-gateway tests.
- Expanded to 19 resource tests: account and queue volumes independently, labeled
  or name-colliding resources, unrelated resources, invalid project, container
  collision and failures at each inventory query.
- Full serial suite: 183/183 passed, zero skipped, with the reviewed public
  Provider account-transfer module enabled for synthetic cross-repo tests
  (`npm test -- --test-concurrency=1`). No runtime/platform acceptance claim.
- npm run build, sh -n deploy.sh, npm run check:release and git diff --check passed.
- Governance checker remains unavailable in this standalone repository; use its
  release and staged-blob checks, not a claim that the missing checker passed.
- Fake Docker and temporary synthetic fixtures only. No daemon access, existing
  configurations, credentials, real data, push or release status change.
- Rollback: revert this follow-up commit; no runtime/configuration migration occurs.

Ready for review/cherry-pick after d342c60. Main release record, candidate bundle,
configure-local-provider.mjs and Provider repository remain untouched.
