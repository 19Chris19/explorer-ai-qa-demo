# REL-20261004-EXPLORER-V020

## Goal and authorization

The user accepted the 4318 main-site candidate on 2026-10-04 and authorized
publication. Freeze the accepted UI from b6bb34f8 (documentation a553b78),
publish private v0.2.0 through PR/CI, then promote the website only to Air
4317 and the Docker website. Preserve runtime, credentials and all accounts.
The narrow-screen hidden sidebar is accepted for this version; no new drawer.

## Release scope

- Align package, lockfile, default image and current deployment documentation.
- Include the independently committed host adapter, shell assets and overlay fix.
- Keep the public Provider A baseline at v0.4.1; no Provider/Bot restart.
- Merge triggers the approved Vercel asset-allowlist deployment. Check its
  preview before merge and the stable public route after the Air switch.
- Keep the image private; validate native ARM64/AMD64 gates and attach the
  accepted source/image manifest before publishing the draft Release.
- Air may use a fixed-source local Docker build while private GHCR login is
  unavailable. Record its source revision and local image ID, not a registry
  digest that was not pulled. No registry permissions or token scope expansion.

## Gates and rollback

Clean installation, full tests/build/scans, private repository and CI review,
synthetic root/subpath and proxy tests; queue idle proof and private backup
before switching each writer. Keep an immutable prior website artifact and
Docker image/configuration. Roll back code only against current data.

No real IMA question without a separate explicit verification window. No main
site production deployment, v0.5.0 Provider changes or automatic Skill install.
