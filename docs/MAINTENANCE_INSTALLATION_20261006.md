# Air maintenance installation and consolidation

## Current result, 2026-10-06

The following result supersedes the initial-install checkpoint below. This is
an authorized local rollout, not a published tag or production-server acceptance.

| Entrance | Fixed website source | Current upstream | Maintenance |
| --- | --- | --- | --- |
| 4317 / Vercel origin | `32d469ce` | Air 3117 | OPEN, generation 4 |
| 4318 preview | `32d469ce` | Air 3117 | OPEN, generation 4 |
| 4417 Docker / Nginx | `32d469ce` | `host.docker.internal:3117` | OPEN, generation 4 |

The Air Provider is the reviewed customized `35bd3943` candidate, not a public
tag replacement. Five account identities are stored; eligible concurrency is 2.
The newly imported disabled identity failed its single authorized qualification
run with `upstream_failure` after one request, so it is not counted as available.
There was no automatic retry. Bot process stayed running; its private maintenance
gate reopened at generation 17 and host topology returned READY (5/5).

Source 3317 is stopped, restart disabled, enrollment helper disabled/unloaded;
its original volume is retained and marked retired. Do not start it or the old
helper without the reviewed account-transfer rollback process. Never let both
instances renew the transferred identity simultaneously.

4318 and 4417 load a private readonly archive, retaining their original cookie
secrets and runtime volumes. Six nonempty conversations/eight turns are visible
to their original owners; all six detail responses on both entrances matched
original question/answer content and rejected another visitor with 404. Six empty
shells were excluded from the list with explicit operator approval, not deleted
from the source volume or backup. No archive record resumes an old IMA context.

Real serial acceptance through 4318 passed one question and one follow-up:
1129/1064 delta events, 26/28 sources, exactly one success terminal each, no error
events, stream/history equality both times, first-answer Markdown table present.
Elapsed times were 32345/21418 ms. This validates the existing eligible pool,
not the newly imported identity. No extra real probe was sent through Docker or
the public link. Vercel root/health returned 200 with the new 4317 revision;
`/admin` and `/internal/` returned 404.

Private receipts retain original launch configurations, encrypted transfer bundle,
stopped-writer backups and rollback artifacts. Roll back website code/configuration
only; never overwrite new sessions with old snapshots. Docker rollback must keep
the unified upstream until a separately coordinated Provider rollback is performed.
Local compose overlays preserve independent website and archive volumes; they are
private operating configuration, not new-user defaults.

New installations still receive their own independent Provider and volumes, never
an automatic connection to this Air. New-login, Windows/SSH maintenance, physical
mobile keyboard and long-running Linux acceptance remain unverified. No remote
PR, tag, image publication or Release occurred in this window.

## Initial installation checkpoint (historical)

The user authorized the first-install short downtime and possible in-flight
interruption. This is a local installation record, not a public release or
completed Provider/account migration.

| Entrance | Fixed website source | Gate | Provider connection |
| --- | --- | --- | --- |
| 4317 | `32d469ce` | Installed, checked CLOSED/drained, reopened | Existing 3117 |
| 4318 | `32d469ce` | Installed, checked CLOSED/drained, reopened | Existing 3317 |
| 4417 | `32d469ce` | Installed, checked CLOSED/drained, reopened | Existing Docker 3317 |

Each instance owns a separate private maintenance directory. Configuration and
runtime backups were captured outside Git; runtime snapshots were taken only
after stopping the corresponding old website writer. Existing cookie settings,
queues and ledgers were retained. Docker website used its existing data volume;
its new image is `codex-explorer:consolidation-32d469ce`, local-only. Nginx was
reloaded after the BFF container was replaced. Both Provider processes and the
Bot remained running unchanged.

Health/contract checks returned HTTP 200 for all three websites after reopening.
They do not prove real-question success. No real question was sent for this
maintenance installation. The original website artifacts remain available;
rollback must switch code only, never overwrite current runtime with backups.

Readonly Docker history and switching 4318/4417 to 3117 are still pending the
separate consolidation gates. The latest read-only history audit found 6
nonempty conversations (8 turns) and 6 empty shells. Explicit handling of empty
shells is awaiting the operator's choice; no history was silently omitted.
