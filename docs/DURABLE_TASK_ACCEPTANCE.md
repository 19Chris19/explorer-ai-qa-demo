# Durable QA final isolated acceptance

Started 2026-10-09; final container/documentation closeout 2026-10-10 (Asia/Shanghai).
Status: isolated candidate, not released or deployed.
No real IMA question, account/credential data, production runtime change or remote
push was used. Existing services, robot and Vercel are unchanged.

## Fixed runtime pair

| Component | Runtime source | Branch |
| --- | --- | --- |
| Provider A | 350bc8bdf663e963c8b7bfb0fdd597f40f6348a0 | codex/INT-20261009-PROVIDER-DURABLE |
| Explorer | 418cbdb094ec322c7b0adc7c228a82f4b96f1970 | codex/INT-20261009-EXPLORER-DURABLE |

Closeout commits after these revisions only change evidence/documentation.
Local image identities below are not published registry digests. Published
deploy/bundle.env remains the previous release baseline, not a declaration that
new task features are released. Use explicit candidate images for the fixture.

## Final code results

- Provider complete suite: 804 tests, 798 pass, 6 optional skip, 0 fail.
- Explorer complete suite: 262 tests, 260 pass, 2 optional skip, 0 fail; build
  passed. Separate actual Provider export -> website parser integration: 7/7 pass.
- Enabled Provider integrations: trusted application identity 9/9, actual admin
  backend 1/1, unchanged website history parser 10/10 pass.
- Final Provider task route -> fair queue -> pool -> synthetic native HTTP
  survived 365127ms without upstream bytes and succeeded at 365738ms. Rotation at
  240811ms; one QA POST and two history messages. This is fake HTTP, not IMA.
- Paired Node/BFF/proxy-function real-clock test: 370977ms, one subscription
  rotation, one dispatch, one completion, exact whitespace. It used Provider
  81f24de / Explorer 9adec552 before final pair receipts and safe proxy errors.
  The tunnel was emulated locally, not actual Vercel/ngrok.
- Pair retention/routing: 100 focused tests pass, including 8196 synthetic
  receipts, incomplete exclusions and absolute deadlines that never renew on
  restart. Already-pruned legacy pair metadata cannot be reconstructed.
- Website readiness uses website capability/capacity, not bot capacity. Native
  empty pools are protocol-compatible with capacity zero; classic website mode
  remains incompatible even if the robot is ready.
- Seven synthetic cross-proxy scenarios preserve safe task errors, including
  410 expired events. ngrok headers, HTML, invalid MIME and raw upstream messages
  become the designed generic unavailable response. No automatic re-POST.
- Fixed private Air artifact retains exactly three old admin assets with recorded
  hashes/provenance. Current backend startup and basic-one-question versus
  explicit-advanced consent pass 7/7 using Air Node 22.22.3. No private data copied.
- Website release safety: 232 files, private paths/key patterns pass. Provider
  package dry run: 257 files, 2917118 unpacked bytes, private paths pass.
- Root governance: 0 failures, 3 existing warnings (unrelated dirty paths, missing
  upstream, many worktrees). Named changes pass whitespace checks. The standalone
  skill scanner's unchanged callback-assignment warning was inspected as a false
  positive; that scanner is not claimed entirely green.

Application registration and runnable reservation are complete. Legacy keys
retain legacy identities/history; independent deployment fairness needs distinct
private registrations. Air credentials were not changed. Slots/account default
to 1. Five synthetic accounts show five slots, not a real five-way IMA benchmark.
The existing robot continues its legacy API, not durable tasks.

## Containers and artifacts

Both final platform builds, chain and restart checks passed. Only the isolated
qa-durable-20261009 project is started/restarted/stopped. Its Provider network is
internal, uses fake upstream and mounts no real data. AMD64 on Air is emulated:
compatibility evidence, not a performance result.

The first ARM64 build failed inside npm (exit handler never called). The unchanged
retry succeeded with zero audited vulnerabilities; no dependency/code change
masked that failure. Fixed source archives and website build are prepared privately
outside Git, not deployed. The Air admin overlay deliberately differs from the
public candidate UI; its manifest records provenance. Other runtime files come
from the fixed source.

| Component | Platform | Local image identity |
| --- | --- | --- |
| Provider | ARM64 | sha256:ed80d5be1849af8fa1b9a85ab812b65c6fb150a5ed3269c1584ac6319ca25ed5 |
| Provider | AMD64 | sha256:6b17a2f6944704a6957871a03666cfa05017680fa435d6fa1cefa40e18a8d623 |
| Explorer | ARM64 | sha256:a2091ba07892991917512cf13dfaded4bf32d6bfde5a23aa92fcf8d12e1bf9c9 |
| Explorer | AMD64 | sha256:7aa3bc76324061365deff887e8e2df03672f835faf127bc387d88eb20c30e0e0 |

On both platforms Nginx -> BFF -> actual Provider application with fake upstream
passed replay, duplicate/conflicting submits, owner isolation, exact Markdown,
source/history consistency, explicit stop and management-path blocking. Restart
yielded indeterminate, no fabricated success/history and no redispatch on replay.
Network-disabled image checks found no private runtime/env data. Website data
directory was empty and process UID was 1000. Container Node: 22.23.3.
Production Node 22.22.3 fixed-artifact short chain passed in 2221ms, one dispatch,
one terminal and exact whitespace; it is not a replacement for the long tests.

## Reproduce without accounts

Read deploy/docker/compose.durable-test.yaml first. Never point these checks at
production services or volumes. SYNTHETIC_SCOPE is SHA-256 of literal synthetic-kb.

```sh
npm ci
npm test
npm run build
SYNTHETIC_PROVIDER_SOURCE=/absolute/path/to/provider-candidate \
  SYNTHETIC_DURATION_MS=370000 node scripts/verify-durable-chain.mjs
# Explicit PROVIDER_TASK_IMAGE, WEBSITE_TASK_IMAGE, SYNTHETIC_SCOPE required.
docker compose -p qa-durable-20261009 \
  -f deploy/docker/compose.durable-test.yaml up -d --pull never
docker compose -p qa-durable-20261009 \
  -f deploy/docker/compose.durable-test.yaml port gateway 8080
SYNTHETIC_WEBSITE_URL=http://127.0.0.1:TEST_PORT \
  node scripts/check-durable-docker.mjs
SYNTHETIC_WEBSITE_URL=http://127.0.0.1:TEST_PORT \
  SYNTHETIC_PROVIDER_CONTAINER=qa-durable-20261009-provider-a-1 \
  node scripts/check-durable-restart.mjs
docker compose -p qa-durable-20261009 \
  -f deploy/docker/compose.durable-test.yaml down
```

The restart script rejects other container names. Never add --volumes to down.
For AMD64 override both application service platforms to linux/amd64; a tag alone
is not portable platform selection. Production containers/volumes stay untouched.

## Historical evidence and remaining gates

Earlier pair 866b731 / 05a5bf5 passed ARM64 chain/restart and browser refresh;
390px/1366px DOM checks passed. See DURABLE_TASK_ACCEPTANCE_20261009_INITIAL.md.
These are historical, not visual approval of the final pair. Browser/screenshot
tools are unavailable here; fresh desktop/mobile screenshots, phone keyboard/safe
area, real mobile disconnect and actual Vercel/ngrok recovery remain unaccepted.

Renew maintenance authorization before updating 3117 and 4318 together. Never
update 4318 alone against an old Provider. Real long IMA question/follow-up require
explicit authorization and upstream-terminal/output comparison. Synthetic results
do not prove native IMA equivalence, real per-account parallelism or cloud uptime.
4317, public proxy, PR, release and registry publication remain separate gates.

Before promotion: confirm queues idle, prepare backups and fixed rollback code,
preserve the five-account data and old admin UI. Then verify task capability,
ownership, terminal/history and the authorized real question/follow-up.
Rollback stops admission and drains activity; retain journals/accounts/new history.
Never overwrite them with old snapshots or reask dispatched uncertain work. Older
code must leave unfamiliar task journals archived, never delete them to admit work.
