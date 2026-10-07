# FEAT-20261007-SHARED-INSTALLER

## User Goal
Offer online, invited shared gateway, or independent installation before software
installation. Shared installs own only website/BFF and nginx, never Provider accounts.

## Scope
Installer, shared Compose, current deployment docs, synthetic tests. Based on v0.2.1.
The parent integrates provider-a-client.mjs/server.mjs; neither is edited here.
No deployment, live credentials, release, push, or system changes.

## Contract and Safety
PROVIDER_A_MODE=shared, fixed HTTPS ts.net origin, site-scoped gateway token, /v1.
No raw Provider credentials/scope, QR/admin configuration, or Provider volumes.
Require explicit choice in unattended use, private token file, fresh configuration
and project; never overwrite or automatically adopt existing resources.
Docker configuration generation may use a container after explicit mode and checks.

## Plan / Acceptance
1. Separate selection entry from compatible independent onboard commands.
2. Implement shared Node/Docker configuration and website-only Compose.
3. Test no side effects before selection/checks, secret handling, endpoint rejection,
   repeated initialization, resource protection, and topology.
4. Update current docs without rewriting historical acceptance records.
5. Run tests/build/diff and available governance; create structured local commits.

## Verification
- PASS: final `npm test -- --test-reporter=dot`: 196 tests, 194 passed,
  2 skipped, 0 failed (exit 0); previous verbose run: 195/193/2/0 before the
  final missing-Tailscale start regression was added.
- PASS: 18 new synthetic shared-installer tests; `npm run build`; `sh -n install.sh`;
  `git diff --check`; offline capability probe against the parent's integrated adapter.
- `python3 scripts/check_governance.py --ci`: unavailable in standalone Explorer
  (file absent, exit 2). Use the installed git-agent-governance checker with --repo
  and --ci against this worktree: staged gate PASS, exit 0, 13 checks passed,
  4 pre-existing soft warnings, 0 hard failures. Staged whitespace check PASS.
- NOT RUN: live gateway, deployment, real questions, Windows/WSL2 execution, remote
  Linux. No system/Tailscale/3117 changes. Parent owns actual adapter/image testing.

## Implementation / Handoff
`install.sh` and Windows `install.ps1` select before software changes. Windows
shared runs in an explicit WSL2 Linux checkout, never silently adopts /mnt ACLs.
Read-only preflight checks software/platform/config existence without private reads.
Docker requires Compose 2.30+ raw env support, checks orphan resources, validates
24-512 printable ASCII site tokens before build/config, builds current source by
default, and probes shared capability before generating config. Explicit images
are inspected and pinned to local ID; old v0.2.1 fails the offline feature probe.
Gateway accepts exactly HTTPS host.tailnet.ts.net, no port/path/trailing slash.
Website cookie secret is independently random, 64 hex characters.
Local homepage liveness does not depend on gateway; explicit readiness separately
reports offline/auth/contract/capacity, refuses redirects and sends no question.
Pinned Provider v0.4.2 onboard/runtime calls unchanged: no new deployment-mode flag.
Current release wording updated; dated historical acceptance records retained.

## Rollout / Rollback
Integrate with parent's adapter and review before any deployment. No release here.
Revert these commits for source rollback; retain private config and current data.
