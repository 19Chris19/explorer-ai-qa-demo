# FIX-20261004-EXPLORER-PUBLIC-ASSETS

## Source and deployment evidence (retrospective)

Implementation-SHA: 44979f8abab9bb386ed426cc7d916006a7c83563
Recorded-Stable-Source-SHA: 05a1cce4a8f2304cd2e2e5631b77ad0c55509d51
Evidence-Record-SHA: a553b78fa01fd6961f791030cc894335a9de927d

The implementation commit described gated rollout, not completed deployment.
Later docs/MAIN_SITE_ACCEPTANCE_20261004.md records 4317 and the public Vercel
preview using stable-05a1cce4. The implementation is an ancestor of that source.
This supports historical inclusion, not an independently observed Vercel
platform deployment ID or present-day runtime state. Those are unknown in this
read-only source audit; new promotion remains blocked on separately authorized
runtime/platform verification, not inferred from an implementation SHA.


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
