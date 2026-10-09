# Durable website candidate handoff

2026-10-10: codex/INT-20261009-EXPLORER-DURABLE is isolated and unpublished.
Earlier verified runtime source 05a5bf5; Provider pair 866b731. Latest website
runtime source 418cbdb includes durable-aware readiness, a synthetic task preview
fixture, acknowledged cancellation recovery and safe proxy error contracts. See
docs/DURABLE_TASK_ACCEPTANCE.md for fixed images and exact verification.

Implemented: owned task BFF, durable submit/cancel recovery, GET-only observation,
browser refresh/reconnect/partial terminal recovery, queued task integration,
public route allowlists and removal of the public single-execution gate.
Production configuration, credentials and live services are unchanged.

Current gates: renewed maintenance window, actual public-network/IMA
verification, visual approval and paired release review. Do not update 4318
alone against an old Provider; do not silently fall back to direct execution.

Earlier verification: 238 pass / 2 optional skip; build; 370717ms synthetic chain;
ARM64 Docker replay/restart; browser refresh and 390/1366px DOM checks.
Final website: 260 pass / 2 optional skip / 0 fail; build passed. Actual Provider
export -> unchanged website parser integration separately passed 7/7. Final
Provider source 350bc8bd: 798 pass / 6 optional skip; native long-clock task
365738ms succeeded with one dispatch. Paired 370977ms chain used 81f24de /
9adec552 before final pair retention/proxy-error follow-ups. Browser tooling is
currently unavailable, so no new visual acceptance is claimed.
Final ARM64/AMD64 images passed Nginx/BFF/Provider chain and restart checks;
image identities are in the acceptance report. No private image data, website
UID 1000, empty persistent-data directory. Fixed Node 22 artifact short chain
passed 2221ms. Test containers stopped without deleting retained synthetic volumes.
No real IMA, remote PR/release or production deployment was performed.
