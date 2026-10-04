# Explorer Docker rehearsal

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
