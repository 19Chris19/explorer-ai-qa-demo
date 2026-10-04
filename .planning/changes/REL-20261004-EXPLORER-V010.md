# REL-20261004-EXPLORER-V010

## User goal

Publish the accepted UI and BFF from private main 2dd38865 as v0.1.0. Deliver
native Node and versioned ARM64/AMD64 Docker paths; Docker operators should not
need host Node. Keep Provider A independent and credentials/data outside Git.

## Reviewed sequence

Deployment release first. Website v0.2.0 later reproduces the main-site shell
and improves the same-origin adapter; Provider v0.5.0 separately receives generic
UI polish. Each later visual candidate is shown on 4318 before promotion.

## Work units

1. Failing tests for fresh-only container configuration and image publication.
2. Add container-run configuration and a scoped Docker lifecycle wrapper.
3. Add private versioned image workflow and release/compatibility instructions.
4. Clean install/tests/build, isolated Docker acceptance and reviewed private PR.

## Safety and rollback

No 3117/3317/Bot restart. The wrapper defaults to loopback and independent
volumes, never regenerates existing credentials, checks queues before code
switches, and never replaces current runtime with old backups. Provider image
changes require its separate procedure. Real QA, native mobile keyboard and a
cloud host's long-running operation are separate acceptance items.
