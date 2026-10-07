# Three-path candidate acceptance

Date: 2026-10-07. Baselines: Explorer v0.2.1 and Provider v0.4.2.
This document describes candidate source, not a new Release or a running shared Air service.

## Implemented boundary

The browser still talks only to its own BFF. Shared BFF mode uses a fixed Tailscale
HTTPS origin and a site credential; it does not receive Provider API, internal,
administrator or account credentials. Independent mode retains the existing
Provider transport. Missing shared credentials never cause an independent fallback.

Shared cookies use a separate signing key. Each deployment's gateway identity
remains stable when its site token rotates. Existing local history is not silently
migrated across Provider modes; use a fresh installation for shared mode.

## Evidence

| Check | Evidence / result |
| --- | --- |
| BFF transport | Synthetic URL restrictions, no redirects, route mapping, cancellation signal and capability checks passed |
| Visitor cookies | Actual isolated BFF rejects empty/legacy Provider signatures in shared mode; independent key required |
| Gateway interoperability | Actual client + gateway with synthetic Provider: two deployments, same visitor, cross-site read/delete denied; rotation preserves access, revoked token denied |
| Stream fidelity | Synthetic GFM table SSE passed byte-for-byte through the gateway |
| Early rejection | Shared inputs over 1200 code units rejected before ledger/queue changes; independent limit unchanged |
| Initial full regression | 179 passed, 2 optional integration skips before final integration; final count belongs in PR evidence |
| Container checkpoint | ARM64 image built from 3160d8d; network-disabled synthetic container served page 200, health 503, configured=true, connected=false, ready=false; stopped and removed after check |

## Final integrated checkpoint (2026-10-07)

- Explorer code `5cb5711` and Provider code `9ba954c`: both full Node test
  suites exited successfully, including the explicit cross-repository gateway
  integration. Optional platform tests remain skipped; no claim of Windows execution.
- Explorer build and `check:release` passed (209 release files; no private paths
  or key patterns). Installer environment tests reject ambient Node preload and
  disabled TLS verification. Old/new Provider wrapper syntax is tested separately.
- Final Linux ARM64 image built from `5cb5711`, local tag
  `explorer-shared-candidate:20261007-final`. An isolated network-disabled
  container returned page 200, health 503, configured=true, connected=false,
  ready=false. Only obvious synthetic credentials were used; the container was
  removed. This is not a Tailscale or full remote Compose acceptance.
- No release, production upgrade, account access or real IMA request occurred.

Cross-repository synthetic test:

```sh
PROVIDER_A_SHARED_GATEWAY_TEST_MODULE=/absolute/reviewed-provider/src/shared-gateway.js \
  node --test test/shared-gateway-interop.test.mjs
```

The test substitutes loopback transport for the fixed HTTPS origin. It proves
request/response interoperability, NOT certificates, Tailscale or remote DNS.

## Opening is blocked until network acceptance

Read-only Air check on 2026-10-07 found no `tailscale` on PATH or standard
`/Applications/Tailscale.app`; 3117 listens on all interfaces. No account state or
private configuration was read or changed. No gateway was exposed, no Provider
was restarted, no IMA question was sent.

Before inviting a colleague, the operator must approve installation/login, review
tailnet rules and raw-Provider bypass paths, then verify a second approved device
and its Docker container. Use Provider's `docs/SHARED_NETWORK.md`. Do not relax TLS
or allow arbitrary upstream URLs to work around missing connectivity.

Not verified: real Tailscale Node/Docker HTTPS/SSE, unapproved-device denial,
Windows native interaction, real scan/account authorization, real first question
and follow-up, long-running Linux availability. These are not implied by passing
synthetic CI or an HTTP health response.

## Rollback

Keep the three-path installation and gateway changes in separate reviewable
commits. Stop only the candidate gateway/site being tested; revert code without
overwriting newer conversations, account data or signing keys. Existing 3117,
3317 data, 4317, 4318, Docker website and Bot are not part of this rollout.
