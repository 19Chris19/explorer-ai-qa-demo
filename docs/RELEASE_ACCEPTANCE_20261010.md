# Paired durable release checkpoint

Date: 2026-10-10, Asia/Shanghai. Candidate website v0.3.0-rc.1 explicitly depends
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

## Publication and runtime are separate

Draft PRs: Provider #14; website #8. Website paired-container CI stops at missing
v0.5.0-rc.1 image. Publish and accept Provider first, then rerun; do not replace it
with old fake SSE. The protected Vercel preview deployed from 25721c5 but has not
passed browser acceptance. The user controls the Ego verification space; do not
take control or create a bypass space.

Current Air stable/public website remains consolidation-32d469ce; 4318 serves
durable-418cbdb0 and Provider serves 97dbb5c. Public connectivity and management
blocking passed read-only checks; this is not a new candidate deployment. No live
service, signing key, account pool, pending queue or history changed here.

RC choice, local skill drift review, protected preview, paired image manifests
and fresh idle/backup proofs remain before promotion. The skill candidate passes
13 synthetic checks but is not installed automatically. Previous dated real IMA
evidence remains in DURABLE_TASK_ACCEPTANCE.md; no new real or phone acceptance.

Use fixed artifacts and one writer per runtime. Website PR merge deploys only
Vercel forwarding; Air needs its own authorized cutover. Never restore stale data
or re-submit unknown dispatched questions. Current evidence is not cloud uptime.
