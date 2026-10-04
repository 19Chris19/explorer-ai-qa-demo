# REL-20261004-EXPLORER-DOCKER-STABLE

## User goal

Freeze the accepted website features, publish them to the private website
repository, and provide a reproducible Docker deployment with straightforward
Provider A account onboarding. Do not publish the root multi-application repo.

## Baselines and boundaries

Website source: root application snapshot 793caf4a; UX feature branches remain
there as independently revertible development history. Private website Docker
candidate: b556807, based on private main 6a84ca7a. Preserve its container-address,
non-root volume and admin-hiding fixes while importing the accepted UI snapshot.

Only the Docker website and its Nginx gateway may be recreated after idle proof
and private backups. Keep the existing Docker Provider image/accounts, 3117,
4317, 4318, Bot and unrelated containers intact. Never regenerate existing
credentials, copy an account database, clear a queue, or restore stale runtime
over newer sessions. Publishing a private PR requires target confirmation;
merging it requires reviewed CI and approval for the Vercel Git deployment.

## Work units

1. Import accepted UX modules/tests and freeze source provenance.
2. Complete static allowlists, versioned Docker build/start path and deployment
   checks. Keep new initialization separate from upgrades; reject overwrites.
3. Run synthetic Nginx/BFF SSE, auth, queue, history and recovery checks. Use
   one explicit non-private real first question and follow-up only when allowed;
   keep answer text, sources and IDs out of Git and reports.
4. Recreate only idle website/gateway with a pinned image and current volumes.
   Verify version, layout, data continuity and rollback on synthetic resources.
5. Private PR/CI and reviewed main merge, with deployment/account onboarding
   limitations stated rather than claiming a production Linux server was tested.

## Acceptance and rollback

Full website tests/build/audit, ARM64 image, synthetic network isolation,
version labels, explicit asset/security routes, desktop/mobile copy/rendering,
backup/restore and code-only rollback. AMD64 startup is compatibility evidence,
not a performance or long-term availability claim. Native mobile keyboard and
real cloud Linux long-term operation require separate acceptance.

Previous website image digest, Compose configuration and private volume backups
are captured outside Git. Rollback replaces code and gateway only against the
current persistent volumes; never roll back Provider account state.

## Acceptance checkpoint (2026-10-04)

Code candidate af5ce7f is active on Docker 4417 with the existing one-account
Provider container unchanged. Latest fixed-source test suite: 72/72, build and
audit pass. Fresh installation, synthetic SSE/queue/history/cancel/disconnect,
fresh-volume restore, ARM64 and AMD64 startup checks passed. Real first table
question and follow-up passed with one success terminal each and exact history
body equality. See docs/DOCKER_ACCEPTANCE_20261004.md for redacted evidence,
the initial automatic code rollback, and explicit unverified items.

Public Provider PR #9 is reviewed, CI-passing and merged without a Release or
runtime deployment. Private website PR/merge confirmation remains outstanding;
do not claim private main, 4317 or the public preview page has this UI yet.

## Approved Air promotion (2026-10-04)

The user now authorizes private PR review/merge and updating Air 4317 to the
accepted frontend. Private PR #3 includes the focused public-module allowlist
fix 44979f8; all 73 tests pass in the working copy and an independently installed
immutable release. GitHub application and Docker synthetic CI passed.

Vercel initially blocked the preview because the local commit author's email
was not linked to GitHub. Configure only this repository's future commits with
the authenticated owner's GitHub noreply identity; do not amend or force-push
published commits. Recheck the resulting preview before the production merge.

Air 4317 must retain its existing 3117 upstream, private cookie/API configuration
and persistent directory. Its previous code anchor is dc2245fe. The public Air
gateway needs the accepted static module allowlist too. Stop the old website
writer before starting the replacement, and never overwrite newer conversations
with the private backup. 4318, Docker services, Provider A and Bot are excluded.
