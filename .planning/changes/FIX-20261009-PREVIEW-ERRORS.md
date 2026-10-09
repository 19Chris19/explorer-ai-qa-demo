# Preview failure containment

User goal: visitors see designed recovery states, never raw tunnel errors.
Scope: isolated website branch; no account, tunnel configuration or Provider changes.

Evidence: on 2026-10-09 local tunnel records at 09:30 and 09:40 +0800
show remote EOF, connection reset, reconnect failures and heartbeat timeout.
These identify a tunnel transport failure, not its ultimate network operator.
No private logs, endpoint names or credentials are included here.

Plan: normalize proxy HTTP failures and unexpected response types; use standalone
Chinese HTML for page requests and controlled JSON for API calls. No retries of
questions or mutations. Preserve successful streams and cancellation. Test failures
with synthetic vendor bodies, redirection and offline conditions.

Rollout: preview and explicit live-release approval required; no live changes yet.
Rollback: revert only proxy code, never restore old session or account data.

Verification: full Node suite, build and release-file scanner passed locally.
Synthetic tests cover 3xx/4xx/5xx vendor bodies, unexpected success MIME, ngrok
error headers, offline exceptions, HEAD, preserved SSE and no automatic retries.
Browser errors use curated messages instead of raw exception text. Live rollout
remains pending explicit authorization. Desktop and 390x844 browser checks pass;
the recovery page has no horizontal overflow. Real phone remains unverified.
