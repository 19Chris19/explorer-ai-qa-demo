# Docker page initialization without an admin link

## Source and deployment evidence (retrospective)

Implementation-SHA: af5ce7fc2696ae43049a2a79487d05f97106814b
Recorded-Docker-Source-SHA: af5ce7fc2696ae43049a2a79487d05f97106814b
Evidence-Record-SHA: c9978f01a531f2519fe78f4023610993fdba56c7

Deployment was recorded, not merely planned: docs/DOCKER_ACCEPTANCE_20261004.md
and the evidence commit report the Docker website/gateway switch at 4417.
They explicitly exclude 4317 and Provider replacement in that window. This is
historical source-level evidence, not a verified registry digest or a current
runtime observation; neither is invented here.


- User goal: deliver the accepted UI through the isolated Docker website without exposing administration.
- Reproduction: Nginx assets and health succeed, but the server removes `.admin-link` and the UI writes to a null node before rendering the welcome view.
- Change: make the optional administration affordance null-safe; do not restore the forbidden route.
- Verification: failing then passing synthetic UI test with the link removed, full suite, Docker browser welcome and answering checks.
- Rollout: merge into the frozen Docker candidate; update only Docker website/gateway after idle proof.
- Rollback: revert this small commit. Provider A and persistent data remain untouched.
