# FIX-20261004-EXPLORER-PUBLIC-ASSETS

## Goal and boundary

Publish the accepted website UI and update the Air stable website without
changing Provider A, accounts, Bot, Docker services or the 4318 preview.
The Vercel proxy omitted four modules already allowed by the Air gateway.

## Implementation and acceptance

Add a regression test covering every local static dependency of the application
entry point through both proxy allowlists. Permit the missing modules only for
GET/HEAD; keep administrator, internal, unknown and write routes blocked.
Run the full tests, clean build, staged release scan and governance checks.

## Rollout and rollback

Merge the focused fix into the private release candidate. Verify the protected
Vercel preview before the approved production merge and idle Air cutover.
Use an immutable website and gateway release with the existing private config
and persistent data. Rollback switches code only after stopping the new writer.
No real question is submitted unless separately authorized.
