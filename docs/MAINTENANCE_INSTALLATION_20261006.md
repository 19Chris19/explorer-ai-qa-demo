# Air maintenance installation checkpoint

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
