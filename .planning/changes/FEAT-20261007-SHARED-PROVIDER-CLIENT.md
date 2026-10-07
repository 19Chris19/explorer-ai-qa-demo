# Shared Provider BFF adapter

- Goal: support invited website deployments without distributing Provider credentials.
- Baseline: v0.2.1; candidate only, no live rollout.
- Scope: fixed Tailscale HTTPS gateway, separate site token, unchanged browser contract.
- Verification: synthetic transport, URL rejection, readiness, cancellation, request mapping; full website suite and build.
- Rollback: revert adapter commit; preserve runtime data and signing key. Do not silently switch existing shared sessions to a different Provider.
- Not verified: second-device Tailscale, Windows, real IMA requests.

## Verification results

- Red first: shared readiness/request tests failed before adapter existed.
- Targeted client/ordinary compatibility: 10 passed.
- Shared signing/legacy-cookie rejection and archive tests: 6 passed.
- Full website suite at initial adapter checkpoint: 179 passed, 2 optional integration skips; build passed.
- Shared mode requires a separate 32-character signing secret and does not accept legacy Provider-signed cookies.
- Governance: no hard blockers; pre-existing scaffold/ownership warnings retained, no unrelated cleanup.
