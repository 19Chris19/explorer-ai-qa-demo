# Durable candidate documentation closeout

Goal: installation and Agent instructions must describe the checked candidate,
not the previously deployed direct-stream implementation.

Remove obsolete public one-execution and 190-second total limits. Document
bounded read-only subscriptions, upstream task ownership, legacy compatibility
and the exact remaining approval/acceptance boundaries. Synchronize paired
source/image evidence after final integration verification.

Verification: compare docs with BFF/proxy route and timing tests, check links and
staged diff; no production state or real answers are read or modified.

Rollout: isolated candidate docs only; not an Air or Vercel deployment.
Rollback: revert documentation, never restore private runtime data.
