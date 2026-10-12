# Host-backed online preview

This is a public URL to a real shared account pool, not a production hosting
or access-control service. GitHub repository privacy does not restrict URL
visitors. Host sleep, network loss, tunnel quota or a stopped process will make
the preview unavailable. No daily user quota is promised; technical controls
retain eight pending public turns and ten new submissions per visitor per
minute. Accepted durable tasks share Provider capacity with other enabled clients;
these technical limits are not billing, permanent user quotas or a production SLA.
Current-host acceptance is recorded separately below.
A determined unauthenticated visitor can
still consume IMA capacity. Do not publish the URL without accepting that risk.

## Current host and acceptance (2026-10-12)

The existing preview has moved from Air to M1 Max using the fixed migration
bundle, preserved gateway key, website signing key and persisted state. Air's
old Provider, website and tunnel remain stopped; its robot has not yet been
connected to the new Provider. No Vercel environment change or redeployment was
needed because the original fixed tunnel origin was restored on the new host.

A real first question and same-conversation follow-up passed through Vercel,
including streaming, one success terminal per turn, context and history reload.
Homepage/assets, visitor isolation, blocked management routes and cross-origin
submission rejection also passed. This test used the maintainer's existing
network proxy; other devices and networks remain unverified. Long public answers,
real disconnect/cancel/queue behavior, concurrency and long uptime were not fully
re-accepted in this window. See [migration evidence](HOST_MIGRATION_20261012.md)
and the [colleague guide](EXPERIENCE_AND_DEPLOYMENT_GUIDE.md).

The receiving host has login-start/restart supervision for the Provider, website,
private relay, preview gateway, tunnel and local monitor. Cold boot before user
login, logout/reboot, power loss and off-machine alerts remain unverified or
unconfigured. This is still a preview, not an availability guarantee.

## Topology

```text
browser -> Vercel Node function -> fixed HTTPS ngrok domain
        -> M1 Max preview gateway (loopback) -> website BFF :4317
        -> Provider A :3117 -> IMA
```

Only the gateway key and ngrok address belong in Vercel environment variables.
Do not put Provider A ordinary, internal or admin tokens there. No Vercel
external rewrite directly to the host is permitted. The Node Function is configured
for 300 seconds; each read-only event subscription rotates at 240 seconds and
emits a transport heartbeat about every 15 seconds. The Provider task continues
across rotation or a disconnected viewer. Responses are not buffered or cached.
The new task path has no 180/190-second total execution cutoff. A lost submit
response is reconciled by its original request identity, never by reasking IMA.
See [the durable contract](DURABLE_TASKS.md) and [dated acceptance evidence](DURABLE_TASK_ACCEPTANCE.md).

## Private setup

1. Keep Provider A and the website BFF on the authorized host, with separate
   persisted directories. For migration, first follow the fixed bundle and
   [migration checklist](HOST_MIGRATION_20261012.md): drain/stop the old owners,
   preserve signing/encryption keys and obtain cutover authorization before
   starting a new refresh/dispatch owner. Check integration on the target before
   opening a tunnel. A healthy HTTP process alone is not real QA acceptance.
2. For a new installation, generate one random gateway key of at least 32
   characters in a private secret store. For this migration, preserve the
   existing gateway key and Vercel pairing; do not regenerate it. Set
   `PREVIEW_GATEWAY_KEY` only in the local gateway's private
   launch environment. Start `node preview-gateway.mjs` on loopback port 4327.
3. Reserve a fixed HTTPS ngrok domain and tunnel only to `127.0.0.1:4327`.
   Never tunnel directly to 4317 or 3117. Verify `/admin` and `/internal/`
   return 404 through the gateway even with a valid key.
4. In the private GitHub repository's Vercel project, set Root Directory to
   `preview`. Enable Node Functions with Fluid compute. Set `PREVIEW_ORIGIN_URL`
   to the fixed HTTPS ngrok origin with trailing slash and
   `PREVIEW_ORIGIN_KEY` to the same gateway key. Use production deployment for
   one stable Vercel URL. Do not enable an external-origin rewrite.
5. Verify the first SSE chunk and exactly one `done` for one non-private test
   question and one follow-up. Check history on refresh, cancellation, and
   that an unavailable host returns a controlled failure. These are separate
   acceptance checks; do not infer cancel/outage recovery from a successful
   question. Record only status and timing, never
   question, answer, source, token or session ID.

## Revoke and recover

### Visitor-facing failure boundary

The Vercel function replaces non-success upstream responses, redirect responses,
ngrok error headers and unexpected asset/API content types with controlled
responses. Page navigation receives a self-contained Chinese recovery page;
API clients receive a safe JSON message. Vendor HTML, internal hosts and error
details are not forwarded. Successful SSE remains streaming and unchanged.
The browser also maps caught request and stream errors to curated messages.
Question submissions are never automatically repeated. Read-only task queries
and subscriptions reconnect with bounded backoff; explicit stop uses the
persisted cancellation intent. An unavailable observation connection is shown
as reconnecting, not as a completed or failed IMA answer. Visitors can reopen
the page and resume a known task from recent conversations.

This does not repair tunnel transport or replace browser-generated DNS/TLS errors
when the request cannot reach Vercel. Do not claim continuous availability.

2026-10-09 investigation: local records near 09:30 and 09:40 Asia/Shanghai showed
remote EOF, connection reset, reconnect failure and heartbeat timeout. The user
was actively using the machine. Evidence identifies tunnel transport disruption,
not an account failure or proof of sleep. It cannot distinguish an intermediate
network reset from the remote service closing the connection. No raw logs,
endpoint identifiers, credentials or conversations belong in this repository.

Stop the tunnel first; this immediately disables public access while local
4317/3117 remain available. Rotate the gateway key in both locations if it is
exposed. A rollback of website or Provider A must select the prior code
snapshot without overwriting persistent account or conversation state.

The preview route allowlist is intentionally narrow. `/admin`, `/admin.js`,
`/internal/` and unknown paths are never forwarded. The local admin prototype
is also disabled in the Linux container. The visitor cookie is HttpOnly,
SameSite=Lax and Secure on public preview requests.

