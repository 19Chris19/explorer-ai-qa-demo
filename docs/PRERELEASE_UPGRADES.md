# Paired prerelease upgrades

Default Agent installation selects a stable Release, never a prerelease merely
because it is newest. Invited gray testing uses a fixed website RC Release and
its `deploy/bundle.env` Provider tag. Both images must have accepted manifests
and matching immutable digests. Do not independently select two latest versions.

The same release supports Node and Docker. `STATUS=released` means publication
is permitted, not that an RC is stable; the version suffix and manifest `channel`
identify prerelease testing. A stable website bundle rejects an RC Provider.
Private repository/image access is still required, and existing installations
keep their own Provider, credentials and volumes unless explicitly configured
for an approved shared service.

Before upgrading, prepare fixed artifacts, prove compatibility and queue
idleness, preserve private configuration/signing/visitor data and select a
compatible rollback anchor. Never reinitialize or use `down -v`. The durable
website requires `durable_qa_tasks_v1`; it will not fall back to the legacy
connection-owned ask path. Backward recovery must preserve uncertain tasks and
new histories rather than restore stale snapshots.

GitHub code, Release/images, Air website, Docker website and Vercel proxy are
separate rollout states. A private PR merge deploys the Vercel proxy, not Air;
validate its preview before merging and verify the public revision afterward.
