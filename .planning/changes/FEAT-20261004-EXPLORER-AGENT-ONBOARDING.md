# FEAT-20261004-EXPLORER-AGENT-ONBOARDING

- Goal: ship Agent-oriented double-service setup with the preset 3DGS library and Provider-owned maintenance tooling.
- Baseline: private main e99aff24, released v0.2.0. Candidate v0.2.1 depends on Provider v0.4.2 onboarding contract, which is NOT yet released.
- Scope: deployment adapter, Shell/PowerShell wrappers, knowledge preset, compatibility and Agent instructions. No duplicate enrollment implementation; no UI/QA/SSE changes.
- Security: separate volumes and credentials; loopback management; protect existing installs; helper setup before first service start. No automatic shared Provider restart.
- Verification: configuration/delegation synthetic tests, application tests/build and clean-directory checks. Windows native, real remote Linux, new account and real QA NOT RUN.
- Rollout: local candidates only; no Air 4317/4318/3317/3117/Bot/Docker cutover or remote publish.
- Rollback: revert adapter and retain current runtime/account data and previous fixed images.

## Installation rehearsal follow-up

- Delegate login-gated target resolution and optional credential-free manifests to Provider too, rather than requiring anonymous metadata in the website adapter.
- Match the actual Compose service name (`provider-a`) for protected helper checks. Image/port checks precede any human login request.
- Fixed code does not change the webpage or existing runtime. Verify the final candidate separately; earlier Docker evidence remains tied to its own source SHA.
