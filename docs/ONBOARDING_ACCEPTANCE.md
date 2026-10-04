# v0.2.1 onboarding candidate

Date: 2026-10-04. Baseline e99aff24 (v0.2.0). Depends on Provider v0.4.2, not yet released.

- New adapter uses Provider-owned shared metadata / guided helper modules, not a copied QR implementation.
- Existing install and private configuration remain protected; generated state is excluded from source and image.
- Synthetic configuration/delegation checks: passed, including unavailable helper blocking and repeated resume without credential reset.
- Full application tests: 87/87 passed; build passed. Missing unpublished Provider tag blocks before installation; explicit local candidate tooling doctor passed.
- Container and clean packaged-source final checks: pending final rehearsal.
- Windows native and maintenance-to-Linux SSH: NOT RUN (platform/server not supplied).
- Fresh account scan, verified library response and real question/follow-up: NOT RUN (requires human and a new authorized account).
- Existing 3117/3317/4317/4318, Bot and Docker services are not restarted by this candidate preparation.

No public PR, Release or cutover has occurred. Do not describe this candidate as already shipped.
