# Clean candidate installation evidence

## User goal
Publish a reproducible website and fixed Provider bundle without affecting existing Air services or accounts.

## Change
Record clean-source ARM64 server-mode installation of website 173c35a with Provider runtime 2ecd5df and tooling 38cf9e1. Keep earlier acceptance as dated history and distinguish local images from published artifacts.

## Verification
Installer completed; protocol check passed with empty capacity; gateway blocked admin/internal paths; repeated init rejected with configuration hashes unchanged. No IMA call or existing state used.

## Rollout and rollback
Documentation only. Final registry/tag installation remains a release gate. Revert this documentation commit without modifying runtime volumes.

## Release notes
Added v0.2.1 preparation notes describing fixed Provider v0.4.2 delegation, private image access, Node/Docker upgrade and code-only rollback. Formal publication and final artifact verification remain separate gates; no additional platform or real-account success is claimed.

## Fixed released dependency
Provider v0.4.2 is now published at dc966550, with accepted ARM64/AMD64 image digest e8c8bdea801f862d12ffee4015b4ae2f39e26ea34e6fd87db39db082003da8b8. Anonymous pull, clean tag server install and isolated authentication checks passed. Enable released bundle mode to verify fixed Provider source origin/tag, while keeping website publication and real-account acceptance explicitly separate.
