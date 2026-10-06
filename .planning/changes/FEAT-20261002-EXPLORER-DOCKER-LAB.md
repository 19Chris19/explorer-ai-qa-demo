# Explorer Docker rehearsal

## Source and deployment evidence (retrospective)

Implementation-SHA: 934b5dfe94f7193eac9eeab5983b5baa7cdca3ca
Handoff-SHA: b55680799e18703a81e5491c883a46b34db3ceb3
Production-Deployment: Not deployed to production by this change; local lab only.

The implementation commit and docs/DOCKER_REHEARSAL.md record actual isolated
lab startup and synthetic acceptance. This is not a claim that nothing ran.
Existing production services were excluded. No current runtime was inspected
for this retrospective record.


- User goal: reproduce Provider A plus website deployment on Linux containers, with no real accounts.
- Baseline: 6a84ca7a734857067a0575dac393b765aa0cb428.
- Branch: codex/FEAT-20261002-EXPLORER-DOCKER-LAB.
- Scope: explicit container upstream address, bridge-network Compose, streaming Nginx, synthetic tests and recovery documentation.
- Safety: only lab resources; host 3117/4317 and existing containers untouched. No production credentials, questions or account data.
- Verification: 36 tests pass; ARM64 empty pool and synthetic SSE checks pass; both AMD64 images build/start (emulated, with load caveat). Named-volume recreation and restore to new volumes pass. Desktop/mobile table and history checks pass. See docs/DOCKER_REHEARSAL.md.
- Corrections discovered: host-only URL validation; missing non-root named-volume initialization; disabled admin still visible in local page; too-short health-check startup grace under load.
- Rollback: compatible prior website image is retained, no data overwritten. Production 3117/4317 remain untouched.
- Handoff review: distinguish the Docker gateway port 4417 from the direct-Node 4317 example; expose optional /qa-app asset prefix without changing the root-path lab default. Main-site integration remains unverified.
- Rollback: stop only lab services; switch image without overwriting persistent state.
