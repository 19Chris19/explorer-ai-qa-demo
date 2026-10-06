# FEAT-20261006-EXPLORER-MAINTENANCE-DRAIN

Owner: provider-admin-20261006
Base: 0c2ce9d87ecc264f577f91f75c991a6213717f1a
Branch: codex/FEAT-20261006-EXPLORER-MAINTENANCE-DRAIN

## Goal and design
Private local maintenance admission for each website BFF, without a public admin
API or a QA contract change. DEMO_MAINTENANCE_STATE_PATH is server/operator-only.
Unconfigured means open. Configured missing, unsafe, malformed or rolled-back
state means closed. Only owner-owned 0700 directories and 0600 regular files
outside project trees are accepted; symlinks and hard links are rejected.
CLI close/open uses an exclusive private lock and atomic generation CAS with an
operationId. A missing state can only be initialized by close at generation zero.
Open must reference the active close operation. No browser path/owner override.

Close rejects new ask, queue enqueue and new conversation before admission;
already admitted requests, queued turns, reads, streams and deletion continue.
Private snapshots carry generation, observation time and exact inflight,
direct/running/queued/paused/expired pending and preview counters. Drained is
true only for observed CLOSED plus zero work. CLI rejects stale/mismatched
snapshots. One state path per BFF process, with a private writer lease.

Configured maintenance retains expired pending text as paused rather than silently
pruning it, including restart recovery. Owner deletion is required; opening does
not resume paused jobs. No runtime import, credential change or upstream switch.

## Verification
Tests first: private path and permission validation, malformed fail-closed, CAS,
operation binding, stale snapshots, queue preservation/drain and HTTP disconnect.
Red observed: missing gate module; stopped-writer snapshot falsely certified
drain; both public proxies dropped Retry-After; an expired paused head allowed
a later queued item to dispatch; losing the writer lease did not close admission.
Each regression was fixed after its failing test. Two concurrent CLI processes
proved only one CAS transition succeeds.

Green: npm test reports 114 tests, 113 passed, 1 pre-existing optional Provider
export interop skipped (external transfer module not supplied). npm run build,
node syntax checks and git diff --check passed. Dependencies were temporarily
linked from the parent website checkout, then the link was removed; no dependency
or lockfile changes. All HTTP tests use synthetic ephemeral loopback servers.
The website has no scripts/check_governance.py; invoking the requested CI command
reports missing file, so no governance pass is claimed. No root checker was used
to imply coverage of this independent website repository.

Deployment wording now assigns real export/audit work to the installation
maintainer in an authorized window, explicitly separating candidate source from
current running services. No claim that 3117 has migrated.

## Rollout / rollback
Candidate only; no live services, data, deployment or push. Each BFF requires its
own external private directory. Close and prove drain before changing Provider.
Before rollback reconcile retained pending jobs; older code prunes their TTL.
