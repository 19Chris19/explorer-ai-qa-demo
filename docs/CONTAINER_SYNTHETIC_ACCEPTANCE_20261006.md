# Isolated website container acceptance

## Fixed candidate

- Date: 2026-10-06. Synthetic candidate acceptance only, not a release or cutover.
- Source: `b764a93714af2c1d8010ec3e0250e84a5b1d3c8c`, exported with `git archive`.
- Image: `explorer-consolidation-synthetic:b764a93-sj1eod`.
- Image ID: `sha256:e27d316a20accb78a3840b4051f36cd718563a1d216d1389e8e026456a1e04f8`.
- Isolated Compose project: `explorer-synthetic-sj1eod`.

## Isolation

Reviewed the candidate's Compose files, configuration generator, fake provider,
Dockerfile, build script and verifier before execution. A fresh temporary Git
archive supplied all code; no original worktree, live configuration or runtime was
copied. The configuration generator created fresh synthetic API/internal/admin and
cookie keys. No values are retained in this report or committed.

Used `compose.linux.yaml` plus `deploy/docker/compose.synthetic.yaml`, explicit
synthetic image/revision variables, `--env-file /dev/null`, and a temporary override:
automatic restart disabled; both networks internal; a two-owner synthetic archive
mounted read-only. An ephemeral loopback binding was requested, but Docker published
no host port with these internal networks. All HTTP checks therefore traversed
container-internal Nginx -> BFF -> fakeProvider; no existing host port was used.

One serial build used `COMPOSE_PARALLEL_LIMIT=1`; startup used `--no-build --wait`.
Provider used the reviewed Node fixture, not the real Provider application; Nginx
used `nginx:1.28-alpine`. BFF and fakeProvider healthchecks passed; Nginx was running
without a Docker healthcheck. Build-time package/registry access was allowed;
running services had no external network or IMA requests.

## Results

The existing verifier's assertions ran with only temporary transport adjustments:
internal gateway/provider URLs, fresh process environment, /tmp checkpoint and
direct internal fetch instead of host Docker-exec transport.

- HTML and listed browser assets served; BFF connected/authenticated, supported
  the contract and reported synthetic capacity 1.
- Ordinary/internal token separation and blocked management/private paths passed.
- Conversation ownership, duplicate rejection and follow-up passed.
- SSE first chunk 25ms; sources/deltas, exactly one done event, and streamed text
  matching restored Markdown/table history passed.
- Queue edit/delete, upstream disconnect and cancellation passed.

Additional synthetic archive assertions through Nginx passed:

- Each owner listed only its own archive; query/header owner spoofing, cross-owner,
  missing-cookie and forged-cookie access could not disclose the other archive.
- Archive responses did not expose owner identifiers.
- Six mutation/non-GET methods on list and detail produced 12 HTTP 405 responses.
- Archive events, queue lookup and native-delete routes returned 404; ask/queue
  with archive IDs returned 400, not SSE. Fake-provider metrics were unchanged.
- New native conversation was not archive-prefixed, reported legacyMode false,
  completed SSE, restored two messages and incremented dispatch exactly once.
- Archive hash remained unchanged, mount RW=false, both networks Internal=true.
- Repeated `no-store` directives from Nginx/BFF were accepted as equivalent.

Local parser test command:
`node --test test/history-archive.test.mjs test/archive-export-interop.test.mjs`.
Result: **4 passed, 0 failed, 1 skipped**. Actual export -> parse was **skipped**
because `PROVIDER_A_TRANSFER_TEST_MODULE` was unset. The parent's separately
reported actual-export 5/5 is distinct evidence and is not credited to this Docker
run. Subsequent exporter preflight upgrades were not covered by this fixed image.

## Cleanup and limits

Exact-project `down --volumes --timeout 10` removed all three new containers, two
volumes and two networks. Follow-up project-label listings were empty. Fresh
synthetic env files were removed. The image was retained. No existing project or
container was stopped, no prune was run, and no application patch was required.

This covers HTTP-served assets and container integration, not rendered-browser
click/screenshot acceptance. No full repository suite, actual-export rerun, real
upstream validation, live migration, production restart or release was performed.
Temporary one-off runners are not shipped as a reusable acceptance harness.
