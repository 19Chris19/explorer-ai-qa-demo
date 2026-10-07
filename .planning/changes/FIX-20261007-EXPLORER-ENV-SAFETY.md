# Explorer Installer Environment Safety

## CI Follow-up (2026-10-07)

Linux PowerShell CI exercised a locally skipped test and found that the .NET
setter left an environment entry visible to PowerShell. Use explicit Env-provider
removal instead. The existing strict test remains unchanged; rerun CI before
acceptance. No Windows desktop validation is implied.

Change-ID: FIX-20261007-EXPLORER-ENV-SAFETY
Base: 82e41595fd7c3e8df859ef726e8a10665fe5c406
Branch: codex/explorer-shared-env-safety-20261007

## User Goal And Scope

Prevent ambient Node preload, module-search and TLS-disable settings from reaching
the first shared installer Node process or its BFF child. Only install.sh,
install.ps1, shared-install.mjs child environment, synthetic tests and this record
change. Parent owns direct shared TLS guards, server and documentation. Independent
onboard wrappers remain with the parent. No live services, installs, credentials,
source configuration loading or push. Start from the captured integrated commit;
leave uncommitted edits in the source worktree untouched.

## Design And Acceptance

- Remove NODE_OPTIONS, NODE_PATH and NODE_TLS_REJECT_UNAUTHORIZED natively before
  any Node or WSL dispatch; keep online mode dependency-free.
- Filter those same keys from the shared BFF child environment as defense in depth.
- Use harmless red-first preloads, synthetic commands and an exiting fake server,
  never a listening service. Preserve unrelated environment settings.
- One atomic local commit after named-file staged review and available governance.

## Verification

- RED: targeted new tests reproduced six failures before the fix: preloads in all
  four Node actions, retained child NODE_PATH/TLS-disable variables and missing
  PowerShell guard. Online/no-choice regression passed; PowerShell execution skipped.
- GREEN: `node --test test/shared-installer.test.mjs`: 26 tests, 25 passed,
  1 skipped (PowerShell unavailable), 0 failed. Real Node executes only harmless
  probes or an exiting fake server. Docker and WSL are synthetic command doubles.
- PASS: `sh -n install.sh` and `git diff --check`.
- Repository-local `python3 scripts/check_governance.py --ci` unavailable (script
  absent, exit 2). Installed skill checker `check_governance.py --repo <worktree>
  --ci`: PASS, 13 checks passed, 4 pre-existing soft warnings, 0 hard blockers;
  named staged files passed the secret scan. No historical governance repair.
- NOT RUN: full application suite/build (no application or asset changes), native
  Windows/WSL, real Docker, live gateway or services. Parent owns direct TLS guard
  commit 210d88b, docs/bootstrap integration and the pre-existing static assertion;
  this change neither edits that assertion nor incorporates those parallel commits.

## Rollout And Rollback

Parent may review/cherry-pick the commit into the integrated candidate. No release
or deployment here. Revert the commit for source rollback; retain private data.
