# Local Provider configuration preservation

## Goal
Updating Node deployment credentials must not erase maintenance, archive,
privacy or other unrelated installation settings.

## Implementation
Retain non-target lines verbatim, including comments; replace only the six
documented adapter keys. Keep the existing cookie secret and port. Validate all
new values before the existing atomic private-file replacement.

## Verification
Use a copied CLI in temporary directories with synthetic credentials. Reproduce
loss of maintenance/archive/admin flags before the fix, then verify preservation,
repeatability, duplicate target replacement, file permissions and failed-write
input validation. No real configuration or service is accessed.
Regression reproduced on the prior script; focused test passed after the fix.
Installed governance checker ran: its generic assignment regex flags three
unchanged baseline expressions for API/service tokens and cookie generation.
All matches were compared to HEAD; no literal secret was added. The checker is
not reported green; remaining checks passed with historical metadata warnings.

## Rollout and rollback
Candidate only. Revert this commit if necessary; never restore an old private
configuration over subsequently updated installation data.
