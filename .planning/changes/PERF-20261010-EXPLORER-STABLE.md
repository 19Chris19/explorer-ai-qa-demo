# Website performance and stable publication

## Goal
Measure initial load, idle work and streamed Markdown; fix demonstrated overhead
before publishing website v0.3.0 paired with Provider v0.5.1 as stable defaults.
Preserve the RC tags, existing data and runtime services. No real IMA probes.

## Scope
- Coalesce viewer renders without dropping task events or altering replay/history.
- Compress and revalidate allowlisted static assets; HTML and APIs stay no-store.
- Add repeatable resource budgets, synthetic tests and browser measurements.
- Align installation/version docs; review PR/CI, immutable multiarch images and
  manifests before publishing new stable tags. Do not relabel an existing RC tag.

## Gates and limitations
Node tests/build/package checks and synthetic browser desktop/mobile checks.
Real mobile, Windows, SSH enrollment and Linux uptime remain unverified.
Air intermittent readiness failures are a separate host/service gate, not proof
that a few-hundred-KB frontend is heavy. No local service cutover is authorized
by the GitHub publication itself.

## Rollback
Revert the scoped optimization commit before publication if it regresses content.
After publication retain compatible task-aware code and all current data; do not
roll back to legacy task-unaware releases or overwrite live state with backups.
