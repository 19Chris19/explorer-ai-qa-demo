# Clean candidate installation evidence

## User goal
Publish a reproducible website and fixed Provider bundle without affecting existing Air services or accounts.

## Change
Record clean-source ARM64 server-mode installation of website 173c35a with Provider runtime 2ecd5df and tooling 38cf9e1. Keep earlier acceptance as dated history and distinguish local images from published artifacts.

## Verification
Installer completed; protocol check passed with empty capacity; gateway blocked admin/internal paths; repeated init rejected with configuration hashes unchanged. No IMA call or existing state used.

## Rollout and rollback
Documentation only. Final registry/tag installation remains a release gate. Revert this documentation commit without modifying runtime volumes.
