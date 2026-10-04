# v0.2.1 onboarding candidate

Date: 2026-10-04. Baseline e99aff24 (v0.2.0). Depends on Provider v0.4.2, not yet released.

- New adapter uses Provider-owned shared metadata / guided helper modules, not a copied QR implementation.
- Existing install and private configuration remain protected; generated state is excluded from source and image.
- Synthetic configuration/delegation checks: passed, including unavailable helper blocking and repeated resume without credential reset.
- Full application tests: 87/87 passed; build passed. Missing unpublished Provider tag blocks before installation; explicit local candidate tooling doctor passed.
- Clean fixed-source extraction and onboard doctor passed. Explicit reviewed local image/source overrides used because candidate tags are not published.
- Native ARM64 double-service install passed with Provider code 76cd647 and website code 2ae76ca; resume preserved both private env files, repeated init was blocked, capacity stayed 0 and gateway blocked management/internal paths.
- Local website image ID: `sha256:1a81231cf20c5f2f7a52416679ae6ae691c68540e435e907c2dbbaa6c599f832`, source `2ae76caff3f89c2ce658654065a4345beb763890`. Not a published GHCR digest.
- The isolated rehearsal services were stopped and their helper uninstalled; existing services/data stayed unchanged. Private scratch configuration and empty volumes remain local, outside Git.
- Windows native and maintenance-to-Linux SSH: NOT RUN (platform/server not supplied).
- AMD64 execution and login-gated real share resolution: NOT RUN in this candidate.
- Fresh account scan, verified library response and real question/follow-up: NOT RUN (requires human and a new authorized account).
- Existing 3117/3317/4317/4318, Bot and Docker services are not restarted by this candidate preparation.

No public PR, Release or cutover has occurred. Do not describe this candidate as already shipped.

Adapter commits `dcdbb41` and `2ae76ca` are retained on `codex/FEAT-20261004-EXPLORER-AGENT-ONBOARDING`; they depend on Provider's onboarding contract, not its branded UI. Roll back the website adapter before removing Provider tooling. Published v0.2.0 remains untouched; code rollback must preserve current runtime/account volumes.
