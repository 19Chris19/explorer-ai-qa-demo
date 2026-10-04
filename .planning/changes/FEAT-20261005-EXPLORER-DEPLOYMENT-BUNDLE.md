# FEAT-20261005-EXPLORER-DEPLOYMENT-BUNDLE

## Goal
Keep two repositories but give website operators one installation entry and one compatible version pair. The default topology is browser -> website BFF -> dedicated Provider A -> IMA, with separate persistent volumes and credentials.

## Scope
Normalize onboarding/version documentation, centralize version selection, record the resolved pair in deployment/release metadata, and test fail-closed candidate installation. Existing-provider/Node installation remains advanced and explicit.

## Boundaries
No releases, pushes, live service restart, account enrollment or real IMA requests. Do not claim the unpublished v0.2.1/v0.4.2 pair is ready. Windows, remote Linux and new-account QA remain unverified.

## Verification
- Failing-first bundle test reproduced missing implementation; targeted tests then passed.
- Clean npm ci: 0 audit vulnerabilities. Full application suite: 93/93 passed; build passed.
- Shell syntax and Docker Compose config (synthetic image names, no env-file resolution) passed; no containers started.
- Workflow YAML parsed; 49 local Markdown links across changed documents resolve.
- Root governance: 0 failures, 3 existing warnings (dirty root tree, no upstream, worktree count). Root changes preserved.
- Native Windows, real Linux/SSH, image publication and new-account IMA verification: NOT RUN.

## Candidate handoff
Provider documentation companion: codex/DOC-20261005-PROVIDER-DEPLOYMENT-ENTRY. This branch descends from website 9a44cf4; the Provider companion descends from b8a4fbd. Both old candidates are retained. No remote PR or release was made. STATUS remains candidate until a separately reviewed release decision.

## Rollback
Revert this change on the candidate branch. No persisted deployment has been modified; do not restore old account/session data.
