# FIX-20261006-EXPLORER-COMPOSE-LOCK

## Goal and scope

From 668a5b9, fix review findings 1, 2 and 4: isolate Compose control/interpolation
environment, bind the recorded project and immutable image pair, supply synthetic
CI's required Provider image, and honor explicit host-gateway authorization in
release checks. Finding 3 belongs to the main agent; do not edit configure-local-provider.mjs.

## Plan and acceptance

1. Add failing synthetic tests with temporary configurations and fake Docker only.
2. Fix installer and POSIX maintenance entry points without adding a host Node
   requirement to deploy.sh. Preserve Docker transport/auth configuration.
3. Document the lock boundary; run tests, build, release and whitespace checks.
4. Named staging and structured local commit. No push or release status change.

## Safety and rollback

No existing configuration, credentials, live services, Docker daemon, or real data
may be accessed. No platform-runtime acceptance claim. Roll back this isolated
change by reverting its commits; no runtime migration is performed.

## Implementation

- Installer constructs every Compose invocation from the validated six-field
  release lock, explicitly passes its project with `-p`, and removes ambient
  Compose and interpolation variables (case-insensitively for Windows).
- deploy.sh independently validates the same generated format with POSIX awk,
  without sourcing configuration or requiring host Node. Each maintenance call
  rereads the current lock, including upgraded and restored image identities.
- Both entry points retain Docker transport and authorization settings. Custom
  Compose overrides are outside this managed installation entry point.
- Synthetic CI supplies its Provider image before per-file interpolation.
  Release checks honor only the existing explicit host-gateway opt-in.
- Candidate status, configure-local-provider.mjs and the main release record
  remain unchanged.

## Verification

- Red first: all four new regression tests failed before implementation.
- Targeted initial run: 11/11 passed after implementation. Subsequently expanded
  fake-Docker coverage verifies successful upgrade, failed acceptance recovery,
  rollback, immutable lock validation, project binding and environment isolation.
- npm ci --ignore-scripts --offline: passed; npm run build: passed.
- First default-concurrency full run: 155 passed, 2 failed, 1 skipped. One failure
  was a test wrapper not forwarding the new injected environment argument (fixed);
  the other was an existing synthetic BFF startup timeout. No timeout/assertion
  weakening. Serial full rerun with the public Provider synthetic contract enabled:
  164/164 passed, zero skipped (`npm test -- --test-concurrency=1` with
  `PROVIDER_A_TRANSFER_TEST_MODULE` pointing to the reviewed public candidate's
  src/account-transfer.js; synthetic fixtures only).
- sh -n deploy.sh, npm run check:release and git diff --check: passed.
- python3 scripts/check_governance.py --ci: unavailable (this standalone repository
  does not contain that script); repository release/staged checks are used instead.
- No real Docker commands, live services, existing configurations, credentials,
  real histories, push, release or cross-platform runtime validation performed.

## Handoff

Ready for review/cherry-pick from codex/FIX-20261006-EXPLORER-COMPOSE-LOCK.
The eight named files include this record, deployment model documentation, two
test files, three deployment implementations and synthetic CI configuration.
No runtime migration or reinitialization is needed. The normal parallel test
run's startup timeout remains a reported test reliability limitation; the serial
rerun is not represented as Docker or cross-platform acceptance.
