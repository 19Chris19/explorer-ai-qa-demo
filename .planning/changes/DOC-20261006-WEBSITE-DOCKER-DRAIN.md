# DOC-20261006-WEBSITE-DOCKER-DRAIN

Owner: provider-admin-20261006
Base/source: 7d0a05cb42f2d46e0726c2b79a92ecc779b068e6
Branch: codex/DOC-20261006-WEBSITE-DOCKER-DRAIN

## Goal and scope
Documentation-only bounded Docker acceptance of the integrated maintenance and
strict queue preservation candidate (includes c08e7c62). Use the tracked Nginx
configuration and synthetic Provider, no real Provider or IMA calls.

## Isolation and verification plan
Fixed git archive build context; serial builds. New internal Docker network,
three uniquely named read-only containers, no published ports or host/config/
account mounts, only independent tmpfs and synthetic tokens/cookies/history.
Container-internal requests through Nginx must prove CLOSED new-submission 503
and Retry-After, admitted SSE/queued completion and drain, paused work blocking
drain, archive owner isolation and management path denial. Check current strict
queue rejection separately without corrupting active queues. Record exact source,
image IDs, observations and limitations, then remove only owned resources.

## Results
PASS: nine isolated chain/module assertion groups, supplemental Provider auth and
exact dispatch-count checks, Docker BFF build, and 35/35 strict storage tests.
Evidence: docs/DOCKER_MAINTENANCE_ACCEPTANCE_20261006.md (fixed source, image IDs,
private snapshots, isolation and limitations). Owned containers/network/images
removed. No merge, deployment, live change, real data or upstream acceptance claim.

## Rollback
Revert documentation only. Test containers/network/images are temporary and will
be cleaned without any global Docker prune or touching prior test resources.
