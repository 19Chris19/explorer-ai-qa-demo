# Docker page initialization without an admin link

- User goal: deliver the accepted UI through the isolated Docker website without exposing administration.
- Reproduction: Nginx assets and health succeed, but the server removes `.admin-link` and the UI writes to a null node before rendering the welcome view.
- Change: make the optional administration affordance null-safe; do not restore the forbidden route.
- Verification: failing then passing synthetic UI test with the link removed, full suite, Docker browser welcome and answering checks.
- Rollout: merge into the frozen Docker candidate; update only Docker website/gateway after idle proof.
- Rollback: revert this small commit. Provider A and persistent data remain untouched.
