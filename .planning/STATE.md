# Durable website candidate handoff

2026-10-09: codex/INT-20261009-EXPLORER-DURABLE is isolated and unpublished.
Runtime source 05a5bf5; Provider runtime pair 866b731. See
docs/DURABLE_TASK_ACCEPTANCE.md for fixed images and exact verification.

Implemented: owned task BFF, durable submit/cancel recovery, GET-only observation,
browser refresh/reconnect/partial terminal recovery, queued task integration,
public route allowlists and removal of the public single-execution gate.
Production configuration, credentials and live services are unchanged.

Current gates: Provider application identity/pinned-wait scheduling follow-up,
Air bot compatibility, renewed maintenance window, actual public-network/IMA
verification, visual approval and paired release review. Do not update 4318
alone against an old Provider; do not silently fall back to direct execution.

Verification: 238 pass / 2 optional skip; build; 370717ms synthetic chain; final
ARM64 Docker replay/restart; final browser refresh and 390/1366px DOM checks.
No real IMA, remote PR/release or production deployment was performed.
