# Isolated website maintenance acceptance (2026-10-06)

Status: synthetic candidate evidence only, not deployment approval.

## Fixed source and images

Source: `7d0a05cb42f2d46e0726c2b79a92ecc779b068e6`, containing
`c08e7c62` maintenance drain and strict queue preservation. Independent docs
branch: `codex/DOC-20261006-WEBSITE-DOCKER-DRAIN`.

Docker Engine 29.2.1, all three images `linux/arm64`. Builds ran serially.
Exact image IDs returned by `docker image inspect`:

| Image tag | Image ID (sha256) |
| --- | --- |
| codex-web-drain:bff-7d0a05cb-qj1zp0 | b5cf2cbef26f34c1e498309b193617e01049a14c488fe18cabf9be6c08f4e903 |
| codex-web-drain:provider-7d0a05cb-qj1zp0 | 681cee7c016c32fb748ba5ea1062b4ed4e5a7954bcc7e262b59950f0369f7971 |
| codex-web-drain:nginx-7d0a05cb-qj1zp0 | 0e17eabc5624a35eb8443f2522d37f43c1c8b0e9203503313233cab402f52869 |

BFF revision label equals the full source SHA. Fixture and gateway images have
no revision label; their inputs were copied from the same fixed archive.
Node base digest: `43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c`.
Nginx base digest: `a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236`.

Tracked context was exported with:

```sh
git archive --format=tar --output="$TMP/source.tar" \
  7d0a05cb42f2d46e0726c2b79a92ecc779b068e6 \
  Dockerfile .dockerignore package.json package-lock.json public scripts deploy \
  .env.example '*.mjs'
```

Archive SHA256: `c0aad058da0f777c2f76c1012ea3de07c6952f41e6533cf4e58683e2145595cc`.
127 entries, no links or runtime/node_modules/.docker-lab/.git/private env files.
The tracked blank/synthetic `.env.example` is intentionally included.
BFF used the original Dockerfile, including successful `npm ci` and build.
Fixture used `node:22-bookworm-slim` plus tracked
`deploy/docker/synthetic-provider.mjs`, running as `node`.
Gateway used `nginx:1.28-alpine` plus unmodified tracked
`deploy/docker/nginx.conf` and `nginx -g 'daemon off;'`.

## Isolation and method

Unique resource prefix: `codex-web-drain-7d0a05cb-qj1zp0`.
Network ID: `90e922678d11ab855607fa3220e8131d958bae2f5f0d5fe1d6d6cc250a14a29b`.
Inspection confirmed `Internal=true`, exactly three containers, read-only roots,
empty port bindings, no binds or volume mounts, and `no-new-privileges`.
No host ports, existing resources, account mounts, live configuration or tokens.
Build-time registry/npm downloads were allowed; runtime used only the new
internal network. This is a chain test, not `--network none` single-container testing.

Network aliases were `provider-a`, `explorer-qa`, `gateway`. Assertions ran using
`docker exec -i <bff> node --input-type=module` and fetched
`http://gateway:8080`, traversing Nginx and BFF to the synthetic Provider.
Temporary harness files were outside Git, never read `.docker-lab/provider.env`,
and used only obvious synthetic tokens, signed synthetic owner cookies and two
synthetic archive records. The existing `scripts/verify-docker-lab.mjs` was read
as reference, not executed because it uses host ports and a local env file.

BFF environment enabled the private file gate at `/control/state.json`, archive
at `/control/archive.json`, runtime at `/var/lib/explorer-qa`, disabled admin,
and selected `http://provider-a:3000` with synthetic ordinary/internal tokens.
`/control` and runtime were independent uid/gid 1000 tmpfs, mode 0700;
state/archive files were 0600. BFF `/tmp`, Provider `/app/runtime`, and Nginx
`/tmp`, `/var/cache/nginx`, `/var/run` were tmpfs. No host state was mounted.

The bootstrap created CLOSED generation 1 then OPEN generation 2 before starting
the original BFF. Subsequent transitions used the actual private CLI:

```sh
node scripts/maintenance.mjs close --generation 2 --operation-id synthetic-drain
node scripts/maintenance.mjs check
node scripts/maintenance.mjs open --generation 3 --operation-id synthetic-drain
node scripts/maintenance.mjs close --generation 4 --operation-id synthetic-paused
```

## Results

Nine assertion groups passed, plus Provider auth/dispatch checks:

1. Synthetic startup health reported ready and supported contract.
2. Gateway returned 404 for `/admin`, `/admin.html`, `/admin.js`,
   `/internal/provider-a/capacity`, `/api/admin/accounts`, `/api/qa/admin`,
   `/.env.local`, `/server.mjs`.
3. Start a `synthetic slow` SSE, enqueue its next turn, then close generation 3.
   New POST ask, queue and conversations each returned 503, `Retry-After: 30`,
   and exactly `{error:"问答服务维护中，请稍后重试。"}` with no private counts.
4. While CLOSED, archive list/detail remained readable for the signed owner;
   another owner's detail and forged-cookie access returned 404. Owner query
   and `X-IMA-Client-Id` spoofing did not change the list. No ownerKey in the list;
   DELETE archive returned 405. After reopening, archive IDs were rejected by
   ask and enqueue with 400.
5. Existing direct SSE and queued SSE each completed with `event: done` after
   close. Private CLI changed from exit 2 (not drained) to exit 0 (drained).
6. Reopen, start `synthetic slow disconnect`, enqueue another turn, close
   generation 5. SSE ended with error and no done; inflight returned to zero,
   but the queued job became paused. CLI correctly remained exit 2.
7. Owner DELETE of that paused job remained allowed while CLOSED and made the
   private drain check succeed. No claim of automatic paused-job recovery.
8. Private directory/file modes were 0700/0600; stale-generation open failed.
   Temporarily malformed synthetic gate state caused new-conversation 503 and
   CLI exit 1; original synthetic bytes were restored.
9. Inside the built image, an independent synthetic queue restored expired
   pending work as paused with expiredPending=1, without dispatch. `[null]`
   storage was rejected without modifying its bytes.

Provider ordinary and internal routes both rejected unauthenticated requests
with 401. Final fixture metrics were `dispatched=3, cancelled=0`: only the first
direct request, admitted queued turn and deliberate disconnect were dispatched;
denied submissions, archive IDs and paused work did not reach dispatch.
The deliberate upstream disconnect is not a client-abort test.

Observed private snapshots (preview counters were zero throughout):

| Checkpoint | generation | inflight | activeDirect | running | queued | paused | pending | drained |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Closed during direct SSE | 3 | 1 | 1 | 0 | 1 | 0 | 1 | false |
| Admitted work completed | 3 | 0 | 0 | 0 | 0 | 0 | 0 | true |
| Disconnect with queued follower | 5 | 0 | 0 | 0 | 0 | 1 | 1 | false |

Additionally, `node --test test/maintenance-storage.test.mjs` passed **35/35**
on the docs worktree, including actual synthetic BFF startup rejection before
snapshot publication for invalid rows, duplicates, malformed JSON and non-array
storage. These are host-side tests, distinct from the container module checks.

## Cleanup and limitations

Removed only the three named containers, their internal network and three image
tags/IDs. Filtered container/image listings were empty afterward. Temporary
archive/context/harness files were removed. Shared base images and builder cache
were left alone; no global prune. No merge, push, service restart or deployment.

This is bounded Linux ARM64 synthetic acceptance, not real IMA/account evidence,
AMD64 acceptance, long-duration testing, UI/browser testing, persistent-volume
restart durability, multi-replica coordination or production ingress validation.
Preview waiters were observed at zero, not exercised with nonzero contention.
No full npm test suite rerun; the Docker build and focused 35-test storage suite
were run. The website repository has no `scripts/check_governance.py`; that root
pipeline checker is unavailable here, not reported as passed.
Installation maintainers must still coordinate archive-before-upstream-switch,
per-consumer ingress closure and private drain checks in an authorized window;
this report does not establish that port 3117 has been migrated.
