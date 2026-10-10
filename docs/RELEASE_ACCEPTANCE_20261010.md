# Paired durable prerelease publication and rollout

Date: 2026-10-10, Asia/Shanghai. Published website v0.3.0-rc.1 explicitly depends
on Provider v0.5.0-rc.1. Stable defaults remain website v0.2.1 / Provider v0.4.2.
Tested website: 25721c52b5343fa5aa7273055b7085a84d5e498c.
Tested Provider: 7368be779040d049824f8ff37aeb7bffcb8172d8.
Later evidence-only commits do not change these tested implementations.

Final local tests/build and 241-file private-path/key-pattern scan passed.
GitHub tests/build passed. ARM64 and AMD64 application images build and pass
network-disabled startup/private-management blocking. Air-enabled Provider image
also starts on both. AMD64 is emulated, not server performance evidence.

Final Node/BFF/gateway/real Vercel-handler synthetic run: 371589ms, one observer
rotation, one dispatch, one terminal, exact whitespace/history. It emulates the
tunnel hop locally; it does not prove real public network recovery. Actual
Nginx/BFF/Provider containers passed on ARM64 and emulated AMD64: replay,
owner isolation, cancellation,
sources/history and indeterminate restart without re-dispatch. No real account
or IMA credentials are used in these checks.

## Published artifacts

User approved RC publication, local cutovers, skill update and resumed the same
Ego verification space. Provider #14 merged as cd79ee6f9a058805f664ee8591d1bc0b0c0947f7;
website #8 merged as 2b029bdc36c6ef336f545e50408a1b04cd636c67. Both are published
prereleases, not stable Latest. Website CI reran successfully after the fixed
Provider image became available; no legacy fixture substitution was used.

Both image workflows passed native ARM64/AMD64 startup and manifest jobs.
Provider anonymous image pull verified; website package remains private and
authorized Air pull passed. Release attachment pins the paired images:

| Component | Registry digest |
| --- | --- |
| Provider v0.5.0-rc.1 | sha256:5280e6155eec6559d9a4c5456ffebb6a3e8fad093e928b831cbf265c697f329c |
| Website v0.3.0-rc.1 | sha256:dd42672d491e2dc5ed4cf4b9ca9f67424fd1295bbaca086715181480b48c962e |

## Protected browser and actual public hop

Protected Vercel deployment from 42026bd was routed, by exact trusted origin,
to the candidate BFF plus synthetic upstream through actual Vercel/ngrok.
The stable origin retained old 4317 during this test. Both delegates kept key
and path checks. Duplicate submit returned the original task; disconnect after
first delta resumed from cursor, with one done event and one history turn.
Table survived completed state and history refresh. Management/internal/unknown
paths were blocked. Unknown-page navigation displayed the designed Chinese
error page, not vendor HTML. Desktop and 390x844 browser checked; no page-wide
overflow, table scroll area and 44px send target retained. Not physical-phone
keyboard or public long-running IMA evidence.

## Authorized runtime switch

Local release skill updated to reviewed 1.0.1, 13 tests and structure validation
passed. Upgrade-advisor instructions still match and were retained. Private
backups, fresh empty ordinary/durable/persisted queues and closed admission
preceded switching one writer per runtime. Same Cookie/config/runtime directories
and Docker volumes were retained; old admin/five-account key/identity preserved.

| Target | Running artifact |
| --- | --- |
| Air Provider 3117 | published cd79ee6f export, recorded previous-admin overlay |
| Air website 4317 | v0.3.0-rc.1-2b029bdc-4317 |
| Air preview 4318 | v0.3.0-rc.1-2b029bdc-4318 |
| Docker website 4417 | fixed website digest above, v0.3.0-rc.1-2b029bdc-4417 |
| Vercel proxy | #8 production deployment, gateway targets new 4317 |

Only Docker website and Nginx were recreated. Dormant Provider 3317 and robot
were not started/restarted. Temporary synthetic origin routing was removed;
final gateway runs the immutable website export. Admission returned OPEN.
Public page, task module, task-list API, capability/version and management
blocking passed. A queue-list request without an owned conversation returns 404
by design; it is not a global queue enumeration endpoint.

## Observed risks and remaining gates

Air load averages exceeded 200 during rollout. Initial Provider readiness timed
out before the single process became ready; health/capacity latency later also
fluctuated (one container readiness returned 503). Three later sequential probe
pairs succeeded (386-3886ms). This is correlated host-load evidence, not proof
of every timeout's root cause. No other user processes were closed. Keep RC and
observe availability; do not call the Air deployment stable/24-hour production.
Provider still listens on all interfaces; review LAN/firewall exposure separately
while preserving the explicit Docker-to-host connection.

Previous real long first/follow-up evidence remains historical in
DURABLE_TASK_ACCEPTANCE.md. No new real IMA question was sent. Fresh real public
recovery, phone keyboard/safe area, Windows/SSH and Linux uptime remain unverified.
This update does not upgrade a colleague's independent installation automatically.

Rollback closes admission and drains tasks before compatible code switching.
Retain new histories, receipts and task logs; no stale backup restoration or
automatic re-submission. Legacy-only code is not a safe automatic fallback.
