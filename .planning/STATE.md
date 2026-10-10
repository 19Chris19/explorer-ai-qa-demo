# Durable website handoff

## Stable publication preparation, 2026-10-10

Branch codex/PERF-20261010-EXPLORER-STABLE targets v0.3.0 paired with Provider
v0.5.0. New stable tags retain the original RC tags. Local full suite: 284 pass,
2 optional skip, 0 fail; static gzip/revalidation and frame-coalesced painting
are scoped optimizations. Resource/browser evidence and limits are recorded in
docs/FRONTEND_PERFORMANCE_20261010.md. CI, native multiarch images and attached
accepted manifests remain publication gates. No real IMA question, local
cutover, Docker restart or robot operation is part of this publication.
Air availability under host pressure remains an operational limitation, separate
from stable source selection. Older checkpoints below are dated history.

## Current publication checkpoint

2026-10-10: v0.3.0-rc.1 / Provider v0.5.0-rc.1 published after PR #8 / #14 and
paired multiarch/manifest acceptance. Air 4317, 4318, Docker 4417 and Vercel now
use the fixed pair; original data and five-account pool preserved, robot and
dormant Provider untouched. Skill 1.0.1 installed after approval. Actual protected
Vercel/ngrok synthetic replay and desktop/mobile-browser checks passed. No new
real question. Host load and intermittent health timeouts prevent a stable
availability claim; keep RC. See docs/RELEASE_ACCEPTANCE_20261010.md.

## Historical preparation and earlier preview

2026-10-10: codex/OPS-20261010-EXPLORER-DURABLE-PREVIEW records an authorized
4318 preview rollout; the durable candidate remains unpublished.
Earlier verified runtime source 05a5bf5; Provider pair 866b731. Latest website
runtime source 418cbdb includes durable-aware readiness, a synthetic task preview
fixture, acknowledged cancellation recovery and safe proxy error contracts. See
docs/DURABLE_TASK_ACCEPTANCE.md for fixed images and exact verification.

Implemented: owned task BFF, durable submit/cancel recovery, GET-only observation,
browser refresh/reconnect/partial terminal recovery, queued task integration,
public route allowlists and removal of the public single-execution gate.
During isolated verification production configuration, credentials and live
services were unchanged. The authorized live addendum below supersedes that state.

Current gates: actual public-network verification, visual approval, patched
image rebuild and paired release review. Do not update a website
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
No real IMA, remote PR/release or live deployment was used in those isolated results.

Authorized live addendum: 4318 now runs durable-418cbdb0-4318, Provider final
source 97dbb5c (separate cooperative-parser fix after real probe on 350bc8bd).
Original runtime/config/signing/ownership preserved, five Provider accounts retained.
Real first question 312709ms, serial follow-up 146294ms, both success/one terminal,
same account/session, exact replay/history, three tables then one, two history answers.
Disconnect did not cancel the first task; tool recovery never re-submitted.
Finished tasks/history survive the later idle Provider patch restart unchanged.
Final parser patch: three focused tests, full suite and artifact startup passed;
no extra real questions or final patched image builds performed.
Admission gates OPEN, ready capacity five, queues idle. 4317/4417/public code
unchanged and robot neither started nor restarted. New browser space permission
pending; no fresh screenshot/phone/public-network pass is claimed.

## Local Receipt Recovery Repair

2026-10-10: codex/FIX-20261010-EXPLORER-RECEIPT-RECOVERY starts at 4c4e3bb.
Rejection receipt recovery: fd99311. Queue requestId/pause/deletion recovery:
6439098. Narrow preview 422 preservation and bilingual rejection text complete
the repair. Change record: .planning/changes/FIX-20261010-EXPLORER-RECEIPT-RECOVERY.md.
Red-first rejection: 2 failures; queue: 3 failures; crash window: 1 failure;
422: 3 failures / 1 existing containment pass. Final affected suites: 122 pass,
0 fail, 0 skip. Reproduce with node test-support/run-receipt-regressions.mjs;
public-source temporary copy, minimal environment, synthetic loopback data only.
No push, deploy, private data access, version/image workflow or bundle changes.
Parent owns final review/integration and full suite/build/rollout gates. Earlier
live evidence above is historical and is not validation of this local repair.
